<# Project Hub — mail scan: remove the scheduled task, the Start menu shortcut and the local key and state.
   The key on the server stays until it is revoked in Settings ← גישה מהירה ← סריקת מייל. Saved as UTF-8 with BOM. #>
Unregister-ScheduledTask -TaskName 'Project Hub mail scan' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'Project Hub\סרוק מייל עכשיו.lnk') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA 'ProjectHub\mail-scan.*') -ErrorAction SilentlyContinue
Write-Host 'הוסר. כדי לבטל גם את המפתח בשרת: הגדרות ← גישה מהירה ← סריקת מייל ← בטל מפתח.'
