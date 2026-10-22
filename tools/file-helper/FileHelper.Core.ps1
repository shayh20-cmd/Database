<# Project Hub — filing helper: the logic, without windows or network. Dot-sourced by the agent, by Run-Task.ps1 and by
   the tests. The pane asks, the server makes a task (pick / tree / open / file), the agent runs it here.
   Paths inside the project are relative, with "/" between folder names, as the server keeps them; every one is
   checked to stay inside the project folder before anything is done. Nothing here deletes or overwrites.
   A "file" task's attachments are saved from classic Outlook on this PC when it has the email (Get-NeededFiles,
   Get-AttachmentMatch, the filters); the server's copy is the fallback.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md
   Saved as UTF-8 with BOM (Windows PowerShell 5.1 reads Hebrew right only then). #>

$script:ConfigPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper.json'
$script:FmProjects = Join-Path $env:LOCALAPPDATA 'FolderManager\projects.json'
$script:KeyPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper.key'
$script:LogPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper.log'

# ── texts: Hebrew is the source; English when the pane that made the task runs in English. The helper shows only
#    the folder picker; everything else is said in the pane. ──
$script:Lang = 'he'
$script:EN = @{
  'בחר את התיקייה הראשית של הפרויקט {p}' = 'Choose the main folder of project {p}'
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
function Test-TaskKind([string]$Kind) { return $Kind -in @('pick', 'tree', 'open', 'file') }
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
