<# Project Hub — mail scan: install for the current Windows user (no admin rights).
   Asks for the key from Project Hub (Settings ← תוסף Outlook וסריקת מייל), stores it with DPAPI,
   creates the hidden scheduled task "Project Hub mail scan" (every 15 minutes and at sign-in; each run scans
   only when one of the scan hours set in Project Hub, Settings ← סריקת מייל, has passed), the Start menu
   shortcut "סרוק מייל עכשיו" and the projecthub-scan: link behind the Hub's scan-now button (both scan at once).
   Run it again to replace the key.
   The scripts run from where they are (the repo's tools\mail-scan). -Local copies them first to
   %LOCALAPPDATA%\ProjectHub\mail-scan and points the task, the shortcut and the link there; -Gui asks for the key in
   a small window and ends with a message box. The one-click installer (ProjectHub-MailScan-Setup.cmd, downloaded
   from Project Hub's Settings) runs it with both, from a temporary folder.
   Saved as UTF-8 with BOM. #>
param([string]$Hub = 'https://kkarc-hub.azurewebsites.net', [switch]$Local, [switch]$Gui)
$ErrorActionPreference = 'Stop'
$Hub = $Hub.TrimEnd('/')
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $env:LOCALAPPDATA 'ProjectHub'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Title = 'Project Hub - סריקת מייל'
if ($Gui) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
}
function Show-Box([string]$Text, [string]$Kind = 'Information') {
  $opts = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
  [System.Windows.Forms.MessageBox]::Show($Text, $Title, 'OK', $Kind, 'Button1', $opts) | Out-Null
}
# a small window for the key: a Hebrew line, an English line, a hidden text box; $null when cancelled
function Read-KeyBox([string]$He, [string]$En) {
  $f = New-Object System.Windows.Forms.Form
  $f.Text = $Title; $f.StartPosition = 'CenterScreen'; $f.FormBorderStyle = 'FixedDialog'
  $f.MaximizeBox = $false; $f.MinimizeBox = $false; $f.TopMost = $true
  $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
  $f.ClientSize = New-Object System.Drawing.Size(480, 178)
  $he1 = New-Object System.Windows.Forms.Label; $he1.Text = $He; $he1.SetBounds(12, 10, 456, 42)
  $en1 = New-Object System.Windows.Forms.Label; $en1.Text = $En; $en1.RightToLeft = 'No'; $en1.TextAlign = 'TopLeft'; $en1.SetBounds(12, 54, 456, 36)
  $box = New-Object System.Windows.Forms.TextBox; $box.UseSystemPasswordChar = $true; $box.RightToLeft = 'No'; $box.SetBounds(12, 96, 456, 24)
  $ok = New-Object System.Windows.Forms.Button; $ok.Text = 'אישור / OK'; $ok.DialogResult = 'OK'; $ok.SetBounds(12, 136, 110, 28)
  $no = New-Object System.Windows.Forms.Button; $no.Text = 'ביטול / Cancel'; $no.DialogResult = 'Cancel'; $no.SetBounds(130, 136, 110, 28)
  $f.Controls.AddRange(@($he1, $en1, $box, $ok, $no))
  $f.AcceptButton = $ok; $f.CancelButton = $no
  $f.Add_Shown({ $f.Activate(); $box.Focus() })
  $r = $f.ShowDialog()
  $text = $box.Text.Trim()
  $f.Dispose()
  if ($r -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
  return $text
}

# where the scanner runs from
$run = $here
if ($Local) {
  $run = Join-Path $dir 'mail-scan'
  New-Item -ItemType Directory -Force -Path $run | Out-Null
  foreach ($f in 'Scan-Mail.ps1', 'run-hidden.vbs') { Copy-Item -LiteralPath (Join-Path $here $f) -Destination $run -Force }
}

if ($Gui) {
  # checked with the hub before it is kept (the scanner's own schedule call takes the same key)
  while ($true) {
    $key = Read-KeyBox 'הדבק את מפתח סריקת המייל מ-Project Hub (הגדרות ← תוסף Outlook וסריקת מייל ← הפק מפתח).' 'Paste the mail scan key from Project Hub (Settings → Outlook add-in and mail scan → Issue a key).'
    if ($null -eq $key) { Show-Box "ההתקנה בוטלה.`n`nThe installation was cancelled." 'Warning'; exit 1 }
    if (-not $key) { continue }
    try {
      Invoke-RestMethod -UseBasicParsing -Uri "$Hub/api/mail-intake/schedule" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 20 | Out-Null
      break
    } catch {
      $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
      if ($code -eq 401) { Show-Box "המפתח לא התקבל בשרת. נסה שוב.`n`nThe server did not accept the key. Try again." 'Warning'; continue }
      Show-Box "אין חיבור לשרת $Hub. בדוק את החיבור לרשת והרץ שוב.`n`nCan't reach the server $Hub. Check the network and run this again.`n`n$($_.Exception.Message)" 'Error'
      exit 1
    }
  }
  ConvertTo-SecureString $key -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Path (Join-Path $dir 'mail-scan.key')
} else {
  Write-Host 'הדבק את המפתח מ-Project Hub (הגדרות ← תוסף Outlook וסריקת מייל ← הפק מפתח) ולחץ Enter:'
  $sec = Read-Host -AsSecureString
  # an empty Enter would store an empty key and every scan would fail; the length is checked without showing the key
  while ($sec.Length -eq 0) {
    Write-Host 'לא הודבק מפתח. נסה שוב:'
    $sec = Read-Host -AsSecureString
  }
  $sec | ConvertFrom-SecureString | Set-Content -Path (Join-Path $dir 'mail-scan.key')
}

$vbs = Join-Path $run 'run-hidden.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //Nologo `"$vbs`" `"$Hub`""
# every 15 minutes, all day: the scan hours live in Project Hub, so changing them needs no reinstall.
# Scan-Mail.ps1 decides each time whether a scan is due; a run that isn't ends before touching Outlook.
$every = New-ScheduledTaskTrigger -Daily -At '00:00'
$every.Repetition = (New-ScheduledTaskTrigger -Once -At '00:00' -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 1)).Repetition
$triggers = @($every)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
$desc = 'Sends new Outlook mail to Project Hub for task suggestions'
try {
  $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  Register-ScheduledTask -TaskName 'Project Hub mail scan' -Action $action -Trigger ($triggers + $logon) -Settings $settings -Description $desc -Force | Out-Null
} catch {
  # a sign-in trigger can need admin rights on some machines; the 15-minute check is enough
  Register-ScheduledTask -TaskName 'Project Hub mail scan' -Action $action -Trigger $triggers -Settings $settings -Description $desc -Force | Out-Null
  Write-Host 'הערה: הבדיקה בכניסה ל-Windows לא נוספה (דורשת הרשאות). הסריקות בשעות שנקבעו ב-Project Hub פעילות.'
}

$programs = Join-Path ([Environment]::GetFolderPath('Programs')) 'Project Hub'
New-Item -ItemType Directory -Force -Path $programs | Out-Null
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $programs 'סרוק מייל עכשיו.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = "//B //Nologo `"$vbs`" `"$Hub`" now"
# the cube icon: next to this script (the one-click installer puts it there), else the repo's quick-access folder
$ico = @((Join-Path $here 'project-hub-cube.ico'), (Join-Path $here '..\quick-access\project-hub-cube.ico')) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($ico -and $Local) { Copy-Item -LiteralPath $ico -Destination (Join-Path $run 'project-hub-cube.ico') -Force; $ico = Join-Path $run 'project-hub-cube.ico' }
if ($ico) { $lnk.IconLocation = (Resolve-Path $ico).Path }
$lnk.Save()

# projecthub-scan: — the Hub's scan-now button starts a manual scan on this computer. Per user, no admin rights.
$scan = 'HKCU:\Software\Classes\projecthub-scan'
New-Item -Path "$scan\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $scan -Name '(default)' -Value 'URL:Project Hub mail scan'
Set-ItemProperty -Path $scan -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$scan\shell\open\command" -Name '(default)' -Value "wscript.exe //B //Nologo `"$vbs`" `"$Hub`" now"

# projecthub-mail: — the notification's "פתח" opens the suggestions as a small window, like the quick-access
# shortcuts (Chrome first, else Edge). Per user, no admin rights.
$browser = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($browser) {
  $proto = 'HKCU:\Software\Classes\projecthub-mail'
  New-Item -Path "$proto\shell\open\command" -Force | Out-Null
  Set-ItemProperty -Path $proto -Name '(default)' -Value 'URL:Project Hub mail suggestions'
  Set-ItemProperty -Path $proto -Name 'URL Protocol' -Value ''
  Set-ItemProperty -Path "$proto\shell\open\command" -Name '(default)' -Value "`"$browser`" --app=`"$Hub/project_hub_01?quick=mail`" --window-size=470,640"
} else {
  Write-Host 'הערה: לא נמצא Chrome או Edge. "פתח" בהתראה יפתח את Project Hub בדפדפן הרגיל.'
}

Write-Host 'הותקן. בדיקה (בלי לשלוח כלום):'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $run 'Scan-Mail.ps1') -DryRun -Hub $Hub
if ($Gui) {
  Show-Box ("סריקת המייל הותקנה. המחשב בודק כל 15 דקות אם עברה שעת סריקה (נקבעות ב-Project Hub, הגדרות ← תוסף Outlook וסריקת מייל).`n" +
    "סריקה מיד: 'סרוק עכשיו' ב-Project Hub, או תפריט התחל ← Project Hub ← סרוק מייל עכשיו.`n`n" +
    "Mail scan is installed. The computer checks every 15 minutes whether a scan hour has passed (set in Project Hub, Settings → Outlook add-in and mail scan).`n" +
    "To scan now: 'Scan now' in Project Hub, or Start → Project Hub → סרוק מייל עכשיו.")
}
