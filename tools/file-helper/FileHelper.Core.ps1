<# Project Hub — filing helper: the logic, without windows. Dot-sourced by File-Helper.ps1 and by the tests.
   Paths inside the project are relative, with "/" between folder names, as the server keeps them; every one is
   checked to stay inside the project folder before anything is done. Nothing here deletes or overwrites.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md
   Saved as UTF-8 with BOM (Windows PowerShell 5.1 reads Hebrew right only then). #>

$script:ConfigPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper.json'
$script:FmProjects = Join-Path $env:LOCALAPPDATA 'FolderManager\projects.json'
$script:KeyPath = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper.key'

# ── texts: Hebrew is the source; English when the pane that opened the job runs in English ──
$script:Lang = 'he'
$script:EN = @{
  'תיוק בתיקיית הפרויקט' = 'File in the project folder'
  'קישור הפרויקט לתיקייה' = 'Link the project to its folder'
  'הבקשה לא תקינה.' = 'The request is not valid.'
  'הבקשה פגה. לחץ שוב בחלונית של Outlook.' = 'The request has expired. Click again in the Outlook pane.'
  'השרת לא זמין: {e}' = 'The server is not available: {e}'
  'איפה תיקיית הפרויקטים של המשרד ("@Omicron Projects") במחשב הזה?' = 'Where is the office''s projects folder ("@Omicron Projects") on this computer?'
  'לא מוצאת את תיקיית הפרויקט: {p}' = 'Can''t find the project folder: {p}'
  'פעם ראשונה בפרויקט {p}: בחר את התיקייה הראשית שלו, וכתוב איך מתייקים בו. זה נשמר בפרויקט ב-Project Hub, לכל המשרד.' = 'First time in project {p}: choose its main folder and write how files are filed in it. This is saved on the project in Project Hub, for the whole office.'
  'תיקיית הפרויקטים: {r}' = 'Projects folder: {r}'
  'תיקיית הפרויקט:' = 'Project folder:'
  'עיון…' = 'Browse…'
  'הנחיית התיוק של הפרויקט (Claude פועל לפיה):' = 'The project''s filing guide (Claude follows it):'
  'בחר תיקייה שקיימת בתוך {r}' = 'Choose a folder that exists in {r}'
  'שמור' = 'Save'
  'ביטול' = 'Cancel'
  'תייק' = 'File'
  'שנה תיקייה / הנחיה' = 'Change folder / guide'
  'קובץ' = 'File'
  'תיקייה' = 'Folder'
  'מאת: {from} · נשלח לתיוק על ידי {by}' = 'From: {from} · sent for filing by {by}'
  'תיקיית גרסה חדשה' = 'New version folder'
  'הוסף לתיקייה הקיימת' = 'Add to the existing folder'
  '(לא נבחרה תיקייה)' = '(no folder chosen)'
  'אין הצעה — בחר תיקייה בעץ.' = 'No suggestion — choose a folder in the tree.'
  'Claude לא זמין כרגע — בחר תיקייה בעץ.' = 'Claude is not available right now — choose a folder in the tree.'
  'תיקייה חדשה: {p}' = 'New folder: {p}'
  'העברת {a} אל {b}' = 'Move {a} to {b}'
  'העברת הקבצים מ-{a} אל {b}' = 'Move the files in {a} to {b}'
  'העתקת {f} אל {d}' = 'Copy {f} to {d}'
  'תויקו {n} קבצים.' = '{n} files filed.'
  'תויק קובץ אחד.' = 'One file filed.'
  'נרשם גם ביומן המשימה המקושרת.' = 'Also logged on the linked task.'
  'לפתוח את התיקייה?' = 'Open the folder?'
  'הפעולה נעצרה: {e}' = 'Stopped: {e}'
  'מה שבוצע עד אז:' = 'Done until then:'
  'הקבצים תויקו, אבל הרישום ב-Project Hub נכשל: {e}' = 'The files were filed, but recording it in Project Hub failed: {e}'
  'התכנית לא תקינה ולא בוצע דבר: {e}' = 'The plan is not valid, and nothing was done: {e}'
}
function T([string]$He, [hashtable]$Slots) {
  $s = if ($script:Lang -eq 'en' -and $script:EN.ContainsKey($He)) { $script:EN[$He] } else { $He }
  if ($Slots) { foreach ($k in $Slots.Keys) { $s = $s.Replace('{' + $k + '}', [string]$Slots[$k]) } }
  return $s
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
function Join-Rel([string[]]$Parts) { return (@($Parts | Where-Object { $_ }) -join '/') }
function Split-Rel([string]$Rel) {
  $i = $Rel.LastIndexOf('/')
  if ($i -lt 0) { return @('', $Rel) }
  return @($Rel.Substring(0, $i), $Rel.Substring($i + 1))
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

# ── version folders (…-vNN) ──
function Get-VersionInfo([string]$Name) {
  if ($Name -match '^(.*[-_ ]v)(\d{1,3})$') { return @{ Prefix = $Matches[1]; Number = [int]$Matches[2]; Digits = $Matches[2].Length } }
  return $null
}
function Get-VersionSiblings([string]$ParentFull, [string]$Prefix) {
  # the version folders with this prefix in a folder, lowest first
  return @([IO.Directory]::GetDirectories($ParentFull) | ForEach-Object { Split-Path $_ -Leaf } |
    Where-Object { $_.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase) -and $_.Substring($Prefix.Length) -match '^\d{1,3}$' } |
    Sort-Object { [int]$_.Substring($Prefix.Length) })
}
function Get-FreeName([string]$Dir, [string]$Name) {
  if (-not (Test-Path -LiteralPath (Join-Path $Dir $Name))) { return $Name }
  $base = [IO.Path]::GetFileNameWithoutExtension($Name); $ext = [IO.Path]::GetExtension($Name)
  for ($i = 2; ; $i++) { $c = "$base ($i)$ext"; if (-not (Test-Path -LiteralPath (Join-Path $Dir $c))) { return $c } }
}

# ── the plan ──
function Copy-Plan($Plan) { return ($Plan | ConvertTo-Json -Depth 8 | ConvertFrom-Json) }
function Set-PlanMode([string]$Root, $Original, [string]$Mode) {
  # Claude's plan in its own mode is kept as it is. The other mode is worked out from the folders: "existing" puts
  # files bound for a version folder (…-vNN) in the highest one there; "new-version" makes the next one first.
  # Claude's refresh steps (move-contents) are kept, and so are its new folders that files still go to (a file bound
  # for a version folder where there is none yet keeps its folder, and the folder is still made).
  $p = Copy-Plan $Original
  if ($Original.mode -eq $Mode) { return $p }
  $made = @{}
  $first = @()
  foreach ($f in @($p.files)) {
    if (-not $f.dest) { continue }
    $parent, $leaf = Split-Rel $f.dest
    $v = Get-VersionInfo $leaf
    if (-not $v) { continue }
    $parentFull = Resolve-InProject $Root $parent
    if (-not (Test-Path -LiteralPath $parentFull)) { continue }
    $sibs = @(Get-VersionSiblings $parentFull $v.Prefix)
    $high = if ($sibs.Count) { $sibs[-1] } else { $null }
    if ($Mode -eq 'existing') { if ($high) { $f.dest = Join-Rel @($parent, $high) }; continue }
    $n = if ($high) { [int]$high.Substring($v.Prefix.Length) + 1 } else { 1 }
    $new = Join-Rel @($parent, ($v.Prefix + $n.ToString('D' + [Math]::Max(2, $v.Digits))))
    $f.dest = $new
    if (-not $made[$new]) { $made[$new] = $true; $first += [pscustomobject]@{ op = 'mkdir'; path = $new; from = ''; to = '' } }
  }
  $dests = @(@($p.files) | Where-Object { $_.dest } | ForEach-Object { $_.dest + '/' })
  $steps = @(foreach ($s in @($p.steps)) {
    if (-not $s) { continue }
    if ($s.op -eq 'move-contents') { $s; continue }
    if ($s.op -ne 'mkdir' -or $made[$s.path]) { continue }
    $under = $s.path + '/'
    if (@($dests | Where-Object { $_.StartsWith($under, [StringComparison]::OrdinalIgnoreCase) }).Count) { $s }
  })
  $p.steps = @($first) + $steps
  $p.mode = $Mode
  return $p
}
function Get-PlanLines($Plan) {
  # the plan in words, for the window: the steps, then the copies
  $w = { param($r) if ($r -eq '') { '\' } else { $r -replace '/', '\' } }
  $out = @()
  foreach ($s in @($Plan.steps)) {
    if (-not $s) { continue }
    switch ($s.op) {
      'mkdir' { $out += T 'תיקייה חדשה: {p}' @{ p = (& $w $s.path) } }
      'move' { $out += T 'העברת {a} אל {b}' @{ a = (& $w $s.from); b = (& $w $s.to) } }
      'move-contents' { $out += T 'העברת הקבצים מ-{a} אל {b}' @{ a = (& $w $s.from); b = (& $w $s.to) } }
    }
  }
  foreach ($f in @($Plan.files)) { if ($null -ne $f.dest) { $out += T 'העתקת {f} אל {d}' @{ f = $f.name; d = (& $w $f.dest) } } }
  return ,$out
}
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
