<# Project Hub — filing helper: remove for the current Windows user. Saved as UTF-8 with BOM. #>
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'FileHelper-Agent\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) 'Project Hub filing helper.lnk') -Force
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper') -Recurse -Force
foreach ($f in 'file-helper.json', 'file-helper.key', 'file-helper.log') { Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "ProjectHub\$f") -Force }
Write-Host 'הוסר.'
