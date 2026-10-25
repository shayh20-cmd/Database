<# Project Hub — filing helper: the logic, without windows or network. Dot-sourced by the agent, by Run-Task.ps1 and by
   the tests. The pane asks, the server makes a task (pick / tree / open / file), the agent runs it here.
   Paths inside the project are relative, with "/" between folder names, as the server keeps them; every one is
   checked to stay inside the project folder before anything is done. Nothing here deletes or overwrites.
   A "file" task's attachments are saved from classic Outlook on this PC when it has the email (Get-NeededFiles,
   Get-AttachmentMatch, the filters); the server's copy is the fallback.
   The export inbox (Desktop\לתיוק): files exported there are noticed once they settle (Get-InboxState,
   Select-InboxAnnouncement), announced with a notification that opens the hub's inbox window (its https address,
   Get-HubPageUrl, Get-InboxToastXml), and published on request (Invoke-InboxTask) — the one place a file is deleted:
   the inbox's own copy, after it was copied to every place the plan names. A folder the person chooses in the quick
   window's "תיוק" tab (pick-source: ConvertTo-SourceBatch, Save-HelperSource) is published the same way, but its
   files are only copied (Get-InboxTaskSource).
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md
   Saved as UTF-8 with BOM (Windows PowerShell 5.1 reads Hebrew right only then). #>

$script:ConfigPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper.json'
$script:FmProjects = Join-Path $env:LOCALAPPDATA 'FolderManager\projects.json'
$script:KeyPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper.key'
$script:LogPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper.log'
$script:InboxKnownPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper-inbox.json'
# folders the person chose to publish from (pick-source): id → path, kept here; the server only sees the id
$script:SourcesPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper-sources.json'

# ── texts: Hebrew is the source; English when the pane that made the task runs in English. The helper shows only
#    the folder picker; everything else is said in the pane. ──
$script:Lang = 'he'
$script:EN = @{
  'בחר את התיקייה הראשית של הפרויקט {p}' = 'Choose the main folder of project {p}'
  '{n} קבצים חדשים בתיבת הייצוא' = '{n} new files in the export inbox'
  'קובץ חדש בתיבת הייצוא' = 'A new file in the export inbox'
  'פתח' = 'Open'
  'בחר תיקייה עם קבצים לפרסום בפרויקט' = 'Choose a folder with files to publish to a project'
  'אחר כך' = 'Later'
}
function T([string]$He, [hashtable]$Slots) {
  $s = if ($script:Lang -eq 'en' -and $script:EN.ContainsKey($He)) { $script:EN[$He] } else { $He }
  if ($Slots) { foreach ($k in $Slots.Keys) { $s = $s.Replace('{' + $k + '}', [string]$Slots[$k]) } }
  return $s
}
function Write-HelperLog([string]$Text, [string]$Path = $script:LogPath) {
  # one line per event, kept under 200 KB; a failure to log never stops anything
  try {
    if ((Test-Path -LiteralPath $Path) -and (Get-Item -LiteralPath $Path).Length -gt 200KB) { Remove-Item -LiteralPath $Path }
    Add-Content -LiteralPath $Path -Value ('{0:s} {1}' -f (Get-Date), $Text) -Encoding UTF8
  } catch {}
}

# ── paths inside the project ──
function ConvertTo-RelPath([string]$Path) {
  # "a/b/c", '' for the project folder itself, or $null when the path could leave it
  $s = ($Path -replace '\\', '/').Trim().TrimEnd('/')
  if ($s -eq '') { return '' }
  if ($s.StartsWith('/') -or $s -match '^[A-Za-z]:') { return $null }
  $parts = $s -split '/'
  foreach ($x in $parts) {
    if ($x.Trim() -eq '' -or $x -eq '.' -or $x -eq '..' -or $x -match '[\x00-\x1f<>:"|?*]' -or $x -match '[. ]$') { return $null }
  }
  return ($parts -join '/')
}
function Resolve-InProject([string]$Root, [string]$Rel) {
  $r = ConvertTo-RelPath $Rel
  if ($null -eq $r) { throw "Not inside the project: $Rel" }
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  if ($r -eq '') { return $rootFull }
  $full = [IO.Path]::GetFullPath((Join-Path $rootFull ($r -replace '/', '\')))
  if (-not $full.StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Not inside the project: $Rel" }
  return $full
}
# ── the project's folders: names only, breadth first (parents before children) ──
function Get-FolderTree([string]$Root, [int]$MaxDepth = 5, [int]$Max = 3000) {
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $out = New-Object System.Collections.Generic.List[string]
  $queue = New-Object System.Collections.Generic.Queue[object]
  $queue.Enqueue(@($rootFull, 0))
  while ($queue.Count -gt 0 -and $out.Count -lt $Max) {
    $item = $queue.Dequeue()
    if ($item[1] -ge $MaxDepth) { continue }
    try { $subs = @([IO.Directory]::GetDirectories($item[0]) | Sort-Object) } catch { continue }
    foreach ($s in $subs) {
      if ($out.Count -ge $Max) { break }
      $out.Add(($s.Substring($rootFull.Length + 1) -replace '\\', '/'))
      $queue.Enqueue(@($s, ($item[1] + 1)))
    }
  }
  return ,$out.ToArray()
}

# ── a file name that is free in a folder: "a.pdf", else "a (2).pdf", "a (3).pdf"… ──
function Get-FreeName([string]$Dir, [string]$Name) {
  if (-not (Test-Path -LiteralPath (Join-Path $Dir $Name))) { return $Name }
  $base = [IO.Path]::GetFileNameWithoutExtension($Name); $ext = [IO.Path]::GetExtension($Name)
  for ($i = 2; ; $i++) { $c = "$base ($i)$ext"; if (-not (Test-Path -LiteralPath (Join-Path $Dir $c))) { return $c } }
}

# ── the plan ──
function Invoke-FilingPlan([string]$Root, $Plan, [string]$SourceDir) {
  # Every path is checked first (a bad one throws before anything is done); then the steps in order, then the
  # copies. Nothing is deleted or overwritten. Returns what was done, and the error when it stopped part way.
  $ErrorActionPreference = 'Stop'
  $checked = @(foreach ($s in @($Plan.steps)) {
    if (-not $s) { continue }
    switch ($s.op) {
      'mkdir' { [pscustomobject]@{ op = 'mkdir'; a = (Resolve-InProject $Root $s.path); b = $null } }
      'move' { [pscustomobject]@{ op = 'move'; a = (Resolve-InProject $Root $s.from); b = (Resolve-InProject $Root $s.to) } }
      'move-contents' { [pscustomobject]@{ op = 'move-contents'; a = (Resolve-InProject $Root $s.from); b = (Resolve-InProject $Root $s.to) } }
      default { throw "Unknown step: $($s.op)" }
    }
  })
  $targets = @(foreach ($f in @($Plan.files)) {
    if ($null -ne $f.dest) { [pscustomobject]@{ n = $f.n; name = $f.name; dest = $f.dest; full = (Resolve-InProject $Root $f.dest) } }
  })
  $result = [pscustomobject]@{ steps = @(); files = @(); error = $null }
  try {
    foreach ($s in $checked) {
      switch ($s.op) {
        'mkdir' { [void][IO.Directory]::CreateDirectory($s.a) }
        'move' {
          if (Test-Path -LiteralPath $s.b) { throw "Already there: $($s.b)" }
          [void][IO.Directory]::CreateDirectory((Split-Path $s.b -Parent))
          Move-Item -LiteralPath $s.a -Destination $s.b
        }
        'move-contents' {
          [void][IO.Directory]::CreateDirectory($s.b)
          foreach ($file in [IO.Directory]::GetFiles($s.a)) {
            Move-Item -LiteralPath $file -Destination (Join-Path $s.b (Get-FreeName $s.b (Split-Path $file -Leaf)))
          }
        }
      }
      $result.steps += $s.op
    }
    foreach ($t in $targets) {
      [void][IO.Directory]::CreateDirectory($t.full)
      $as = Get-FreeName $t.full $t.name
      Copy-Item -LiteralPath (Join-Path $SourceDir ([string]$t.n)) -Destination (Join-Path $t.full $as)
      $result.files += [pscustomobject]@{ name = $t.name; dest = $t.dest; savedAs = $as }
    }
  } catch { $result.error = $_.Exception.Message }
  return $result
}

# ── where things are on this PC ──
function Find-ProjectFolder([string]$ProjectsRoot, [string]$Code, [string]$Name, [string]$ProjectsJson = $script:FmProjects) {
  # folder names under the projects folder that are probably this project: Folder Manager's project with this
  # code first, then folders whose name holds the code or the project's name
  $out = New-Object System.Collections.Generic.List[string]
  if ($Code -and (Test-Path -LiteralPath $ProjectsJson)) {
    try {
      $d = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProjectsJson | ConvertFrom-Json
      foreach ($p in @($d.projects)) {
        if ($p.alpha -and $p.alpha -eq $Code -and $p.path) {
          $leaf = Split-Path (($p.path -replace '/', '\').TrimEnd('\')) -Leaf
          if (-not $out.Contains($leaf)) { $out.Add($leaf) }
        }
      }
    } catch {}
  }
  if ($ProjectsRoot -and (Test-Path -LiteralPath $ProjectsRoot)) {
    foreach ($dir in [IO.Directory]::GetDirectories($ProjectsRoot)) {
      $leaf = Split-Path $dir -Leaf
      $hit = ($Code -and $Code.Length -ge 3 -and $leaf.IndexOf($Code, [StringComparison]::OrdinalIgnoreCase) -ge 0) -or
             ($Name -and $Name.Length -ge 3 -and $leaf.IndexOf($Name, [StringComparison]::OrdinalIgnoreCase) -ge 0)
      if ($hit -and -not $out.Contains($leaf)) { $out.Add($leaf) }
    }
  }
  return ,$out.ToArray()
}
function Test-HelperToken([string]$Token) {
  # a job's token, as the server makes it; anything else never reaches a command line
  return [bool]($Token -match '^[A-Za-z0-9_-]{20,80}$')
}
function Save-HelperKey([string]$Key, [string]$Path = $script:KeyPath) {
  # the person's Outlook add-in key, readable only by this Windows user (DPAPI), like the mail scanner's
  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
  ConvertTo-SecureString $Key -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $Path
}
function Read-HelperKey([string]$Path = $script:KeyPath) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    $sec = Get-Content -LiteralPath $Path | ConvertTo-SecureString
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  } catch { return $null }
}
function Get-HelperConfig([string]$Path = $script:ConfigPath) {
  $c = $null
  if (Test-Path -LiteralPath $Path) { try { $c = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json } catch {} }
  return [pscustomobject]@{
    hub = $(if ($c -and $c.hub) { [string]$c.hub } else { 'https://kkarc-hub.azurewebsites.net' })
    # the single projects folder of the first version: still where a project stored without a root is looked for first
    projectsRoot = $(if ($c -and $c.projectsRoot) { [string]$c.projectsRoot } else { '' })
    # roots picked outside every "@* projects" folder found on the drives: name → full path
    roots = (Get-ConfigRoots $c)
    # the export inbox: one folder on this PC that Revit / AutoCAD / a PDF printer export into
    inbox = $(if ($c -and $c.inbox) { [string]$c.inbox } else { Join-Path ([Environment]::GetFolderPath('Desktop')) 'לתיוק' })
  }
}
function Get-ConfigRoots($Config) {
  # the config's saved roots as an ordered map, names without case (from JSON, a hashtable, or nothing)
  $out = New-Object System.Collections.Specialized.OrderedDictionary ([StringComparer]::OrdinalIgnoreCase)
  $r = if ($Config -is [System.Collections.IDictionary]) { $Config['roots'] } elseif ($Config -and $Config.PSObject.Properties['roots']) { $Config.roots } else { $null }
  if ($r -is [System.Collections.IDictionary]) { foreach ($k in $r.Keys) { if ($k -and $r[$k]) { $out[[string]$k] = [string]$r[$k] } } }
  elseif ($r) { foreach ($p in $r.PSObject.Properties) { if ($p.Name -and $p.Value) { $out[$p.Name] = [string]$p.Value } } }
  return ,$out
}
function Save-HelperConfig($Config, [string]$Path = $script:ConfigPath) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
  [IO.File]::WriteAllText($Path, ($Config | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
}

# ── the tasks the server hands this PC (Run-Task.ps1 does the network and the window) ──
function Test-TaskKind([string]$Kind) { return $Kind -in @('pick', 'tree', 'open', 'file', 'inbox', 'pick-source') }
# ── the project roots: the office keeps projects on many computers, each sharing a drive whose top holds a folder
#    named "@<Name> Projects" (any case). Drive letters differ between PCs; the root's folder name is what the server
#    keeps with each project's folder. ──
# What each drive / saved root answered in this process (one task): key "path|name" → { ps, h, lines, done, timedOut }.
# A drive that did not answer in time is never waited for again; its runspace keeps going, and a later call takes its
# answer if it has come by then.
$script:Scans = @{}
$script:ScanPool = $null
$script:RootsIncomplete = $false
$script:ShareMap = $null   # mapped network drives: "K:" → "\\Kappa\k"
# in each runspace: "name|path" lines (no folder name or path holds "|"); a saved root's own path when it exists
$script:ReadRoot = {
  param([string]$Path, [string]$Name)
  try {
    if ($Name) { if ([IO.Directory]::Exists($Path)) { $Name + '|' + $Path.TrimEnd('\') } }
    else { foreach ($x in [IO.Directory]::GetDirectories($Path)) { $leaf = [IO.Path]::GetFileName($x); if ($leaf -like '@* projects') { $leaf + '|' + $x } } }
  } catch { }
}
function Reset-ProjectRoots { $script:Scans = @{}; $script:RootsIncomplete = $false }
function Get-DriveRoots {
  # this PC's file system drives, as "D:\" (mapped network drives included, reachable or not)
  return @(Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.Root } | Where-Object { $_ })
}
function Get-ProjectRoots($Config, [string[]]$Drives = $null, [string]$Want = '', [int]$TimeoutMs = 4000) {
  # name → full path, names without case: every "@* projects" folder at the top of a drive ($Drives, default this PC's
  # drives), then the roots saved in the config, then the legacy projectsRoot — each when reachable. A drive whose
  # computer is off takes seconds to fail, so every drive is read at once (one runspace each), and whatever has not
  # answered within $TimeoutMs is left out (and $script:RootsIncomplete is set). With $Want, it returns as soon as that
  # root is known. Answers are kept for the process, so a second call reads nothing again.
  if ($null -eq $Drives) { $Drives = Get-DriveRoots }
  $jobs = New-Object System.Collections.Generic.List[object]
  foreach ($d in $Drives) { if ($d) { $jobs.Add([pscustomobject]@{ path = [string]$d; name = '' }) } }
  $saved = Get-ConfigRoots $Config
  foreach ($k in $saved.Keys) { $jobs.Add([pscustomobject]@{ path = [string]$saved[$k]; name = [string]$k }) }
  $legacy = if ($Config -and $Config.projectsRoot) { ([string]$Config.projectsRoot).TrimEnd('\') } else { '' }
  if ($legacy) { $leaf = [IO.Path]::GetFileName($legacy); if ($leaf) { $jobs.Add([pscustomobject]@{ path = $legacy; name = $leaf }) } }
  $scans = foreach ($j in $jobs) {
    $key = $j.path + '|' + $j.name
    if (-not $script:Scans.ContainsKey($key)) {
      if (-not $script:ScanPool) { $script:ScanPool = [runspacefactory]::CreateRunspacePool(1, 16); $script:ScanPool.Open() }
      $ps = [powershell]::Create(); $ps.RunspacePool = $script:ScanPool
      [void]$ps.AddScript($script:ReadRoot).AddArgument($j.path).AddArgument($j.name)
      $script:Scans[$key] = [pscustomobject]@{ ps = $ps; h = $ps.BeginInvoke(); lines = @(); done = $false; timedOut = $false }
    }
    $script:Scans[$key]
  }
  $scans = @($scans)
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ($true) {
    $pending = 0; $found = $false
    foreach ($s in $scans) {
      if (-not $s.done -and $s.h.IsCompleted) {
        $s.lines = @(try { $s.ps.EndInvoke($s.h) | ForEach-Object { [string]$_ } } catch { })
        $s.ps.Dispose(); $s.done = $true
      }
      if ($s.done) { if ($Want -and @($s.lines | Where-Object { $_.Split('|')[0] -ieq $Want }).Count) { $found = $true } }
      elseif (-not $s.timedOut) { $pending++ }
    }
    if ($found -or $pending -eq 0) { break }
    if ([DateTime]::UtcNow -ge $deadline) { foreach ($s in $scans) { if (-not $s.done) { $s.timedOut = $true } }; break }
    Start-Sleep -Milliseconds 15
  }
  $script:RootsIncomplete = @($scans | Where-Object { -not $_.done }).Count -gt 0
  $out = New-Object System.Collections.Specialized.OrderedDictionary ([StringComparer]::OrdinalIgnoreCase)
  foreach ($s in $scans) {
    foreach ($line in @($s.lines)) {
      if (-not $line) { continue }
      $cut = $line.IndexOf('|')
      $n = $line.Substring(0, $cut)
      if (-not $out.Contains($n)) { $out[$n] = $line.Substring($cut + 1) }
    }
  }
  return ,$out
}
function Get-ProjectDir([string]$ProjectsRoot, [string]$Folder) {
  # the project's folder in one root, or $null when it is not there (or the name is not a single folder name)
  if (-not $ProjectsRoot -or -not $Folder) { return $null }
  $f = ConvertTo-RelPath $Folder
  if (-not $f -or $f.Contains('/')) { return $null }
  $full = Join-Path $ProjectsRoot $f
  if (Test-Path -LiteralPath $full -PathType Container) { return $full }
  return $null
}
function Resolve-ProjectDir($Config, [string]$Root, [string]$Folder, [string[]]$Drives = $null) {
  # the project's folder on this PC, or $null: in the root of that name; a project stored before roots (no root) in the
  # legacy projectsRoot, else in the one root that has a folder of that name — only when every drive answered (a drive
  # that did not could hold another one); none, two, or not sure: $null
  $f = ConvertTo-RelPath $Folder
  if (-not $f -or $f.Contains('/')) { return $null }
  if ($Root) {
    $roots = Get-ProjectRoots $Config $Drives -Want $Root
    if (-not $roots.Contains($Root)) { return $null }
    return (Get-ProjectDir $roots[$Root] $f)
  }
  $legacy = if ($Config -and $Config.projectsRoot) { [string]$Config.projectsRoot } else { '' }
  $dir = Get-ProjectDir $legacy $f
  if ($dir) { return $dir }
  $roots = Get-ProjectRoots $Config $Drives
  if ($script:RootsIncomplete) { return $null }
  $hits = @(foreach ($k in $roots.Keys) { $d = Get-ProjectDir $roots[$k] $f; if ($d) { $d } })
  if ($hits.Count -eq 1) { return $hits[0] }
  return $null
}
function ConvertTo-SharePath([string]$Path) {
  # a path on a mapped network drive as the share's own path ("K:\x" → "\\Kappa\k\x"), to tell whether two paths are
  # the same folder; anything else as it is, without a trailing "\"
  $p = $Path.TrimEnd('\')
  if ($null -eq $script:ShareMap) {
    $script:ShareMap = @(Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | Where-Object { $_.DisplayRoot -and ([string]$_.DisplayRoot).StartsWith('\\') } |
      ForEach-Object { [pscustomobject]@{ drive = ([string]$_.Root).TrimEnd('\'); share = ([string]$_.DisplayRoot).TrimEnd('\') } })
  }
  foreach ($d in $script:ShareMap) {
    if ($d.drive -and ($p -ieq $d.drive -or $p.StartsWith($d.drive + '\', [StringComparison]::OrdinalIgnoreCase))) { return $d.share + $p.Substring($d.drive.Length) }
  }
  return $p
}
function Test-SameFolder([string]$A, [string]$B) {
  try { return (ConvertTo-SharePath ([IO.Path]::GetFullPath($A))) -ieq (ConvertTo-SharePath ([IO.Path]::GetFullPath($B))) } catch { return $false }
}
function Find-RootOf($Config, [string]$Full, [string[]]$Drives = $null) {
  # the root a folder is in (or is): { name, path } or $null. The nearest of: a saved root (by path), or an
  # "@* projects" folder at the top of a drive (or of a network share); only then the legacy projectsRoot — which an old
  # pick may have set to a project's own folder inside such a root. No drive is read.
  $saved = Get-ConfigRoots $Config
  $tops = @((@(if ($null -eq $Drives) { Get-DriveRoots } else { $Drives })) | ForEach-Object { ([string]$_).TrimEnd('\') })
  $p = $Full.TrimEnd('\')
  while ($p) {
    foreach ($k in $saved.Keys) { if (Test-SameFolder $saved[$k] $p) { return [pscustomobject]@{ name = [string]$k; path = $p } } }
    $parent = [IO.Path]::GetDirectoryName($p)
    if (-not $parent) { break }
    $up = $parent.TrimEnd('\')
    $leaf = [IO.Path]::GetFileName($p)
    if ($leaf -like '@* projects' -and ($up -ieq ([IO.Path]::GetPathRoot($p)).TrimEnd('\') -or $tops -icontains $up)) { return [pscustomobject]@{ name = $leaf; path = $p } }
    $p = $up
  }
  if ($Config -and $Config.projectsRoot) {
    $l = ([string]$Config.projectsRoot).TrimEnd('\'); $n = [IO.Path]::GetFileName($l)
    $p = $Full.TrimEnd('\')
    while ($n -and $p) {
      if (Test-SameFolder $l $p) { return [pscustomobject]@{ name = $n; path = $p } }
      $p = [IO.Path]::GetDirectoryName($p); if ($p) { $p = $p.TrimEnd('\') }
    }
  }
  return $null
}
function Invoke-PickTask($Config, $Task, [scriptblock]$Picker, [string]$ProjectsJson = $script:FmProjects, [string]$ConfigPath = $script:ConfigPath, [string[]]$Drives = $null) {
  # The picker gets where to start (the project's root, else the legacy root, else the first root found, else '') and
  # the folder to preselect (the project's folder, else the best guess, else $null), and returns the chosen folder's
  # full path or $null. A folder in a root stands for the project it is in (the first folder under the root) →
  # { picked, root = the root's folder name }. A root itself is no project, and is refused as a cancel (the pick task
  # has no error answer, and the person can pick again). A folder outside every root makes its parent a root.
  # A root this PC would not find again by its name (a network share without a drive letter, a parent folder) is saved
  # in the config. Every project folder must resolve to the folder picked: when the name already stands for another
  # folder on this PC (a found root or a saved one), the pick is refused as a cancel, with a line in the log.
  $start = ''
  if ($Task.root) { $rs = Get-ProjectRoots $Config $Drives -Want $Task.root; if ($rs.Contains($Task.root)) { $start = $rs[$Task.root] } }
  if (-not $start -and $Config.projectsRoot -and (Test-Path -LiteralPath $Config.projectsRoot -PathType Container)) { $start = [string]$Config.projectsRoot }
  if (-not $start) { $rs = Get-ProjectRoots $Config $Drives; foreach ($k in $rs.Keys) { $start = $rs[$k]; break } }
  $suggested = Resolve-ProjectDir $Config ([string]$Task.root) ([string]$Task.folder) $Drives
  if (-not $suggested -and $start) {
    $cands = Find-ProjectFolder $start $Task.project.code $Task.project.name $ProjectsJson
    $guess = @($cands | Where-Object { Get-ProjectDir $start $_ })
    if ($guess.Count) { $suggested = Join-Path $start $guess[0] }
  }
  $full = & $Picker $start $suggested
  if (-not $full) { return @{ cancelled = $true } }
  $full = [IO.Path]::GetFullPath([string]$full).TrimEnd('\')
  $r = Find-RootOf $Config $full $Drives
  if ($r) {
    if ($full -ieq $r.path) { return @{ cancelled = $true } }
    $name = $r.name; $rootPath = $r.path
    $picked = $full.Substring($r.path.Length + 1).Split('\')[0]
  } else {
    $parent = [IO.Path]::GetDirectoryName($full)
    if (-not $parent -or $parent -ieq [IO.Path]::GetPathRoot($full)) { throw "Not a project folder: $full" }
    $rootPath = $parent.TrimEnd('\')
    $name = [IO.Path]::GetFileName($rootPath)
    if (-not $name) { throw "Not a project folder: $full" }
    $picked = [IO.Path]::GetFileName($full)
  }
  # what the name stands for on this PC now: a saved root, else a found one (the legacy root last)
  $saved = Get-ConfigRoots $Config
  $now = if ($saved.Contains($name)) { $saved[$name] } else { $rs = Get-ProjectRoots $Config $Drives -Want $name; if ($rs.Contains($name)) { $rs[$name] } else { $null } }
  if ($now) {
    if (-not (Test-SameFolder $now $rootPath)) {
      Write-HelperLog ("pick refused: '{0}' is already {1} on this PC, not {2}" -f $name, $now, $rootPath)
      return @{ cancelled = $true }
    }
  } else {
    $saved[$name] = $rootPath
    if ($Config -is [System.Collections.IDictionary]) { $Config['roots'] = $saved }
    elseif ($Config.PSObject.Properties['roots']) { $Config.roots = $saved }
    else { $Config | Add-Member -NotePropertyName roots -NotePropertyValue $saved }
    Save-HelperConfig $Config $ConfigPath
  }
  return @{ picked = $picked; root = $name }
}
function Get-TreeResult([string]$Dir) {
  # $Dir: the project's folder (Resolve-ProjectDir), $null when it is not on this PC
  if (-not $Dir) { return @{ missing = $true } }
  return @{ tree = (Get-FolderTree $Dir) }
}
function Get-OpenTarget([string]$Dir, [string]$Rel) {
  # the folder to open, or $null when it is not on this PC; a path that leaves the project throws
  if (-not $Dir) { return $null }
  $full = Resolve-InProject $Dir $Rel
  if (Test-Path -LiteralPath $full -PathType Container) { return $full }
  return $null
}
# ── the files of a "file" task: saved from classic Outlook on this PC (source 'outlook'), else downloaded from the
#    server ('upload'). Run-Task.ps1 does the COM and the network; the choices are made here. ──
function Get-NeededFiles($Task) {
  # the files the plan files (a dest, even ''), each once, with where its bytes come from
  $byN = @{}
  foreach ($x in @($Task.files)) { if ($null -ne $x) { $byN[[int]$x.n] = $x } }
  $out = New-Object System.Collections.Generic.List[object]
  foreach ($n in @(@($Task.plan.files) | Where-Object { $null -ne $_ -and $null -ne $_.dest } | ForEach-Object { [int]$_.n } | Sort-Object -Unique)) {
    $x = $byN[$n]
    if (-not $x) { continue }
    $src = if ($x.source -eq 'outlook') { 'outlook' } else { 'upload' }
    $out.Add([pscustomobject]@{ n = $n; name = [string]$x.name; size = [long]$x.size; source = $src })
  }
  return ,$out.ToArray()
}
function Get-AttachmentMatch($Available, $Wanted) {
  # $Available: the email's attachments in Outlook [{Index, FileName, Size}]; $Wanted: [{n, name, size}].
  # Returns n → Index for each wanted file found. Names match without case; among several with the same name the
  # closest size wins (Outlook's size and the pane's differ by a little), then the first; each attachment is used once.
  $map = @{}
  $used = @{}
  foreach ($w in @($Wanted)) {
    if ($null -eq $w) { continue }
    $best = $null; $bestGap = [double]::MaxValue
    foreach ($a in @($Available)) {
      if ($null -eq $a -or $used.ContainsKey([int]$a.Index)) { continue }
      if (-not [string]::Equals([string]$a.FileName, [string]$w.name, [StringComparison]::OrdinalIgnoreCase)) { continue }
      $gap = [math]::Abs([double]$a.Size - [double]$w.size)
      if ($gap -lt $bestGap -or ($gap -eq $bestGap -and [int]$a.Index -lt [int]$best.Index)) { $best = $a; $bestGap = $gap }
    }
    if ($best) { $map[[int]$w.n] = [int]$best.Index; $used[[int]$best.Index] = $true }
  }
  return $map
}
function Get-MessageIdFilter([string]$Id) {
  # Items.Find / Restrict by the email's Internet message id (PR_INTERNET_MESSAGE_ID), as a DASL query
  return '@SQL="http://schemas.microsoft.com/mapi/proptag/0x1035001F" = ''' + $Id.Replace("'", "''") + ''''
}
function Get-ReceivedFilter([datetime]$At, [int]$Minutes = 2) {
  # Restrict compares to the minute, in this PC's date format (as the mail scanner does); Test-MailMatch cuts exactly
  $from = $At.AddMinutes(-$Minutes - 1); $to = $At.AddMinutes($Minutes + 1)
  return "[ReceivedTime] >= '" + $from.ToString('g') + "' AND [ReceivedTime] <= '" + $to.ToString('g') + "'"
}
function ConvertTo-LocalTime([string]$Iso) {
  # the pane's time (ISO, UTC) as this PC's local time, as Outlook gives ReceivedTime; $null when there is none
  if (-not $Iso) { return $null }
  try { return [DateTimeOffset]::Parse($Iso, [Globalization.CultureInfo]::InvariantCulture).LocalDateTime } catch { return $null }
}
function Test-MailMatch($Item, $Mail, [int]$Minutes = 2) {
  # the fallback when the message id finds nothing: same subject, received within ±2 minutes, same sender (when known)
  # $Item: { Subject, Received (local), From (SMTP or Outlook's address) }; $Mail: the task's mail
  $at = ConvertTo-LocalTime ([string]$Mail.received)
  if ($null -eq $at -or $null -eq $Item.Received) { return $false }
  if ([math]::Abs(([datetime]$Item.Received - $at).TotalMinutes) -gt $Minutes) { return $false }
  if (([string]$Item.Subject).Trim() -ne ([string]$Mail.subject).Trim()) { return $false }
  if ($Mail.from -and -not [string]::Equals(([string]$Item.From).Trim(), ([string]$Mail.from).Trim(), [StringComparison]::OrdinalIgnoreCase)) { return $false }
  return $true
}

function Invoke-FileTask([string]$Dir, $Task, [string]$SourceDir) {
  # the confirmed plan, carried out in the project's folder $Dir (Resolve-ProjectDir; $null when it is not on this PC);
  # the files are in $SourceDir as "<n>". A bad path stops it before anything is done.
  if (-not $Dir) { return @{ missing = $true } }
  try { $r = Invoke-FilingPlan $Dir $Task.plan $SourceDir } catch { return @{ files = @(); error = $_.Exception.Message } }
  return @{ files = @($r.files); error = $r.error }
}

# ── the export inbox ──
function Test-FileLocked([string]$Path) {
  # still being written (or held open for writing by the program that exports it): it cannot be opened for reading
  # while others may only read it. A program that only reads it (a viewer) is no lock, and this read blocks no one.
  try { $f = [IO.File]::Open($Path, 'Open', 'Read', 'Read'); $f.Close(); return $false } catch { return $true }
}
function Get-InboxFiles([string]$Dir) {
  # the folder's files (no folders, hidden files, Office lock files "~$…", *.tmp, *.part or empty files), each with its
  # size and time
  if (-not $Dir -or -not [IO.Directory]::Exists($Dir)) { return @() }
  return @(foreach ($f in ([IO.DirectoryInfo]$Dir).GetFiles()) {
    if ($f.Attributes -band ([IO.FileAttributes]::Hidden -bor [IO.FileAttributes]::System)) { continue }
    if ($f.Name -like '~$*' -or $f.Name -like '*.tmp' -or $f.Name -like '*.part' -or $f.Length -eq 0) { continue }
    [pscustomobject]@{ name = $f.Name; size = [long]$f.Length; mtime = $f.LastWriteTimeUtc }
  })
}
function Get-InboxKey($File) { return '{0}|{1}|{2}' -f $File.name, $File.size, $File.mtime.Ticks }
function Get-InboxState([string]$Dir, $Prev, [datetime]$Now = [DateTime]::UtcNow, [scriptblock]$IsLocked = { param($p) Test-FileLocked $p }, [int]$SettleSec = 10, [string[]]$Known = @()) {
  # the inbox's files (no folders, hidden files, Office lock files "~$…", *.tmp, *.part or empty files), each with its
  # size and time; "settled" once the list, the sizes and the times have not changed for $SettleSec seconds (counted
  # from the state $Prev of the check before) and no file is held open by a program writing it. The lock test runs only
  # when something is to be announced (a file not in $Known, the inbox when it last settled): known files are not opened.
  $files = @(Get-InboxFiles $Dir)
  $keys = @($files | ForEach-Object { Get-InboxKey $_ } | Sort-Object)
  $sig = $keys -join "`n"
  $since = if ($Prev -and $Prev.sig -eq $sig) { $Prev.since } else { $Now }
  $settled = ($Now - $since).TotalSeconds -ge $SettleSec
  $known = @($Known | Where-Object { $_ })
  if ($settled -and @($keys | Where-Object { $known -notcontains $_ }).Count) {
    foreach ($f in $files) { if (& $IsLocked (Join-Path $Dir $f.name)) { $settled = $false; break } }
  }
  return [pscustomobject]@{ files = $files; keys = $keys; sig = $sig; since = $since; settled = $settled }
}
function Select-InboxAnnouncement($State, [string[]]$Known) {
  # what a settled inbox means: announce when it holds a file (name + size + time) not known before; a file that only
  # left (published, deleted) is forgotten without a word. Known = the inbox when it last settled.
  $known = @($Known | Where-Object { $_ })
  if (-not $State.settled) { return [pscustomobject]@{ announce = $false; changed = $false; known = $known } }
  $now = @($State.keys)
  $new = @($now | Where-Object { $known -notcontains $_ })
  $changed = $new.Count -gt 0 -or @($known | Where-Object { $now -notcontains $_ }).Count -gt 0
  return [pscustomobject]@{ announce = ($new.Count -gt 0); changed = $changed; known = $now }
}
function Test-InboxRecheck($State, [datetime]$Now, [datetime]$Due) {
  # time to ask the hub whether it still has an open batch of this PC (GET /api/outlook/inbox-batch?pc=): the inbox has
  # settled, it holds files, and the time came (at once when the agent starts, then every few minutes). A restart of the
  # server loses its batches and a batch ends after a day: with none, the agent announces the inbox again.
  return [bool]($State -and $State.settled -and @($State.files).Count -gt 0 -and $Now -ge $Due)
}
function Get-ErrorStatus($Exception) {
  # the HTTP status of a refused request (Invoke-WebRequest's WebException, or one inside another); 0 when there is none
  for ($e = $Exception; $e; $e = $e.InnerException) {
    try { if ($e.Response -and $e.Response.StatusCode) { return [int]$e.Response.StatusCode } } catch { }
  }
  return 0
}
function ConvertTo-InboxBatch($State, [string]$Pc) {
  # the body of POST /api/outlook/inbox-batch: the whole inbox as it is now (a new batch replaces the one before)
  return [pscustomobject]@{ pc = $Pc; files = @($State.files | ForEach-Object { [pscustomobject]@{ name = $_.name; size = $_.size; mtime = $_.mtime.ToString('yyyy-MM-ddTHH:mm:ss.fffZ', [Globalization.CultureInfo]::InvariantCulture) } }) }
}
function ConvertTo-SourceBatch([string]$Dir, [string]$Id) {
  # the result of a pick-source task: the chosen folder's files (as the inbox's), the id the folder is kept under here
  # and its name to show — never its path
  $body = ConvertTo-InboxBatch ([pscustomobject]@{ files = @(Get-InboxFiles $Dir | Select-Object -First 100) }) ''  # the hub takes 100
  return [pscustomobject]@{ source = $Id; folder = (Split-Path $Dir.TrimEnd('\') -Leaf); files = @($body.files) }
}
function Read-HelperSources([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  try { $j = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json; return @($j | Where-Object { $_ -and $_.id -and $_.path }) } catch { return @() }
}
function Save-HelperSource([string]$Dir, [string]$Path = $script:SourcesPath) {
  # keeps a folder the person chose to publish from under an id (the same folder keeps its id); the latest 20 only
  $list = @(Read-HelperSources $Path)
  $old = @($list | Where-Object { $_.path -eq $Dir }) | Select-Object -First 1
  $id = if ($old) { [string]$old.id } else { 'src_' + [guid]::NewGuid().ToString('N').Substring(0, 12) }
  $list = @(@($list | Where-Object { $_.path -ne $Dir }) + [pscustomobject]@{ id = $id; path = $Dir }) | Select-Object -Last 20
  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
  [IO.File]::WriteAllText($Path, (ConvertTo-Json -InputObject @($list) -Compress), (New-Object Text.UTF8Encoding $false))
  return $id
}
function Get-HelperSource([string]$Id, [string]$Path = $script:SourcesPath) {
  # the folder kept under $Id, or $null
  $hit = @(Read-HelperSources $Path | Where-Object { $_.id -eq $Id }) | Select-Object -First 1
  if ($hit) { return [string]$hit.path }
  return $null
}
function Get-InboxTaskSource($Cfg, $Task, [string]$Path = $script:SourcesPath) {
  # where an inbox task's files are, and whether they leave it: the export inbox's files move into the project (a
  # server that says nothing means the inbox); a folder the person chose (source) is only copied from, whatever the
  # task says, and one not kept here is no folder at all (never the inbox)
  if ($Task.source) { return [pscustomobject]@{ dir = (Get-HelperSource ([string]$Task.source) $Path); move = $false } }
  return [pscustomobject]@{ dir = [string]$Cfg.inbox; move = ($Task.move -ne $false) }
}
function Read-InboxKnown([string]$Path = $script:InboxKnownPath) {
  # the inbox as it was when it last settled, kept across sign-ins so the same files are not announced again
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  # Windows PowerShell hands a JSON array on as one object: kept in a variable first, so it is enumerated
  try { $j = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json; return @($j | ForEach-Object { [string]$_ } | Where-Object { $_ }) } catch { return @() }
}
function Save-InboxKnown([string[]]$Known, [string]$Path = $script:InboxKnownPath) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
  [IO.File]::WriteAllText($Path, (ConvertTo-Json -InputObject @($Known | Where-Object { $_ }) -Compress), (New-Object Text.UTF8Encoding $false))
}
function Get-HubPageUrl([string]$Url, [string]$Hub) {
  # $Url when it is a page of the hub itself (the config's "hub": same scheme, host and port, nothing before the host,
  # a path after it, no spaces or quotes), else $null — anything else is never handed to Windows or a browser
  if (-not $Hub -or -not $Url) { return $null }
  $base = $Hub.TrimEnd('/')
  if ($Url -match '[\x00-\x20"<>\\^`{|}]' -or -not $Url.StartsWith($base + '/', [StringComparison]::OrdinalIgnoreCase)) { return $null }
  $u = $null; $h = $null
  if (-not [uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$u) -or -not [uri]::TryCreate($base, [UriKind]::Absolute, [ref]$h)) { return $null }
  if ($u.Scheme -notin @('https', 'http') -or $u.Scheme -ne $h.Scheme -or $u.Host -ne $h.Host -or $u.Port -ne $h.Port -or $u.UserInfo) { return $null }
  return $Url
}
function Get-InboxToastXml([int]$Count, [string[]]$Names, [string]$Url) {
  # the notification: "N new files", up to three names, "Open" and "Later". "Open" and a click on the notification
  # launch the window's https address itself, which Windows opens in the default browser (a projecthub-inbox: link
  # did not reach its handler from a notification: Windows offered the Store instead). $Url: checked by Get-HubPageUrl.
  $e = [Security.SecurityElement]
  $head = if ($Count -eq 1) { T 'קובץ חדש בתיבת הייצוא' } else { T '{n} קבצים חדשים בתיבת הייצוא' @{ n = $Count } }
  $line = (@($Names) | Select-Object -First 3) -join ', '
  if (@($Names).Count -gt 3) { $line += '…' }
  $l = $e::Escape($Url)
  return '<toast activationType="protocol" launch="' + $l + '"><visual><binding template="ToastGeneric"><text>' + $e::Escape($head) + '</text><text>' + $e::Escape($line) + '</text></binding></visual>' +
    '<actions><action content="' + $e::Escape((T 'פתח')) + '" activationType="protocol" arguments="' + $l + '"/><action content="' + $e::Escape((T 'אחר כך')) + '" activationType="system" arguments="dismiss"/></actions></toast>'
}
function Invoke-InboxTask([string]$Dir, [string]$InboxDir, $Task, [bool]$Move = $true) {
  # Publishes files of the export inbox into the project's folder $Dir ($null when it is not on this PC) by the plan:
  # the mkdir steps, then each file to each of its dests. A dest with replace: an existing file of the same name in that
  # folder first moves into "@ver" inside the same folder (made when missing; a name already in @ver gets a free name,
  # nothing is overwritten); without replace the copy gets a free name. Everything is checked first (every path inside
  # the project, every source a file of the batch, mkdir the only step) — a bad one: nothing is done. A source no longer
  # in the inbox (published from another window, deleted) is skipped and said (notInInbox); with none left nothing is
  # done. A file copied to all its dests (sizes checked) is deleted from the inbox; the first failure stops it, and a
  # file not copied everywhere stays in the inbox. $Move = $false (a folder the person chose, not the export inbox): the
  # files are only copied, nothing is deleted.
  # Received files (a consultant's new plan version) may also move the previous version folder into the @ver folder next
  # to it: a move step whose from is a folder below the project's top that is there, and whose to is <a sibling folder
  # with @ver in its name>\<the same name>, where nothing is (checked first, and again just before it moves).
  # Result: { files: [{ name, dests: [the name it was saved as, per dest, in the plan's order] }], notInInbox, error }.
  if (-not $Dir) { return @{ missing = $true } }
  $result = @{ files = @(); notInInbox = @(); error = $null }
  try {
    if (-not $InboxDir -or -not [IO.Directory]::Exists($InboxDir)) { throw "The folder of the files is not on this PC: $InboxDir" }
    $byN = @{}; $byName = @{}
    foreach ($x in @($Task.files)) { if ($null -ne $x) { if ($null -ne $x.n) { $byN[[int]$x.n] = [string]$x.name }; $byName[[string]$x.name] = $true } }
    $steps = @(foreach ($s in @($Task.plan.steps)) {
      if (-not $s) { continue }
      if ($s.op -eq 'mkdir') { [pscustomobject]@{ op = 'mkdir'; a = (Resolve-InProject $Dir $s.path); b = $null }; continue }
      if ($s.op -ne 'move') { throw "Not a step of a publish: $($s.op)" }
      $a = Resolve-InProject $Dir $s.from; $b = Resolve-InProject $Dir $s.to
      $ver = Split-Path $b -Parent
      if ((ConvertTo-RelPath $s.from) -notmatch '/' -or (Split-Path $ver -Leaf) -notmatch '@ver' -or
          -not (Test-SameFolder (Split-Path $ver -Parent) (Split-Path $a -Parent)) -or (Split-Path $b -Leaf) -ne (Split-Path $a -Leaf)) { throw "Not a move to the @ver folder next to it: $($s.from)" }
      if (-not [IO.Directory]::Exists($a)) { throw "Not there: $($s.from)" }
      if (Test-Path -LiteralPath $b) { throw "Already there: $($s.to)" }
      [pscustomobject]@{ op = 'move'; a = $a; b = $b }
    })
    $jobs = @(foreach ($f in @($Task.plan.files)) {
      if (-not $f) { continue }
      $name = if ($null -ne $f.n -and $byN.ContainsKey([int]$f.n)) { $byN[[int]$f.n] } else { [string]$f.name }
      if ($byName.Count -and -not $byName.ContainsKey($name)) { throw "Not a file of this batch: $name" }
      if (-not $name -or $name -ne [IO.Path]::GetFileName($name) -or $null -eq (ConvertTo-RelPath $name)) { throw "Not a file name: $name" }
      $src = Join-Path $InboxDir $name
      $dests = @(foreach ($d in @($f.dests)) { if ($d) { [pscustomobject]@{ full = (Resolve-InProject $Dir $d.path); replace = [bool]$d.replace } } })
      if (-not $dests.Count) { continue }
      if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { $result.notInInbox += $name; continue }
      [pscustomobject]@{ name = $name; src = $src; dests = $dests }
    })
    if (-not $jobs.Count) { return $result }
    foreach ($s in $steps) {
      if ($s.op -eq 'mkdir') { [void][IO.Directory]::CreateDirectory($s.a); continue }
      if (Test-Path -LiteralPath $s.b) { throw "Already there: $($s.b)" }
      if (-not [IO.Directory]::Exists((Split-Path $s.b -Parent))) { throw "No @ver folder: $(Split-Path $s.b -Parent)" }
      [IO.Directory]::Move($s.a, $s.b)
    }
    foreach ($j in $jobs) {
      $done = [pscustomobject]@{ name = $j.name; dests = @() }
      $result.files += $done
      foreach ($d in $j.dests) {
        [void][IO.Directory]::CreateDirectory($d.full)
        $there = Join-Path $d.full $j.name
        if ($d.replace -and (Test-Path -LiteralPath $there -PathType Leaf)) {
          $ver = Join-Path $d.full '@ver'
          [void][IO.Directory]::CreateDirectory($ver)
          Move-Item -LiteralPath $there -Destination (Join-Path $ver (Get-FreeName $ver $j.name))
        }
        $as = Get-FreeName $d.full $j.name
        Copy-Item -LiteralPath $j.src -Destination (Join-Path $d.full $as)
        if ((Get-Item -LiteralPath (Join-Path $d.full $as)).Length -ne (Get-Item -LiteralPath $j.src).Length) { throw "Copy incomplete: $($j.name)" }
        $done.dests += $as
      }
      if ($Move) { Remove-Item -LiteralPath $j.src -Force }
    }
  } catch { $result.error = $_.Exception.Message }
  return $result
}
