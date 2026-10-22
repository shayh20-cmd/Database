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
function Find-ProjectsRoot([string]$ProjectsJson = $script:FmProjects) {
  # the folder most of Folder Manager's projects sit in, when this PC can reach it
  if (-not (Test-Path -LiteralPath $ProjectsJson)) { return $null }
  try { $d = Get-Content -Raw -Encoding UTF8 -LiteralPath $ProjectsJson | ConvertFrom-Json } catch { return $null }
  $parents = @(@($d.projects) | Where-Object { $_.path } | ForEach-Object { Split-Path (($_.path -replace '/', '\').TrimEnd('\')) -Parent })
  $best = $parents | Group-Object | Sort-Object Count -Descending | Select-Object -First 1
  if ($best -and (Test-Path -LiteralPath $best.Name)) { return $best.Name }
  return $null
}
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
    projectsRoot = $(if ($c -and $c.projectsRoot) { [string]$c.projectsRoot } else { '' })
  }
}
function Save-HelperConfig($Config, [string]$Path = $script:ConfigPath) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
  [IO.File]::WriteAllText($Path, ($Config | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
}

# ── the tasks the server hands this PC (Run-Task.ps1 does the network and the window) ──
function Test-TaskKind([string]$Kind) { return $Kind -in @('pick', 'tree', 'open', 'file') }
function Get-ProjectDir([string]$ProjectsRoot, [string]$Folder) {
  # the project's folder on this PC, or $null when it is not here (or the name is not a single folder name)
  if (-not $ProjectsRoot -or -not $Folder) { return $null }
  $f = ConvertTo-RelPath $Folder
  if (-not $f -or $f.Contains('/')) { return $null }
  $full = Join-Path $ProjectsRoot $f
  if (Test-Path -LiteralPath $full -PathType Container) { return $full }
  return $null
}
function Resolve-ProjectsRoot($Config, [string]$ProjectsJson = $script:FmProjects, [string]$ConfigPath = $script:ConfigPath) {
  # where "@Omicron Projects" is on this PC: as kept, else from Folder Manager's list (then kept), else $null
  if ($Config.projectsRoot -and (Test-Path -LiteralPath $Config.projectsRoot -PathType Container)) { return [string]$Config.projectsRoot }
  $found = Find-ProjectsRoot $ProjectsJson
  if ($found) { $Config.projectsRoot = $found; Save-HelperConfig $Config $ConfigPath }
  return $found
}
function Invoke-PickTask($Config, $Task, [scriptblock]$Picker, [string]$ProjectsJson = $script:FmProjects, [string]$ConfigPath = $script:ConfigPath) {
  # The picker gets where to start (the projects folder, or '' when this PC has none yet) and the folder to preselect
  # (the project's folder, else the best guess, else $null), and returns the chosen folder's full path or $null.
  # A folder below the projects folder stands for the project it is in (the first folder under the projects folder);
  # the projects folder itself is no project, and is refused as a cancel (the pick task has no error answer, and the
  # person can pick again). Only a folder outside the projects folder (or the first pick on this PC) makes its parent
  # this PC's projects folder.
  $root = Resolve-ProjectsRoot $Config $ProjectsJson $ConfigPath
  $suggested = $null
  if ($root) {
    $suggested = Get-ProjectDir $root $Task.folder
    if (-not $suggested) {
      $cands = Find-ProjectFolder $root $Task.project.code $Task.project.name $ProjectsJson
      $guess = @($cands | Where-Object { Get-ProjectDir $root $_ })
      if ($guess.Count) { $suggested = Join-Path $root $guess[0] }
    }
  }
  $full = & $Picker $(if ($root) { $root } else { '' }) $suggested
  if (-not $full) { return @{ cancelled = $true } }
  $full = [IO.Path]::GetFullPath([string]$full).TrimEnd('\')
  if ($root) {
    $rootFull = [IO.Path]::GetFullPath($root).TrimEnd('\')
    if ($full -ieq $rootFull) { return @{ cancelled = $true } }
    if ($full.StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
      return @{ picked = $full.Substring($rootFull.Length + 1).Split('\')[0] }
    }
  }
  $parent = Split-Path $full -Parent
  if (-not $parent) { throw "Not a project folder: $full" }
  $Config.projectsRoot = $parent; Save-HelperConfig $Config $ConfigPath
  return @{ picked = (Split-Path $full -Leaf) }
}
function Get-TreeResult([string]$ProjectsRoot, [string]$Folder) {
  $dir = Get-ProjectDir $ProjectsRoot $Folder
  if (-not $dir) { return @{ missing = $true } }
  return @{ tree = (Get-FolderTree $dir) }
}
function Get-OpenTarget([string]$ProjectsRoot, [string]$Folder, [string]$Rel) {
  # the folder to open, or $null when it is not on this PC; a path that leaves the project throws
  $dir = Get-ProjectDir $ProjectsRoot $Folder
  if (-not $dir) { return $null }
  $full = Resolve-InProject $dir $Rel
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

function Invoke-FileTask([string]$ProjectsRoot, $Task, [string]$SourceDir) {
  # the confirmed plan, carried out; the files are in $SourceDir as "<n>". A bad path stops it before anything is done.
  $dir = Get-ProjectDir $ProjectsRoot $Task.folder
  if (-not $dir) { return @{ missing = $true } }
  try { $r = Invoke-FilingPlan $dir $Task.plan $SourceDir } catch { return @{ files = @(); error = $_.Exception.Message } }
  return @{ files = @($r.files); error = $r.error }
}
