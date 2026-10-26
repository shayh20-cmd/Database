<# Project Hub — filing helper: remove for the current Windows user. Saved as UTF-8 with BOM. #>
$ErrorActionPreference = 'SilentlyContinue'
# the watchdog task first (or it would start the agent again), then the background agent, and a task that is running (or a filing window of the first version)
try { Unregister-ScheduledTask -TaskName 'Project Hub filing helper' -Confirm:$false -ErrorAction Stop } catch {}
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'FileHelper-Agent\.ps1|file-helper\\Run-Task\.ps1|File-Helper\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) 'Project Hub filing helper.lnk') -Force
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper') -Recurse -Force
foreach ($f in 'file-helper.json', 'file-helper.key', 'file-helper.log', 'file-helper-inbox.json', 'file-helper-sources.json') { Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "ProjectHub\$f") -Force }
# the notification's link of an earlier version; the export inbox folder stays (the files in it are the person's)
Remove-Item 'HKCU:\Software\Classes\projecthub-inbox' -Recurse
# the folder itself only when nothing else of Project Hub is kept there
$ph = Join-Path $env:LOCALAPPDATA 'ProjectHub'
if ((Test-Path -LiteralPath $ph) -and -not (Get-ChildItem -LiteralPath $ph -Force)) { Remove-Item -LiteralPath $ph -Force }
Write-Host 'הוסר.'
Write-Host 'Removed.'
