<#
.SYNOPSIS
Quick access to Project Hub from anywhere in Windows: a keyboard shortcut and a right-click item.

.DESCRIPTION
For the current user only (no admin rights, nothing outside the user's own profile/registry):
  - Start menu shortcuts that open the compact quick window. One of them carries a one-handed
    keyboard shortcut, Ctrl+Alt+Q: it opens a new task, and a tab at the top switches to adding
    an update. (Windows only honours a shortcut's hotkey in the Start menu or on the desktop.)
  - A right-click item "משימה חדשה ב-Project Hub" on the desktop background and on any folder's
    background. From a folder, the folder's path is filled in as the task's note.
    On Windows 11 it is under "Show more options" (Shift+F10), like every classic menu item.
  - A scheduled task, "Project Hub keep-awake": Sunday–Thursday 07:00–19:00, every 10 minutes, one
    quiet request to the site so Azure's free tier doesn't put it to sleep (waking it is what makes
    a window slow to open). Hidden, no window; it only runs while this computer is on.
The window opens in Chrome (or Edge if Chrome isn't installed) as a small app window, signed in
with the browser's own session.

Run Uninstall-QuickAccess.ps1 to remove everything this adds.

.PARAMETER Site
The Project Hub address. Defaults to the office site on Azure.
#>
[CmdletBinding()]
param(
    [string]$Site = "https://kkarc-hub.azurewebsites.net",
    # the global keyboard shortcut; Windows accepts e.g. "CTRL+ALT+Q" or a function key ("F9")
    [string]$Hotkey = "CTRL+ALT+Q"
)
$ErrorActionPreference = "Stop"
$base = $Site.TrimEnd('/') + "/project_hub_01"

# the browser: Chrome first (where the office signs in), else Edge
$candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { throw "Neither Chrome nor Edge was found." }
$window = "--window-size=470,560"

# the Project Hub icon with a "+" (not Chrome's), copied next to the user's profile so it outlives the repo folder
$iconDir = Join-Path $env:LOCALAPPDATA "ProjectHub"
New-Item -ItemType Directory -Path $iconDir -Force | Out-Null
$icon = Join-Path $iconDir "project-hub-new-task.ico"
Copy-Item (Join-Path $PSScriptRoot "project-hub-new-task.ico") $icon -Force

# 1. Start menu shortcuts with hotkeys
$programs = Join-Path ([Environment]::GetFolderPath('Programs')) "Project Hub"
New-Item -ItemType Directory -Path $programs -Force | Out-Null
$shell = New-Object -ComObject WScript.Shell
function New-QuickShortcut($name, $query, $hotkey) {
    $lnk = $shell.CreateShortcut((Join-Path $programs "$name.lnk"))
    $lnk.TargetPath = $browser
    $lnk.Arguments = "--app=`"$base`?$query`" $window"
    $lnk.Hotkey = $hotkey
    $lnk.IconLocation = "$icon,0"
    $lnk.Description = "Project Hub — $name"
    $lnk.Save()
}
New-QuickShortcut "משימה חדשה" "quick=new" $Hotkey
# no hotkey of its own: the quick window's tab switches to an update (this clears an older Ctrl+Alt+U)
New-QuickShortcut "עדכון למשימה" "quick=update" ""

# 2. Right-click: desktop background and folder background (current user only)
$label = "משימה חדשה ב-Project Hub"
$entries = @(
    @{ Key = "HKCU:\Software\Classes\DesktopBackground\Shell\ProjectHubTask"; Query = "quick=new" },
    @{ Key = "HKCU:\Software\Classes\Directory\Background\shell\ProjectHubTask"; Query = "quick=new&folder=%V" }
)
foreach ($e in $entries) {
    New-Item -Path $e.Key -Force | Out-Null
    Set-ItemProperty -Path $e.Key -Name "MUIVerb" -Value $label
    Set-ItemProperty -Path $e.Key -Name "Icon" -Value "$icon"
    New-Item -Path "$($e.Key)\command" -Force | Out-Null
    Set-ItemProperty -Path "$($e.Key)\command" -Name "(default)" -Value "`"$browser`" --app=`"$base`?$($e.Query)`" $window"
}

# 3. Keep the site awake during the work week (the free tier sleeps after ~20 idle minutes)
$keepAlive = Join-Path $iconDir "keepalive.vbs"
Copy-Item (Join-Path $PSScriptRoot "keepalive.vbs") $keepAlive -Force
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "//B //Nologo `"$keepAlive`" `"$($Site.TrimEnd('/'))`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday, Monday, Tuesday, Wednesday, Thursday -At "07:00"
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "07:00" -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Hours 12)).Repetition
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "Project Hub keep-awake" -Action $action -Trigger $trigger -Settings $settings -Description "Keeps the Project Hub site on Azure awake during work hours" -Force | Out-Null

Write-Host ""
Write-Host "Project Hub quick access is installed (browser: $browser)" -ForegroundColor Green
Write-Host "  $Hotkey  new task (the tab at the top switches to an update)"
Write-Host "  Right-click the desktop or inside a folder → $label"
Write-Host "  (Windows 11: under 'Show more options')"
Write-Host "  Keep-awake: Sun-Thu 07:00-19:00, every 10 minutes (Task Scheduler: 'Project Hub keep-awake')"
Write-Host "  Taskbar button: Start → Project Hub → right-click 'משימה חדשה' → Pin to taskbar"
Write-Host ""
