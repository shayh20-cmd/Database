<# Project Hub — filing helper: the logic, without windows or network. Dot-sourced by the agent, by Run-Task.ps1 and by
   the tests. The pane asks, the server makes a task (pick / tree / open / file), the agent runs it here.
   Paths inside the project are relative, with "/" between folder names, as the server keeps them; every one is
   checked to stay inside the project folder before anything is done. Nothing here deletes or overwrites.
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
  # A folder that is not directly in the projects folder makes its parent this PC's projects folder.
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
  $parent = Split-Path $full -Parent
  if (-not $parent) { throw "Not a project folder: $full" }
  $leaf = Split-Path $full -Leaf
  $same = $root -and ([IO.Path]::GetFullPath($root).TrimEnd('\') -ieq $parent.TrimEnd('\'))
  if (-not $same) { $Config.projectsRoot = $parent; Save-HelperConfig $Config $ConfigPath }
  return @{ picked = $leaf }
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
function Invoke-FileTask([string]$ProjectsRoot, $Task, [string]$SourceDir) {
  # the confirmed plan, carried out; the files are in $SourceDir as "<n>". A bad path stops it before anything is done.
  $dir = Get-ProjectDir $ProjectsRoot $Task.folder
  if (-not $dir) { return @{ missing = $true } }
  try { $r = Invoke-FilingPlan $dir $Task.plan $SourceDir } catch { return @{ files = @(); error = $_.Exception.Message } }
  return @{ files = @($r.files); error = $r.error }
}
