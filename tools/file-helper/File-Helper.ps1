<# Project Hub — filing helper: the window for one job. Started by the background agent (FileHelper-Agent.ps1)
   with the job's one-time token. The token is its only permission: it reads the job, links the project to its folder the
   first time, asks the server for Claude's plan, shows it on the real folder tree, and files on a yes.
   The logic is in FileHelper.Core.ps1.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md
   Saved as UTF-8 with BOM. #>
param([string]$Token)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'FileHelper.Core.ps1')
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$cfg = Get-HelperConfig
$token = if (Test-HelperToken $Token) { $Token } else { $null }

# The background agent starts this window, so Windows may keep it behind Outlook (the foreground lock). Every message
# and dialog is owned by a hidden, always-on-top window; every form is on top too and activates itself when shown.
$script:Owner = $null
function Get-Owner {
  if (-not $script:Owner -or $script:Owner.IsDisposed) {
    $script:Owner = New-Object Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; FormBorderStyle = 'None'; StartPosition = 'Manual'; Size = (New-Object Drawing.Size(1, 1)); Location = (New-Object Drawing.Point(-32000, -32000)) }
    $script:Owner.Show()
  }
  $script:Owner.Activate()
  return $script:Owner
}
function Say([string]$Text, [string]$Icon = 'Information', [string]$Buttons = 'OK') {
  $opt = if ($script:Lang -eq 'en') { [Windows.Forms.MessageBoxOptions]0 } else { [Windows.Forms.MessageBoxOptions]'RightAlign, RtlReading' }
  return [Windows.Forms.MessageBox]::Show((Get-Owner), $Text, (T 'תיוק בתיקיית הפרויקט'), $Buttons, $Icon, 'Button1', $opt)
}
function Api([string]$Method, [string]$Sub, $Body) {
  $p = @{ Method = $Method; Uri = ($cfg.hub.TrimEnd('/') + '/api/filing/' + $token + $Sub); UseBasicParsing = $true }
  if ($null -ne $Body) { $p.ContentType = 'application/json; charset=utf-8'; $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress)) }
  $r = Invoke-WebRequest @p
  # Windows PowerShell guesses the charset; the server always sends UTF-8
  return ([Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json)
}
function StatusOf($Err) { try { return [int]$Err.Exception.Response.StatusCode } catch { return 0 } }
# best effort: the pane then says the filing was cancelled; a failure here changes nothing for the person
function Cancel-Job { try { [void](Api 'POST' '/cancel' @{}) } catch {} }
function New-Form([string]$Title, [int]$W, [int]$H) {
  $f = New-Object Windows.Forms.Form
  $f.Text = $Title; $f.Size = New-Object Drawing.Size($W, $H); $f.StartPosition = 'CenterScreen'
  $f.Font = New-Object Drawing.Font('Segoe UI', 10); $f.TopMost = $true; $f.MinimizeBox = $false
  if ($script:Lang -ne 'en') { $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true }
  $f.Add_Shown({ $this.Activate() })
  return $f
}
function New-Rows($Form, [string[]]$Styles) {
  # a one-column table filling the form; styles: Auto, Fill, or a height in pixels
  $t = New-Object Windows.Forms.TableLayoutPanel -Property @{ Dock = 'Fill'; ColumnCount = 1; RowCount = $Styles.Count; Padding = (New-Object Windows.Forms.Padding(10)) }
  [void]$t.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle([Windows.Forms.SizeType]::Percent, 100)))
  foreach ($s in $Styles) {
    $rs = switch ($s) { 'Auto' { New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::AutoSize) } 'Fill' { New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent, 100) } default { New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Absolute, [int]$s) } }
    [void]$t.RowStyles.Add($rs)
  }
  $Form.Controls.Add($t)
  return $t
}
function New-Label([string]$Text) { return (New-Object Windows.Forms.Label -Property @{ Text = $Text; AutoSize = $true; MaximumSize = (New-Object Drawing.Size(700, 0)); Margin = (New-Object Windows.Forms.Padding(0, 4, 0, 4)) }) }
function New-Buttons([object[]]$Buttons) {
  $row = New-Object Windows.Forms.FlowLayoutPanel -Property @{ AutoSize = $true; Dock = 'Fill'; FlowDirection = 'RightToLeft' }
  if ($script:Lang -ne 'en') { $row.FlowDirection = 'LeftToRight' } # mirrored by the form's RTL layout: still at the end
  foreach ($b in $Buttons) { $row.Controls.Add($b) }
  return $row
}
function New-Button([string]$Text) { return (New-Object Windows.Forms.Button -Property @{ Text = $Text; AutoSize = $true; Padding = (New-Object Windows.Forms.Padding(8, 2, 8, 2)) }) }

# ── the first time in a project: its folder under the projects folder, and its filing guide ──
function Show-LinkDialog($Job, [string]$ProjectsRoot) {
  $state = @{ root = $ProjectsRoot }
  $f = New-Form (T 'קישור הפרויקט לתיקייה') 700 640
  $t = New-Rows $f @('Auto', 'Auto', 'Auto', 'Auto', 'Auto', 'Fill', 'Auto')
  $t.Controls.Add((New-Label (T 'פעם ראשונה בפרויקט {p}: בחר את התיקייה הראשית שלו, וכתוב איך מתייקים בו. זה נשמר בפרויקט ב-Project Hub, לכל המשרד.' @{ p = "$($Job.project.code) $($Job.project.name)" })))
  $rootLbl = New-Label (T 'תיקיית הפרויקטים: {r}' @{ r = $state.root })
  $t.Controls.Add($rootLbl)
  $t.Controls.Add((New-Label (T 'תיקיית הפרויקט:')))
  $pick = New-Object Windows.Forms.FlowLayoutPanel -Property @{ AutoSize = $true; Dock = 'Fill' }
  $combo = New-Object Windows.Forms.ComboBox -Property @{ Width = 520; DropDownStyle = 'DropDown' }
  foreach ($c in (Find-ProjectFolder $state.root $Job.project.code $Job.project.name)) { [void]$combo.Items.Add($c) }
  if ($Job.folder) { $combo.Text = $Job.folder } elseif ($combo.Items.Count) { $combo.SelectedIndex = 0 }
  $browse = New-Button (T 'עיון…')
  $browse.Add_Click({
    $d = New-Object Windows.Forms.FolderBrowserDialog
    $d.SelectedPath = $state.root
    if ($d.ShowDialog($f) -ne 'OK') { return }
    $parent = Split-Path $d.SelectedPath -Parent
    if ($parent -and $parent -ne $state.root) { $state.root = $parent; $rootLbl.Text = T 'תיקיית הפרויקטים: {r}' @{ r = $state.root } }
    $combo.Text = Split-Path $d.SelectedPath -Leaf
  })
  $pick.Controls.Add($combo); $pick.Controls.Add($browse)
  $t.Controls.Add($pick)
  $t.Controls.Add((New-Label (T 'הנחיית התיוק של הפרויקט (Claude פועל לפיה):')))
  $guide = New-Object Windows.Forms.TextBox -Property @{ Multiline = $true; ScrollBars = 'Vertical'; Dock = 'Fill'; AcceptsReturn = $true; WordWrap = $true }
  $guide.Text = ($(if ($Job.guide) { $Job.guide } else { $Job.defaultGuide }) -replace "`r?`n", "`r`n")
  $t.Controls.Add($guide)
  $ok = New-Button (T 'שמור'); $cancel = New-Button (T 'ביטול'); $cancel.DialogResult = 'Cancel'
  $ok.Add_Click({
    $name = $combo.Text.Trim()
    if (-not $name -or -not (Test-Path -LiteralPath (Join-Path $state.root $name) -PathType Container)) { [void](Say (T 'בחר תיקייה שקיימת בתוך {r}' @{ r = $state.root }) 'Warning'); return }
    $f.DialogResult = 'OK'
  })
  $t.Controls.Add((New-Buttons @($ok, $cancel)))
  $f.CancelButton = $cancel
  if ($f.ShowDialog((Get-Owner)) -ne 'OK') { return $null }
  return @{ folder = $combo.Text.Trim(); guide = $guide.Text; projectsRoot = $state.root }
}

# ── Claude's plan on the real tree: confirm, pick another folder, or switch new version ⇄ existing ──
function Show-PlanDialog($Job, [string]$Root, [string[]]$Tree, $Plan) {
  $state = @{ plan = (Copy-Plan $Plan); original = (Copy-Plan $Plan); quiet = $false }
  $f = New-Form (T 'תיוק בתיקיית הפרויקט') 780 720
  $t = New-Rows $f @('Auto', 'Auto', '130', 'Fill', 'Auto', '96', 'Auto')
  $t.Controls.Add((New-Label ("$($Job.project.code) $($Job.project.name) — $($Job.mail.subject)`r`n" + (T 'מאת: {from} · נשלח לתיוק על ידי {by}' @{ from = $Job.mail.from; by = $Job.by }))))
  $why = New-Label $state.plan.why
  $why.ForeColor = [Drawing.Color]::FromArgb(40, 80, 160)
  $t.Controls.Add($why)

  $list = New-Object Windows.Forms.ListView -Property @{ View = 'Details'; FullRowSelect = $true; HideSelection = $false; Dock = 'Fill' }
  [void]$list.Columns.Add((T 'קובץ'), 220); [void]$list.Columns.Add((T 'תיקייה'), 500)
  $t.Controls.Add($list)

  $tv = New-Object Windows.Forms.TreeView -Property @{ Dock = 'Fill'; HideSelection = $false }
  $top = $tv.Nodes.Add((Split-Path $Root -Leaf)); $top.Tag = ''
  $nodes = @{ '' = $top }
  foreach ($p in $Tree) { $parent, $leaf = Split-Rel $p; if ($nodes.ContainsKey($parent)) { $n = $nodes[$parent].Nodes.Add($leaf); $n.Tag = $p; $nodes[$p] = $n } }
  $top.Expand()
  $t.Controls.Add($tv)

  $modes = New-Object Windows.Forms.FlowLayoutPanel -Property @{ AutoSize = $true; Dock = 'Fill' }
  $rbNew = New-Object Windows.Forms.RadioButton -Property @{ Text = (T 'תיקיית גרסה חדשה'); AutoSize = $true }
  $rbOld = New-Object Windows.Forms.RadioButton -Property @{ Text = (T 'הוסף לתיקייה הקיימת'); AutoSize = $true }
  $modes.Controls.Add($rbNew); $modes.Controls.Add($rbOld)
  $t.Controls.Add($modes)

  $steps = New-Object Windows.Forms.TextBox -Property @{ Multiline = $true; ReadOnly = $true; ScrollBars = 'Vertical'; Dock = 'Fill' }
  $t.Controls.Add($steps)

  $ok = New-Button (T 'תייק'); $ok.DialogResult = 'OK'
  $relink = New-Button (T 'שנה תיקייה / הנחיה'); $relink.DialogResult = 'Retry'
  $cancel = New-Button (T 'ביטול'); $cancel.DialogResult = 'Cancel'
  $t.Controls.Add((New-Buttons @($ok, $cancel, $relink)))
  $f.CancelButton = $cancel

  $render = {
    $p = $state.plan
    $state.quiet = $true
    $list.Items.Clear()
    foreach ($x in @($p.files)) {
      $it = New-Object Windows.Forms.ListViewItem([string]$x.name)
      $d = if ($null -eq $x.dest) { T '(לא נבחרה תיקייה)' } elseif ($x.dest -eq '') { '\' } else { $x.dest -replace '/', '\' }
      [void]$it.SubItems.Add($d); $it.Tag = $x.n
      [void]$list.Items.Add($it)
    }
    $versioned = @(@($p.files) | Where-Object { $_.dest -and (Get-VersionInfo (Split-Rel $_.dest)[1]) }).Count -gt 0
    $rbNew.Enabled = $versioned; $rbOld.Enabled = $versioned
    $rbNew.Checked = $p.mode -eq 'new-version'; $rbOld.Checked = $p.mode -ne 'new-version'
    $steps.Text = ((Get-PlanLines $p) -join "`r`n")
    $ok.Enabled = @(@($p.files) | Where-Object { $null -ne $_.dest }).Count -gt 0
    $first = @(@($p.files) | Where-Object { $null -ne $_.dest })[0]
    if ($first) {
      $r = $first.dest
      while ($r -and -not $nodes.ContainsKey($r)) { $r = (Split-Rel $r)[0] }
      $tv.SelectedNode = $nodes[$r]; $nodes[$r].EnsureVisible()
    }
    $state.quiet = $false
  }
  # A folder clicked in the tree: for the selected files (all when none is selected); Claude's steps no longer apply.
  # Only a click counts, also on the folder already selected. Selection alone is no choice: the render selects the
  # proposed folder, and WinForms selects it again when it creates the window, which must not replace Claude's plan.
  $tv.Add_NodeMouseClick({
    if ($state.quiet -or $_.Button -ne 'Left' -or -not $_.Node) { return }
    if ($tv.HitTest($_.Location).Location -eq 'PlusMinus') { return }
    $rel = [string]$_.Node.Tag
    $sel = @($list.SelectedItems | ForEach-Object { $_.Tag })
    $p = Copy-Plan $state.plan
    foreach ($x in @($p.files)) { if ($sel.Count -eq 0 -or $sel -contains $x.n) { $x.dest = $rel } }
    $p.steps = @(); $p.mode = 'existing'; $p.why = ''
    $state.plan = $p; $state.original = Copy-Plan $p
    $why.Text = ''
    & $render
  })
  $onMode = {
    if ($state.quiet -or -not $this.Checked) { return }
    $state.plan = Set-PlanMode $Root $state.original $(if ($rbNew.Checked) { 'new-version' } else { 'existing' })
    & $render
  }
  $rbNew.Add_CheckedChanged($onMode); $rbOld.Add_CheckedChanged($onMode)
  & $render
  $r = $f.ShowDialog((Get-Owner))
  if ($r -eq 'OK') { return $state.plan }
  if ($r -eq 'Retry') { return 'relink' }
  return $null
}

# ── the run ── (all of it inside try: whatever fails ends in a message, never in silence)
if (-not $token) { [void](Say (T 'הבקשה לא תקינה.') 'Warning'); exit 1 }
$tmp = $null
try {
  $job = Api 'GET' '' $null
  $script:Lang = if ($job.lang -eq 'en') { 'en' } else { 'he' }

  # where "@Omicron Projects" is on this PC
  $projectsRoot = $cfg.projectsRoot
  if (-not $projectsRoot -or -not (Test-Path -LiteralPath $projectsRoot)) {
    $projectsRoot = Find-ProjectsRoot
    if (-not $projectsRoot) {
      $d = New-Object Windows.Forms.FolderBrowserDialog
      $d.Description = T 'איפה תיקיית הפרויקטים של המשרד ("@Omicron Projects") במחשב הזה?'
      if ($d.ShowDialog((Get-Owner)) -ne 'OK') { Cancel-Job; exit 0 }
      $projectsRoot = $d.SelectedPath
    }
    $cfg.projectsRoot = $projectsRoot; Save-HelperConfig $cfg
  }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('ProjectHub-filing-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  foreach ($x in @($job.files)) { Invoke-WebRequest -UseBasicParsing -Uri ($cfg.hub.TrimEnd('/') + '/api/filing/' + $token + '/file/' + $x.n) -OutFile (Join-Path $tmp ([string]$x.n)) }
  $relink = $false
  while ($true) {
    # the first time in this project, when its folder is gone, or when asked: its folder and filing guide
    if ($relink -or -not $job.folder -or -not (Test-Path -LiteralPath (Join-Path $projectsRoot $job.folder))) {
      if ($job.folder -and -not $relink) { [void](Say (T 'לא מוצאת את תיקיית הפרויקט: {p}' @{ p = (Join-Path $projectsRoot $job.folder) }) 'Warning') }
      $link = Show-LinkDialog $job $projectsRoot
      if (-not $link) { Cancel-Job; exit 0 }
      if ($link.projectsRoot -ne $projectsRoot) { $projectsRoot = $link.projectsRoot; $cfg.projectsRoot = $projectsRoot; Save-HelperConfig $cfg }
      $saved = Api 'PUT' '/project' @{ folder = $link.folder; guide = $link.guide }
      $job.folder = $saved.folder; $job.guide = $saved.guide
      $relink = $false
    }
    $root = Join-Path $projectsRoot $job.folder
    $tree = Get-FolderTree $root
    try { $s = Api 'POST' '/suggest' @{ tree = $tree } } catch { $s = [pscustomobject]@{ plan = $null; reason = 'ai_failed' } }
    $plan = $s.plan
    if (-not $plan) {
      $plan = [pscustomobject]@{
        files = @(@($job.files) | ForEach-Object { [pscustomobject]@{ n = $_.n; name = $_.name; dest = $null } })
        steps = @(); mode = 'existing'
        why = $(if ($s.reason -eq 'ai_unavailable' -or $s.reason -eq 'ai_failed') { T 'Claude לא זמין כרגע — בחר תיקייה בעץ.' } else { T 'אין הצעה — בחר תיקייה בעץ.' })
      }
    }
    $choice = Show-PlanDialog $job $root $tree $plan
    if ($choice -eq 'relink') { $relink = $true; continue }
    break
  }
  if (-not $choice) { Cancel-Job; exit 0 }

  # every path is checked before anything is done: a bad one throws here, and then nothing at all was done
  try { $res = Invoke-FilingPlan $root $choice $tmp } catch {
    $e = $_.Exception.Message
    Cancel-Job
    [void](Say (T 'התכנית לא תקינה ולא בוצע דבר: {e}' @{ e = $e }) 'Warning')
    exit 1
  }
  $note = ''
  try { $done = Api 'POST' '/done' @{ files = @($res.files); mode = $choice.mode } } catch { $done = $null; $note = T 'הקבצים תויקו, אבל הרישום ב-Project Hub נכשל: {e}' @{ e = $_.Exception.Message } }
  $n = @($res.files).Count
  $lines = @($(if ($n -eq 1) { T 'תויק קובץ אחד.' } else { T 'תויקו {n} קבצים.' @{ n = $n } }))
  $lines += @($res.files | ForEach-Object { "$($_.savedAs) → $($_.dest -replace '/', '\')" })
  if ($done -and $done.taskLogged) { $lines += T 'נרשם גם ביומן המשימה המקושרת.' }
  if ($note) { $lines += $note }
  if ($res.error) {
    $lines = @((T 'הפעולה נעצרה: {e}' @{ e = $res.error }), (T 'מה שבוצע עד אז:')) + $lines
    [void](Say ($lines -join "`r`n") 'Warning')
  } elseif ($n -gt 0) {
    $lines += ''; $lines += T 'לפתוח את התיקייה?'
    if ((Say ($lines -join "`r`n") 'Information' 'YesNo') -eq 'Yes') { try { Start-Process explorer.exe (Resolve-InProject $root @($res.files)[0].dest) } catch {} }
  }
} catch {
  # an expired job is gone already; anything else is cancelled, so the pane does not wait for it
  $expired = (StatusOf $_) -eq 410
  $msg = if ($expired) { T 'הבקשה פגה. לחץ שוב בחלונית של Outlook.' } else { T 'השרת לא זמין: {e}' @{ e = $_.Exception.Message } }
  if (-not $expired) { Cancel-Job }
  [void](Say $msg 'Warning')
  exit 1
} finally {
  if ($tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
