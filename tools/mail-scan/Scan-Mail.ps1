<# Project Hub — mail scan (pilot). Reads the messages that reached classic Outlook's Inbox since the
   last run and sends them to Project Hub, where Claude suggests tasks; the suggestions wait at the top of
   "המשימות שלי". Run by the "Project Hub mail scan" scheduled task (Install-MailScan.ps1).
   -DryRun lists what would be sent and changes nothing.
   Spec: docs/superpowers/specs/2026-10-20-mail-task-suggestions-design.md
   Saved as UTF-8 with BOM: Windows PowerShell 5.1 reads the Hebrew below only that way. #>
param(
  [switch]$DryRun,
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
  } catch { Write-Log "toast failed: $($_.Exception.Message)" }
}

function Read-State {
  $s = @{ since = (Get-Date).AddDays(-2).ToString('o'); failures = 0 }
  if (Test-Path $stateFile) {
    try {
      $j = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($j.since) { $s.since = [string]$j.since }
      $s.failures = [int]$j.failures
    } catch { }
  }
  return $s
}
function Save-State($s) { if (-not $DryRun) { $s | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8 } }

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
  Show-Toast $Title 'אין מפתח. הפק מפתח בהגדרות ← גישה מהירה ← סריקת מייל, והרץ שוב את ההתקנה.' "$Hub/project_hub_01"
  exit 1
}

try {
  $ol = New-Object -ComObject Outlook.Application
  $ns = $ol.GetNamespace('MAPI')
  $inbox = $ns.GetDefaultFolder(6)   # olFolderInbox
} catch {
  Write-Log "outlook: $($_.Exception.Message)"
  Show-Toast $Title 'Outlook במחשב לא מוגדר או לא זמין. פתח את Outlook והתחבר עם חשבון המשרד.' ''
  exit 1
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
  if ($mails.Count -ge $MaxMails) { break }
  if ($m.Class -ne 43) { continue }   # olMail only
  $received = [datetime]$m.ReceivedTime
  if ($received -le $since) { continue }
  $last = $received
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
}

if ($DryRun) {
  Write-Host ("{0} messages to send since {1}" -f $mails.Count, $since)
  foreach ($x in $mails) { Write-Host (" - {0} | {1} | {2}" -f $x.received, $x.from, $x.subject) }
  exit 0
}
if ($mails.Count -eq 0) {
  $state.since = $last.ToString('o'); $state.failures = 0; Save-State $state
  Write-Log 'nothing new'
  exit 0
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
    Show-Toast $Title 'המפתח בוטל או שגוי. הפק מפתח חדש בהגדרות ← גישה מהירה ← סריקת מייל, והרץ שוב את ההתקנה.' "$Hub/project_hub_01"
    exit 1
  }
  $state.failures = [int]$state.failures + 1
  Save-State $state
  Write-Log "send failed ($code): $($_.Exception.Message)"
  if ($state.failures -ge 3) { Show-Toast $Title 'השרת לא זמין כבר שלוש ריצות. המיילים יישלחו בריצה הבאה.' '' }
  exit 1
}

$state.since = $last.ToString('o'); $state.failures = 0
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
    }
  } catch { Write-Log "status: $($_.Exception.Message)" }
}
