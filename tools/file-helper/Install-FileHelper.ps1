<# Project Hub — filing helper: install for the current Windows user (no admin rights).
   Asks for the person's Outlook add-in key (the one pasted in the add-in's pane), checks it with the hub and keeps
   it with DPAPI; copies the helper to %LOCALAPPDATA%\ProjectHub\file-helper; notes where "@Omicron Projects" is on
   this PC (from Folder Manager's list, when there is one); adds a Startup shortcut that runs the background agent
   at every Windows sign-in, and starts it now. Run it again after an update or to replace the key.
   Saved as UTF-8 with BOM. #>
param([string]$Hub = 'https://kkarc-hub.azurewebsites.net')
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# an agent of an earlier install is stopped first, so the new files are the ones that run
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'FileHelper-Agent\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
foreach ($f in 'File-Helper.ps1', 'FileHelper.Core.ps1', 'FileHelper-Agent.ps1', 'run-file-helper-agent.vbs') { Copy-Item -LiteralPath (Join-Path $here $f) -Destination $dir -Force }
. (Join-Path $dir 'FileHelper.Core.ps1')

$cfg = Get-HelperConfig
$cfg.hub = $Hub.TrimEnd('/')
if (-not $cfg.projectsRoot) { $found = Find-ProjectsRoot; if ($found) { $cfg.projectsRoot = $found } }
Save-HelperConfig $cfg

# the key: checked with the hub before it is kept
while ($true) {
  Write-Host 'הדבק את המפתח האישי של תוסף ה-Outlook (אותו מפתח שמודבק בחלונית של התוסף) ולחץ Enter:'
  $sec = Read-Host -AsSecureString
  if ($sec.Length -eq 0) { continue }
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  try {
    $me = Invoke-RestMethod -UseBasicParsing -Uri ($cfg.hub + '/api/outlook/me') -Headers @{ Authorization = "Bearer $key" }
    Save-HelperKey $key
    Write-Host "המפתח תקין ($($me.email))."
    break
  } catch { Write-Host 'המפתח לא התקבל בשרת. נסה שוב.' }
}

# at every sign-in, and now
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup 'Project Hub filing helper.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = "//B //Nologo `"$dir\run-file-helper-agent.vbs`""
$lnk.Save()
Start-Process wscript.exe -ArgumentList '//B', '//Nologo', "`"$dir\run-file-helper-agent.vbs`""

Write-Host 'הותקן. עוזר התיוק פועל ברקע, ויופעל מחדש בכל כניסה ל-Windows.'
if ($cfg.projectsRoot) { Write-Host "תיקיית הפרויקטים במחשב הזה: $($cfg.projectsRoot)" }
else { Write-Host 'תיקיית הפרויקטים לא זוהתה. בתיוק הראשון תתבקש לבחור אותה.' }
