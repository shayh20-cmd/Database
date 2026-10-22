<# Project Hub — filing helper: remove for the current Windows user. Saved as UTF-8 with BOM. #>
$ErrorActionPreference = 'SilentlyContinue'
# the background agent, and a filing window that is open
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'FileHelper-Agent\.ps1|File-Helper\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) 'Project Hub filing helper.lnk') -Force
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper') -Recurse -Force
foreach ($f in 'file-helper.json', 'file-helper.key', 'file-helper.log') { Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "ProjectHub\$f") -Force }
# the folder itself only when nothing else of Project Hub is kept there
$ph = Join-Path $env:LOCALAPPDATA 'ProjectHub'
if ((Test-Path -LiteralPath $ph) -and -not (Get-ChildItem -LiteralPath $ph -Force)) { Remove-Item -LiteralPath $ph -Force }
Write-Host 'הוסר.'
Write-Host 'Removed.'
