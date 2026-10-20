<# Project Hub — mail scan: install for the current Windows user (no admin rights).
   Asks for the key from Project Hub (Settings ← גישה מהירה ← סריקת מייל), stores it with DPAPI,
   creates the hidden scheduled task "Project Hub mail scan" (every 15 minutes and at sign-in; each run scans
   only when one of the scan hours set in Project Hub, Settings ← סריקת מייל, has passed), the Start menu
   shortcut "סרוק מייל עכשיו" and the projecthub-scan: link behind the Hub's scan-now button (both scan at once).
   Run it again to replace the key.
   Saved as UTF-8 with BOM. #>
param([string]$Hub = 'https://kkarc-hub.azurewebsites.net')
$ErrorActionPreference = 'Stop'
$Hub = $Hub.TrimEnd('/')
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $env:LOCALAPPDATA 'ProjectHub'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host 'הדבק את המפתח מ-Project Hub (הגדרות ← גישה מהירה ← סריקת מייל) ולחץ Enter:'
$sec = Read-Host -AsSecureString
# an empty Enter would store an empty key and every scan would fail; the length is checked without showing the key
while ($sec.Length -eq 0) {
  Write-Host 'לא הודבק מפתח. נסה שוב:'
  $sec = Read-Host -AsSecureString
}
$sec | ConvertFrom-SecureString | Set-Content -Path (Join-Path $dir 'mail-scan.key')

$vbs = Join-Path $here 'run-hidden.vbs'
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
$ico = Join-Path $here '..\quick-access\project-hub-cube.ico'
if (Test-Path $ico) { $lnk.IconLocation = (Resolve-Path $ico).Path }
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
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'Scan-Mail.ps1') -DryRun -Hub $Hub
