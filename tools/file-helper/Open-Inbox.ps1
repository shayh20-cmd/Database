<# Project Hub — filing helper: opens the hub's export inbox window. Run by open-inbox.vbs for a projecthub-inbox: link
   (the "Open" of the helper's notification). The link carries the window's address, URL-encoded; it is opened only
   when it is the hub's own address (the config's "hub", Get-InboxOpenUrl), in a small Chrome / Edge --app window like
   the mail suggestions, else in the default browser. Saved as UTF-8 with BOM. #>
param([string]$Link)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'FileHelper.Core.ps1')
$cfg = Get-HelperConfig
$url = Get-InboxOpenUrl $Link $cfg.hub
if (-not $url) { Write-HelperLog "inbox: a link that is not the hub's was not opened: $Link"; exit 1 }
$browser = Find-AppBrowser
if ($browser) { Start-Process -FilePath $browser -ArgumentList @("--app=`"$url`"", '--window-size=520,680') }
else { Start-Process -FilePath $url }
