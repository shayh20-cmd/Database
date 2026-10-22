<# Project Hub — filing helper: install for the current Windows user (no admin rights).
   Asks for the person's Outlook add-in key (the one pasted in the add-in's pane), checks it with the hub and keeps
   it with DPAPI; copies the helper to %LOCALAPPDATA%\ProjectHub\file-helper; notes where "@Omicron Projects" is on
   this PC (from Folder Manager's list, when there is one); adds a Startup shortcut that runs the background agent
   at every Windows sign-in, and starts it now. Run it again after an update or to replace the key.
   Saved as UTF-8 with BOM. #>
param([string]$Hub = 'https://kkarc-hub.azurewebsites.net')
$ErrorActionPreference = 'Stop'
function Say([string]$He, [string]$En) { Write-Host $He; Write-Host $En }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# an agent of an earlier install is stopped first, so the new files are the ones that run
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'FileHelper-Agent\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
foreach ($f in 'Run-Task.ps1', 'FileHelper.Core.ps1', 'FileHelper-Agent.ps1', 'run-file-helper-agent.vbs') { Copy-Item -LiteralPath (Join-Path $here $f) -Destination $dir -Force }
# the filing window of the first version is gone: everything is in the Outlook pane now
Remove-Item -LiteralPath (Join-Path $dir 'File-Helper.ps1') -Force -ErrorAction SilentlyContinue
. (Join-Path $dir 'FileHelper.Core.ps1')

$cfg = Get-HelperConfig
$cfg.hub = $Hub.TrimEnd('/')
if (-not $cfg.projectsRoot) { $found = Find-ProjectsRoot; if ($found) { $cfg.projectsRoot = $found } }
Save-HelperConfig $cfg

# the key: checked with the hub before it is kept
while ($true) {
  Say 'הדבק את המפתח האישי של תוסף ה-Outlook (אותו מפתח שמודבק בחלונית של התוסף) ולחץ Enter:' 'Paste your personal Outlook add-in key (the one pasted in the add-in''s pane) and press Enter:'
  $sec = Read-Host -AsSecureString
  if ($sec.Length -eq 0) { continue }
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  try {
    $me = Invoke-RestMethod -UseBasicParsing -Uri ($cfg.hub + '/api/outlook/me') -Headers @{ Authorization = "Bearer $key" }
    Save-HelperKey $key
    Say "המפתח תקין ($($me.email))." "The key is valid ($($me.email))."
    break
  } catch {
    $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    if ($code -eq 401) { Say 'המפתח לא התקבל בשרת. נסה שוב.' 'The server did not accept the key. Try again.'; continue }
    Say "אין חיבור לשרת $($cfg.hub): $($_.Exception.Message)" "Can't reach the server $($cfg.hub): $($_.Exception.Message)"
    Say 'בדוק את החיבור לרשת ואת הכתובת (-Hub), והרץ שוב.' 'Check the network and the address (-Hub), and run this again.'
    exit 1
  }
}

# at every sign-in, and now
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup 'Project Hub filing helper.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = "//B //Nologo `"$dir\run-file-helper-agent.vbs`""
$lnk.Save()
Start-Process wscript.exe -ArgumentList '//B', '//Nologo', "`"$dir\run-file-helper-agent.vbs`""

Say 'הותקן. עוזר התיוק פועל ברקע, ויופעל מחדש בכל כניסה ל-Windows.' 'Installed. The filing helper runs in the background and starts again at every Windows sign-in.'
if ($cfg.projectsRoot) { Say "תיקיית הפרויקטים במחשב הזה: $($cfg.projectsRoot)" "The projects folder on this computer: $($cfg.projectsRoot)" }
else { Say 'תיקיית הפרויקטים לא זוהתה. היא תיקבע בפעם הראשונה שתבחר תיקיית פרויקט מהחלונית של Outlook.' 'The projects folder was not found. It is set the first time you choose a project folder from the Outlook pane.' }
