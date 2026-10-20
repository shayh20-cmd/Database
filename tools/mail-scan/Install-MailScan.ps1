<# Project Hub — mail scan: install for the current Windows user (no admin rights).
   Asks for the key from Project Hub (Settings ← גישה מהירה ← סריקת מייל), stores it with DPAPI,
   creates the hidden scheduled task "Project Hub mail scan" (Sun–Thu 08:00, 12:00, 16:00, and at
   sign-in) and a Start menu shortcut "סרוק מייל עכשיו". Run it again to replace the key.
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
$days = 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'
$triggers = @(
  (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At '08:00'),
  (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At '12:00'),
  (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At '16:00')
)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
$desc = 'Sends new Outlook mail to Project Hub for task suggestions'
try {
  $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  Register-ScheduledTask -TaskName 'Project Hub mail scan' -Action $action -Trigger ($triggers + $logon) -Settings $settings -Description $desc -Force | Out-Null
} catch {
  # a sign-in trigger can need admin rights on some machines; the three daily times are enough
  Register-ScheduledTask -TaskName 'Project Hub mail scan' -Action $action -Trigger $triggers -Settings $settings -Description $desc -Force | Out-Null
  Write-Host 'הערה: הסריקה בכניסה ל-Windows לא נוספה (דורשת הרשאות). הסריקות ב-8:00, 12:00 ו-16:00 פעילות.'
}

$programs = Join-Path ([Environment]::GetFolderPath('Programs')) 'Project Hub'
New-Item -ItemType Directory -Force -Path $programs | Out-Null
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $programs 'סרוק מייל עכשיו.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = "//B //Nologo `"$vbs`" `"$Hub`""
$ico = Join-Path $here '..\quick-access\project-hub-cube.ico'
if (Test-Path $ico) { $lnk.IconLocation = (Resolve-Path $ico).Path }
$lnk.Save()

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
