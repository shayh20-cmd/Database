<# Project Hub — mail scan: remove the scheduled task, the Start menu shortcut, the projecthub-mail: and
   projecthub-scan: links and the local key and state.
   The key on the server stays until it is revoked in Settings ← תוסף Outlook וסריקת מייל. Saved as UTF-8 with BOM. #>
Unregister-ScheduledTask -TaskName 'Project Hub mail scan' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'Project Hub\סרוק מייל עכשיו.lnk') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA 'ProjectHub\mail-scan.*') -ErrorAction SilentlyContinue
# the scripts of a one-click install (ProjectHub-MailScan-Setup.cmd); a repo install has none there
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'ProjectHub\mail-scan') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Classes\projecthub-mail' -Recurse -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Classes\projecthub-scan' -Recurse -ErrorAction SilentlyContinue
Write-Host 'הוסר. כדי לבטל גם את המפתח בשרת: הגדרות ← תוסף Outlook וסריקת מייל ← בטל מפתח.'
