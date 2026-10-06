@echo off
rem Project Hub quick access - installer for one user (no admin rights needed).
rem Downloaded from Project Hub (Settings > quick access). Double-click to install; run again to update.
rem The PowerShell below the #PS marker does the work; cmd stops at "exit /b" and never reads it.
set "PH_SETUP=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:PH_SETUP,[Text.Encoding]::UTF8); Invoke-Expression $s.Substring($s.IndexOf('#PS' + '-START') + 9)"
exit /b
#PS-START
$ErrorActionPreference = 'Stop'
$Site = 'https://kkarc-hub.azurewebsites.net'
$base = "$Site/project_hub_01"
Add-Type -AssemblyName System.Windows.Forms
function Say($text, $kind = 'Information') {
    $opts = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
    [System.Windows.Forms.MessageBox]::Show($text, 'Project Hub - גישה מהירה', 'OK', $kind, 'Button1', $opts) | Out-Null
}
try {
    # the browser: Chrome first (where the office signs in), else Edge
    $browser = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $browser) { throw 'לא נמצא במחשב Chrome או Edge.' }

    # the icons (the Project Hub cube, and the cube with a "+"), kept with the user's programs
    $dir = Join-Path $env:LOCALAPPDATA 'Programs\ProjectHub'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $appIcon = Join-Path $dir 'project-hub.ico'
    $icon = Join-Path $dir 'project-hub-new-task.ico'
    Invoke-WebRequest "$Site/qa-app.ico" -OutFile $appIcon -UseBasicParsing
    Invoke-WebRequest "$Site/qa-new-task.ico" -OutFile $icon -UseBasicParsing

    # Start menu: the whole app, a new task (Ctrl+Alt+Q) and an update. Names start with "Project Hub"
    # so a Start search finds them. Windows honours a shortcut's hotkey only in the Start menu or on the desktop.
    $programs = Join-Path ([Environment]::GetFolderPath('Programs')) 'Project Hub'
    New-Item -ItemType Directory -Force -Path $programs | Out-Null
    Get-ChildItem $programs -Filter *.lnk | Remove-Item -Force
    $shell = New-Object -ComObject WScript.Shell
    # WScript.Shell saves through the machine's ANSI code page, so on a Windows whose "language for
    # non-Unicode programs" isn't Hebrew a Hebrew name turns into '?' and the save fails. Save under an
    # ASCII name, then rename (PowerShell keeps Unicode).
    function New-HubShortcut($name, $query, $hotkey, $ico) {
        $tmp = Join-Path $programs ("ph-" + [guid]::NewGuid().ToString('N') + '.lnk')
        $l = $shell.CreateShortcut($tmp)
        $l.TargetPath = $browser
        $l.Arguments = if ($query) { "--app=`"$base`?$query`" --window-size=470,560" } else { "--app=`"$base`"" }
        $l.Hotkey = $hotkey
        $l.IconLocation = "$ico,0"
        $l.Description = $name
        $l.Save()
        Move-Item -LiteralPath $tmp -Destination (Join-Path $programs "$name.lnk") -Force
    }
    New-HubShortcut 'Project Hub' '' '' $appIcon
    New-HubShortcut 'Project Hub - משימה חדשה' 'quick=new' 'CTRL+ALT+Q' $icon
    New-HubShortcut 'Project Hub - עדכון למשימה' 'quick=update' '' $icon

    # right-click on the desktop and inside a folder (from a folder, its path goes into the task's note)
    $entries = @(
        @{ Key = 'HKCU:\Software\Classes\DesktopBackground\Shell\ProjectHubTask'; Query = 'quick=new' },
        @{ Key = 'HKCU:\Software\Classes\Directory\Background\shell\ProjectHubTask'; Query = 'quick=new&folder=%V' }
    )
    foreach ($e in $entries) {
        New-Item -Path $e.Key -Force | Out-Null
        Set-ItemProperty -Path $e.Key -Name 'MUIVerb' -Value 'משימה חדשה ב-Project Hub'
        Set-ItemProperty -Path $e.Key -Name 'Icon' -Value $icon
        New-Item -Path "$($e.Key)\command" -Force | Out-Null
        Set-ItemProperty -Path "$($e.Key)\command" -Name '(default)' -Value "`"$browser`" --app=`"$base`?$($e.Query)`" --window-size=470,560"
    }

    # removal: a file next to the icons that undoes all of the above
    $un = @'
@echo off
powershell -NoProfile -Command "Remove-Item -Recurse -Force (Join-Path ([Environment]::GetFolderPath('Programs')) 'Project Hub') -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force 'HKCU:\Software\Classes\DesktopBackground\Shell\ProjectHubTask','HKCU:\Software\Classes\Directory\Background\shell\ProjectHubTask' -ErrorAction SilentlyContinue"
echo Project Hub quick access was removed.
pause
rmdir /s /q "%LOCALAPPDATA%\Programs\ProjectHub" 2>nul
'@
    Set-Content -Path (Join-Path $dir 'Uninstall-ProjectHub.cmd') -Value $un -Encoding ASCII

    Start-Process explorer.exe $programs
    Say ("הגישה המהירה הותקנה.`n`n" +
        "Ctrl+Alt+Q - פותח משימה חדשה (בלשונית למעלה עוברים לעדכון).`n" +
        "לחצן ימני על שולחן העבודה או בתוך תיקייה - 'משימה חדשה ב-Project Hub' (ב-Windows 11 תחת 'הצג אפשרויות נוספות').`n`n" +
        "כפתור בשורת המשימות: בחלון שנפתח, לחצן ימני על 'Project Hub - משימה חדשה' ואז 'הצמד לשורת המשימות' (ב-Windows 11 תחת 'הצג אפשרויות נוספות').`n`n" +
        "בפעם הראשונה החלון יבקש להיכנס עם חשבון kkarc.com.")
}
catch {
    Say ("ההתקנה לא הושלמה:`n" + $_.Exception.Message) 'Error'
}
