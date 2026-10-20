<# Project Hub — mail scan (pilot). Reads the messages that reached classic Outlook's Inbox since the
   last run and sends them to Project Hub, where Claude suggests tasks; the suggestions wait at the top of
   "המשימות שלי". Run by the "Project Hub mail scan" scheduled task (Install-MailScan.ps1) every 15 minutes;
   each run scans only when one of the person's scan hours (Settings ← סריקת מייל) has passed since the last scan.
   -Now scans right away (the Hub button and the Start menu shortcut) and says so when nothing is new.
   -DryRun lists what would be sent and changes nothing.
   Spec: docs/superpowers/specs/2026-10-20-mail-task-suggestions-design.md,
         docs/superpowers/specs/2026-10-21-mail-scan-schedule-contract.md
   Saved as UTF-8 with BOM: Windows PowerShell 5.1 reads the Hebrew below only that way. #>
param(
  [switch]$DryRun,
  [switch]$Now,
  [string]$Hub = 'https://kkarc-hub.azurewebsites.net'
)
$ErrorActionPreference = 'Stop'
$Hub = $Hub.TrimEnd('/')
$dir = Join-Path $env:LOCALAPPDATA 'ProjectHub'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stateFile = Join-Path $dir 'mail-scan.json'
$keyFile = Join-Path $dir 'mail-scan.key'
$logFile = Join-Path $dir 'mail-scan.log'
$MaxMails = 50
$BatchSize = 10
$BodyChars = 6000
$Title = 'Project Hub — סריקת מייל'

function Write-Log([string]$msg) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $msg
  if ($DryRun) { Write-Host $line; return }
  $old = @()
  if (Test-Path $logFile) { $old = @(Get-Content $logFile -Encoding UTF8 | Select-Object -Last 499) }
  Set-Content -Path $logFile -Value ($old + $line) -Encoding UTF8
}

# every exit goes through here, so the run-once lock below is always released
$mutex = $null
function Stop-Scan([int]$code) {
  if ($script:mutex) { try { $script:mutex.ReleaseMutex() } catch { }; $script:mutex.Dispose(); $script:mutex = $null }
  exit $code
}
# anything not caught below is logged instead of the hidden run dying silently
trap { Write-Log "fatal: $_"; Stop-Scan 1 }

# one scan at a time (the scheduled task, the Start menu shortcut and sign-in can overlap)
$mutex = New-Object System.Threading.Mutex($false, 'Local\ProjectHubMailScan')
$owned = $false
try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true }   # previous run was killed: the lock is ours now
if (-not $owned) {
  $mutex.Dispose(); $mutex = $null
  if (-not $DryRun) { Write-Log 'another scan is running' }
  exit 0
}

# $lines: up to three body lines. $buttons adds "פתח" (opens $url) and "אחר כך".
function Show-Toast([string]$head, [string[]]$lines, [string]$url, [switch]$buttons) {
  if ($DryRun) { Write-Host "[toast] $head : $($lines -join ' | ')"; return }
  try {
    $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $e = [Security.SecurityElement]
    $launch = ''
    if ($url) { $launch = ' activationType="protocol" launch="' + $e::Escape($url) + '"' }
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $texts = (@($head) + @($lines | Select-Object -First 3) | ForEach-Object { '<text>' + $e::Escape([string]$_) + '</text>' }) -join ''
    $actions = ''
    if ($buttons -and $url) { $actions = '<actions><action content="פתח" activationType="protocol" arguments="' + $e::Escape($url) + '"/><action content="אחר כך" activationType="system" arguments="dismiss"/></actions>' }
    $xml.LoadXml('<toast' + $launch + '><visual><binding template="ToastGeneric">' + $texts + '</binding></visual>' + $actions + '</toast>')
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
  } catch {
    Write-Log "toast failed: $($_.Exception.Message)"
    Show-Popup $head $lines $url -buttons:$buttons
  }
}

# Windows notifications can be unavailable ("The notification platform is unavailable" on the pilot PC). Then
# the scanner shows its own small window in the corner: the same title, lines and buttons, always on top. It closes
# itself after 10 minutes, so the run ends within the scheduled task's 15-minute limit (run-hidden.vbs waits for
# the scan, so the task counts as running until then and skips any trigger that fires meanwhile).
function Show-Popup([string]$head, [string[]]$lines, [string]$url, [switch]$buttons) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $font = New-Object System.Drawing.Font('Segoe UI', 10)
    $f = New-Object System.Windows.Forms.Form
    $f.Text = 'Project Hub'
    $f.FormBorderStyle = 'None'; $f.TopMost = $true; $f.ShowInTaskbar = $false; $f.StartPosition = 'Manual'
    $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
    $f.AutoSize = $true; $f.AutoSizeMode = 'GrowAndShrink'; $f.Font = $font
    $f.BackColor = [System.Drawing.Color]::White
    $f.Add_Paint({ param($s, $e) $e.Graphics.DrawRectangle([System.Drawing.Pens]::Silver, 0, 0, $s.Width - 1, $s.Height - 1) })
    $flow = New-Object System.Windows.Forms.FlowLayoutPanel
    $flow.FlowDirection = 'TopDown'; $flow.WrapContents = $false; $flow.AutoSize = $true
    $flow.Padding = New-Object System.Windows.Forms.Padding(16, 12, 16, 12)
    $title = New-Object System.Windows.Forms.Label
    $title.Text = $head; $title.AutoSize = $true; $title.MaximumSize = New-Object System.Drawing.Size(340, 0)
    $title.Font = New-Object System.Drawing.Font('Segoe UI', 10.5, [System.Drawing.FontStyle]::Bold)
    $title.ForeColor = [System.Drawing.Color]::FromArgb(17, 24, 39)
    $flow.Controls.Add($title)
    foreach ($l in @($lines | Select-Object -First 3)) {
      $x = New-Object System.Windows.Forms.Label
      $x.Text = [string]$l; $x.AutoSize = $true; $x.MaximumSize = New-Object System.Drawing.Size(340, 0)
      $x.ForeColor = [System.Drawing.Color]::FromArgb(75, 85, 99); $x.Margin = New-Object System.Windows.Forms.Padding(0, 4, 0, 0)
      $flow.Controls.Add($x)
    }
    $row = New-Object System.Windows.Forms.FlowLayoutPanel
    $row.AutoSize = $true; $row.WrapContents = $false; $row.Margin = New-Object System.Windows.Forms.Padding(0, 12, 0, 0)
    if ($url) {
      $open = New-Object System.Windows.Forms.Button
      $open.Text = 'פתח'; $open.AutoSize = $true; $open.FlatStyle = 'Flat'; $open.FlatAppearance.BorderSize = 0
      $open.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235); $open.ForeColor = [System.Drawing.Color]::White
      $open.Padding = New-Object System.Windows.Forms.Padding(10, 2, 10, 2)
      $open.Add_Click({ Start-Process $url; $f.Close() })
      $row.Controls.Add($open)
    }
    $later = New-Object System.Windows.Forms.Button
    $later.Text = $(if ($buttons) { 'אחר כך' } else { 'סגור' }); $later.AutoSize = $true; $later.FlatStyle = 'Flat'
    $later.FlatAppearance.BorderColor = [System.Drawing.Color]::Silver; $later.Padding = New-Object System.Windows.Forms.Padding(10, 2, 10, 2)
    $later.Add_Click({ $f.Close() })
    $row.Controls.Add($later)
    $flow.Controls.Add($row)
    $f.Controls.Add($flow)
    $f.Add_Load({
      $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
      $f.Location = New-Object System.Drawing.Point(($wa.Right - $f.Width - 16), ($wa.Bottom - $f.Height - 16))
    })
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 10 * 60 * 1000
    $timer.Add_Tick({ $timer.Stop(); $f.Close() })
    $timer.Start()
    [void]$f.ShowDialog()
    $timer.Dispose(); $f.Dispose()
  } catch { Write-Log "popup failed: $($_.Exception.Message)" }
}

# a schedule from the server or the state file -> @{ days = int[]; times = 'HH:MM'[] }, or $null if it is not one.
# ConvertFrom-Json gives PSCustomObjects and loosely typed arrays; this makes them plain again.
function ConvertTo-Schedule($j) {
  if (-not $j -or $null -eq $j.days -or $null -eq $j.times) { return $null }
  $days = @(@($j.days) | Where-Object { $null -ne $_ -and "$_" -match '^[0-6]$' } | ForEach-Object { [int]"$_" } | Sort-Object -Unique)
  $times = @(@($j.times) | Where-Object { "$_" -match '^\d{1,2}:\d{2}$' } | ForEach-Object { $h, $m = "$_".Split(':'); '{0:00}:{1:00}' -f [int]$h, [int]$m } | Sort-Object -Unique)
  return @{ days = $days; times = $times }
}
$DefaultSchedule = @{ days = @(0, 1, 2, 3, 4); times = @('08:00', '12:00', '16:00') }

# The latest scan slot (a listed day at a listed time, local clock) at or before $now, looking back 7 days;
# $null when there is none (no days or no times = manual scans only). Pure, so it can be tested on its own.
function Get-LastSlot($schedule, [datetime]$now) {
  if (-not $schedule) { return $null }
  $days = @($schedule.days | ForEach-Object { [int]$_ })
  $times = @($schedule.times | ForEach-Object { [timespan]::Parse([string]$_) } | Sort-Object -Descending)
  if ($days.Count -eq 0 -or $times.Count -eq 0) { return $null }
  for ($d = 0; $d -le 7; $d++) {
    $day = $now.Date.AddDays(-$d)
    if ($days -notcontains [int]$day.DayOfWeek) { continue }
    foreach ($t in $times) {
      $slot = $day.Add($t)
      if ($slot -le $now) { return $slot }
    }
  }
  return $null
}

function Read-State {
  # keyAlerted / noKeyAlerted: the key alerts were already shown, so they are not repeated every run
  # schedule: the last one fetched from the server, used when it can't be reached. lastScan: the last completed scan.
  $s = @{ since = (Get-Date).AddDays(-2).ToString('o'); failures = 0; keyAlerted = $false; noKeyAlerted = $false; schedule = $null; lastScan = $null }
  if (Test-Path $stateFile) {
    try {
      $j = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($j.since) { $s.since = [string]$j.since }
      $s.failures = [int]$j.failures
      $s.keyAlerted = [bool]$j.keyAlerted
      $s.noKeyAlerted = [bool]$j.noKeyAlerted
      $s.schedule = ConvertTo-Schedule $j.schedule
      if ($j.lastScan) { $s.lastScan = [string]$j.lastScan }
    } catch { }
  }
  return $s
}
function Save-State($s) { if (-not $DryRun) { $s | ConvertTo-Json -Depth 5 | Set-Content -Path $stateFile -Encoding UTF8 } }

# a scan that reached the server (also "nothing new"): remember it, tell the server, and answer a manual scan
$shownNew = $false
function Complete-Scan {
  $state.lastScan = (Get-Date).ToString('o'); Save-State $state
  try { $null = Invoke-RestMethod -Method Post -Uri "$Hub/api/mail-intake/ran" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 20 }
  catch { Write-Log "ran: $($_.Exception.Message)" }
  if ($Now -and -not $script:shownNew) { Show-Toast $Title 'הסריקה הסתיימה. אין הצעות חדשות.' '' }
}

# the key is stored with DPAPI: readable only by this Windows user on this computer
function Get-Key {
  if (-not (Test-Path $keyFile)) { return $null }
  $sec = Get-Content $keyFile | ConvertTo-SecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$PR_HEADERS = 'http://schemas.microsoft.com/mapi/proptag/0x007D001F'
$PR_MSGID = 'http://schemas.microsoft.com/mapi/proptag/0x1035001F'
function Get-Prop($item, [string]$tag) { try { return [string]$item.PropertyAccessor.GetProperty($tag) } catch { return '' } }
function Get-SenderSmtp($m) {
  try {
    if ($m.SenderEmailType -eq 'EX' -and $m.Sender) {
      $u = $m.Sender.GetExchangeUser()
      if ($u) { return [string]$u.PrimarySmtpAddress }
    }
  } catch { }
  return [string]$m.SenderEmailAddress
}

$state = Read-State
$key = Get-Key
if (-not $key -and -not $DryRun) {
  Write-Log 'no key'
  if (-not $state.noKeyAlerted) {
    Show-Toast $Title 'אין מפתח. הפק מפתח בהגדרות ← גישה מהירה ← סריקת מייל, והרץ שוב את ההתקנה.' "$Hub/project_hub_01"
    $state.noKeyAlerted = $true; Save-State $state
  }
  Stop-Scan 1
}
if ($key) { $state.noKeyAlerted = $false }

# The task runs every 15 minutes; scan only when a scan hour has passed since the last scan. Decided before
# Outlook is touched, and quietly (no log line), since most runs end here.
if (-not $Now -and -not $DryRun) {
  $sched = $null
  try {
    $r = Invoke-RestMethod -Uri "$Hub/api/mail-intake/schedule" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 20
    $sched = ConvertTo-Schedule $r.schedule
    if ($sched) { $state.schedule = $sched; Save-State $state }
  } catch { }
  if (-not $sched) { $sched = $state.schedule }
  if (-not $sched) { $sched = $DefaultSchedule }
  $slot = Get-LastSlot $sched (Get-Date)
  $due = $false
  if ($slot) {
    $prev = $null
    if ($state.lastScan) { try { $prev = [datetime]::Parse($state.lastScan) } catch { } }
    $due = (-not $prev) -or ($prev -lt $slot)
  }
  if (-not $due) { Stop-Scan 0 }
}

try {
  $ol = New-Object -ComObject Outlook.Application
  $ns = $ol.GetNamespace('MAPI')
  $inbox = $ns.GetDefaultFolder(6)   # olFolderInbox
} catch {
  Write-Log "outlook: $($_.Exception.Message)"
  Show-Toast $Title 'Outlook במחשב לא מוגדר או לא זמין. פתח את Outlook והתחבר עם חשבון המשרד.' ''
  Stop-Scan 1
}
$me = ''
try { $me = [string]$ns.CurrentUser.AddressEntry.GetExchangeUser().PrimarySmtpAddress } catch { }

$since = [datetime]::Parse($state.since)
# Restrict compares to the minute, in the computer's date format; the exact cut is made below
$found = $inbox.Items.Restrict("[ReceivedTime] >= '" + $since.ToString('g') + "'")
$found.Sort('[ReceivedTime]')
$mails = New-Object System.Collections.ArrayList
$last = $since
foreach ($m in $found) {
  if ($mails.Count -ge $MaxMails) {
    # stopped at the cap: step back a second so a message received in the same second as the last one sent
    # is picked up next run (the server ignores the ones it already has)
    $back = $last.AddSeconds(-1)
    if ($back -gt $since) { $last = $back }
    break
  }
  # a broken or unreadable item is logged and passed over; it must not stop the scan
  try {
    if ($m.Class -ne 43) { continue }   # olMail only
    $received = [datetime]$m.ReceivedTime
  } catch { Write-Log "skip item: $($_.Exception.Message)"; continue }
  if ($received -le $since) { continue }
  $last = $received
  try {
    $headers = Get-Prop $m $PR_HEADERS
    $from = Get-SenderSmtp $m
    $skip = ($m.MessageClass -like 'IPM.Note.Rules.OofTemplate*') -or ($headers -match '(?im)^Auto-Submitted:\s*auto-') -or ($headers -match '(?im)^List-Unsubscribe:') -or ($me -and $from -and ($from -ieq $me))
    if ($skip) { continue }
    $id = Get-Prop $m $PR_MSGID
    if (-not $id) { $id = [string]$m.EntryID }
    $body = [string]$m.Body
    if ($body.Length -gt $BodyChars) { $body = $body.Substring(0, $BodyChars) }
    $att = @()
    foreach ($a in $m.Attachments) { $att += [string]$a.FileName }
    [void]$mails.Add([ordered]@{
      id = $id; from = $from; fromName = [string]$m.SenderName; to = [string]$m.To; cc = [string]$m.CC
      subject = [string]$m.Subject; received = $received.ToString('yyyy-MM-ddTHH:mm:sszzz'); body = $body; attachments = $att
    })
  } catch { Write-Log "skip item: $($_.Exception.Message)"; continue }
}

if ($DryRun) {
  Write-Host ("{0} messages to send since {1}" -f $mails.Count, $since)
  foreach ($x in $mails) { Write-Host (" - {0} | {1} | {2}" -f $x.received, $x.from, $x.subject) }
  Stop-Scan 0
}
if ($mails.Count -eq 0) {
  $state.since = $last.ToString('o'); $state.failures = 0; Save-State $state
  Write-Log 'nothing new'
  Complete-Scan
  Stop-Scan 0
}

$auth = @{ Authorization = "Bearer $key" }
$accepted = 0
try {
  for ($i = 0; $i -lt $mails.Count; $i += $BatchSize) {
    $batch = @($mails[$i..([Math]::Min($i + $BatchSize, $mails.Count) - 1)])
    $json = @{ mails = $batch } | ConvertTo-Json -Depth 5 -Compress
    $r = Invoke-RestMethod -Method Post -Uri "$Hub/api/mail-intake" -Headers $auth -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 90
    $accepted += [int]$r.accepted
  }
} catch {
  $code = 0
  try { $code = [int]$_.Exception.Response.StatusCode } catch { }
  if ($code -eq 401) {
    Write-Log 'key refused (401)'
    # once per key: cleared after the next successful send
    if (-not $state.keyAlerted) {
      Show-Toast $Title 'המפתח בוטל או שגוי. הפק מפתח חדש בהגדרות ← גישה מהירה ← סריקת מייל, והרץ שוב את ההתקנה.' "$Hub/project_hub_01"
      $state.keyAlerted = $true; Save-State $state
    }
    Stop-Scan 1
  }
  $state.failures = [int]$state.failures + 1
  Save-State $state
  Write-Log "send failed ($code): $($_.Exception.Message)"
  # only on the third failure in a row, not on every run after it
  if ($state.failures -eq 3) { Show-Toast $Title 'השרת לא זמין כבר שלוש ריצות. המיילים יישלחו בריצה הבאה.' '' }
  Stop-Scan 1
}

$state.since = $last.ToString('o'); $state.failures = 0; $state.keyAlerted = $false
Save-State $state
Write-Log "sent $($mails.Count), new $accepted"
if ($accepted -gt 0) {
  try {
    $s = Invoke-RestMethod -Uri "$Hub/api/mail-intake/status?wait=60" -Headers $auth -TimeoutSec 90
    if ([int]$s.new -gt 0) {
      $lines = @($s.top | ForEach-Object { if ($_.kind -eq 'important') { 'כדאי לשים לב: ' + $_.title } else { '• ' + $_.title } })
      # the small suggestions window, through the link Install-MailScan.ps1 registers; else the whole app
      $open = if (Test-Path 'HKCU:\Software\Classes\projecthub-mail') { 'projecthub-mail:open' } else { "$Hub/project_hub_01?view=mail" }
      Show-Toast ('Project Hub · {0} הצעות מהמייל' -f $s.new) $lines $open -buttons
      $shownNew = $true
    }
  } catch { Write-Log "status: $($_.Exception.Message)" }
}
Complete-Scan
Stop-Scan 0
