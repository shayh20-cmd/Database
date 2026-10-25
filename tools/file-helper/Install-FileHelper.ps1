<# Project Hub — filing helper: install for the current Windows user (no admin rights).
   Asks for the person's Outlook add-in key (the one pasted in the add-in's pane), checks it with the hub and keeps
   it with DPAPI; copies the helper to %LOCALAPPDATA%\ProjectHub\file-helper; lists the project roots this PC
   reaches (the "@<Name> Projects" folders at the top of its drives); adds a Startup shortcut that runs the background agent
   at every Windows sign-in, and starts it now; makes the export inbox (Desktop\לתיוק unless -Inbox says otherwise).
   The inbox notification's "Open" is the hub's own https address (the default browser opens it); the quick-access
   window's "תיוק" tab is the way back to it. Run it again after an update or to replace the key.
   -Gui: asks for the key in a small window and ends with a message box — the one-click installer
   (ProjectHub-FileHelper-Setup.cmd, downloaded from Project Hub's Settings) runs it that way from a temporary folder.
   Saved as UTF-8 with BOM. #>
param([string]$Hub = 'https://kkarc-hub.azurewebsites.net', [string]$Inbox = '', [switch]$Gui)
$ErrorActionPreference = 'Stop'
function Say([string]$He, [string]$En) { Write-Host $He; Write-Host $En }
if ($Gui) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
}
$Title = 'Project Hub - תיוק מהיר'
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
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# an agent of an earlier install is stopped first, so the new files are the ones that run
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'FileHelper-Agent\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
foreach ($f in 'Run-Task.ps1', 'FileHelper.Core.ps1', 'FileHelper-Agent.ps1', 'run-file-helper-agent.vbs') { Copy-Item -LiteralPath (Join-Path $here $f) -Destination $dir -Force }
# the filing window of the first version is gone: everything is in the Outlook pane now; and the projecthub-inbox: link
# of an earlier notification (Windows did not hand it to its handler from a notification) with its two files
foreach ($f in 'File-Helper.ps1', 'Open-Inbox.ps1', 'open-inbox.vbs') { Remove-Item -LiteralPath (Join-Path $dir $f) -Force -ErrorAction SilentlyContinue }
Remove-Item 'HKCU:\Software\Classes\projecthub-inbox' -Recurse -ErrorAction SilentlyContinue
. (Join-Path $dir 'FileHelper.Core.ps1')

$cfg = Get-HelperConfig
$cfg.hub = $Hub.TrimEnd('/')
if ($Inbox) { $cfg.inbox = [IO.Path]::GetFullPath($Inbox).TrimEnd('\') }
# the roots are found on the drives at every task; a projectsRoot of an earlier version is kept as is
Save-HelperConfig $cfg

# the key: checked with the hub before it is kept
$askHe = 'הדבק את המפתח האישי של תוסף ה-Outlook (אותו מפתח שמודבק בחלונית של התוסף; ב-Project Hub: הגדרות ← תיוק מהיר).'
$askEn = 'Paste your personal Outlook add-in key (the one pasted in the add-in''s pane; in Project Hub: Settings → Quick filing).'
while ($true) {
  if ($Gui) {
    $key = Read-KeyBox $askHe $askEn
    if ($null -eq $key) { Show-Box "ההתקנה בוטלה.`n`nThe installation was cancelled." 'Warning'; exit 1 }
    if (-not $key) { continue }
  } else {
    Say ($askHe + ' ולחץ Enter:') ($askEn + ' Then press Enter:')
    $sec = Read-Host -AsSecureString
    if ($sec.Length -eq 0) { continue }
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  }
  try {
    $me = Invoke-RestMethod -UseBasicParsing -Uri ($cfg.hub + '/api/outlook/me') -Headers @{ Authorization = "Bearer $key" }
    Save-HelperKey $key
    Say "המפתח תקין ($($me.email))." "The key is valid ($($me.email))."
    break
  } catch {
    $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    if ($code -eq 401) {
      Say 'המפתח לא התקבל בשרת. נסה שוב.' 'The server did not accept the key. Try again.'
      if ($Gui) { Show-Box "המפתח לא התקבל בשרת. נסה שוב.`n`nThe server did not accept the key. Try again." 'Warning' }
      continue
    }
    Say "אין חיבור לשרת $($cfg.hub): $($_.Exception.Message)" "Can't reach the server $($cfg.hub): $($_.Exception.Message)"
    Say 'בדוק את החיבור לרשת ואת הכתובת (-Hub), והרץ שוב.' 'Check the network and the address (-Hub), and run this again.'
    if ($Gui) { Show-Box "אין חיבור לשרת $($cfg.hub). בדוק את החיבור לרשת והרץ שוב.`n`nCan't reach the server $($cfg.hub). Check the network and run this again.`n`n$($_.Exception.Message)" 'Error' }
    exit 1
  }
}

# the export inbox
New-Item -ItemType Directory -Force -Path $cfg.inbox | Out-Null

# at every sign-in, and now
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup 'Project Hub filing helper.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = "//B //Nologo `"$dir\run-file-helper-agent.vbs`""
$lnk.Save()
Start-Process wscript.exe -ArgumentList '//B', '//Nologo', "`"$dir\run-file-helper-agent.vbs`""

Say 'הותקן. עוזר התיוק פועל ברקע, ויופעל מחדש בכל כניסה ל-Windows.' 'Installed. The filing helper runs in the background and starts again at every Windows sign-in.'
Say "תיבת הייצוא: $($cfg.inbox) — קבצים שמייצאים אליה מוצעים לפרסום ב-PUBLISH של הפרויקט." "The export inbox: $($cfg.inbox) — files exported into it are offered for publishing to the project's PUBLISH."
$roots = Get-ProjectRoots $cfg
if ($roots.Count) {
  Say 'תיקיות הפרויקטים שהמחשב הזה מגיע אליהן:' 'The project folders this computer reaches:'
  foreach ($k in $roots.Keys) { Write-Host "  $k  ($($roots[$k]))" }
} else {
  Say 'לא נמצאו תיקיות פרויקטים (@... Projects) בכוננים של המחשב הזה. תיקייה שתבחר מהחלונית של Outlook תישמר עם תיקיית האב שלה.' 'No project folders (@... Projects) were found on this computer''s drives. A folder you choose from the Outlook pane is kept with its parent folder.'
}
if ($Gui) {
  Show-Box ("עוזר התיוק הותקן. הוא פועל ברקע ויופעל מחדש בכל כניסה ל-Windows.`n`n" +
    "תיבת הייצוא: $($cfg.inbox)`n" +
    "קבצים שמייצאים אליה מוצעים לפרסום בחלון 'תיוק קבצים' של Project Hub.`n`n" +
    "סגור את Chrome ופתח אותו מחדש.`n`n" +
    "The filing helper is installed. It runs in the background and starts again at every Windows sign-in.`n" +
    "The export inbox: $($cfg.inbox)`n" +
    "Restart Chrome (close it and open it again).")
}
