<# Project Hub — filing helper: the background agent. Started hidden at Windows sign-in (Startup shortcut,
   run-file-helper-agent.vbs). It keeps one request open to the hub (/api/outlook/filing-next, up to 25 seconds,
   with the person's quick-filing key) and receives the person's next task from the Outlook pane or the hub — pick
   the project folder, read its tree, open it, file, or publish from the export inbox — with its one-time token, and
   runs it in Run-Task.ps1.
   While that request is open it looks at the export inbox (config "inbox", Desktop\לתיוק) every 3 seconds: once new
   files there have settled (Get-InboxState), it tells the hub (/api/outlook/inbox-batch) and shows a notification
   whose "Open" opens the hub's inbox window (its https address, in the default browser). When it starts, and every 5 minutes
   while the inbox holds files, it asks the hub whether it still has an open batch of this PC, and announces the inbox
   again when not (a restart of the hub loses its batches).
   One agent per Windows session (the mutex). It is started at sign-in (Startup shortcut) and by the scheduled task
   "Project Hub filing helper" every 5 minutes and at sign-in: a start while an agent runs ends at once, a start after
   the agent died brings it back. Anything that ends the loop is logged ("fatal: ...", then "stopped"); one failing
   round (a bad config, an inbox error) is logged and the loop goes on.
   Log: %LOCALAPPDATA%\ProjectHub\file-helper.log.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md
   Saved as UTF-8 with BOM. #>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'FileHelper.Core.ps1')
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http

$mutex = New-Object Threading.Mutex($false, 'Local\ProjectHubFileHelperAgent')
$owner = $false
try { $owner = $mutex.WaitOne(0) }
catch [Threading.AbandonedMutexException] { $owner = $true }   # the agent before died holding it: this one now owns it
if (-not $owner) { exit 0 }

$runner = Join-Path $PSScriptRoot 'Run-Task.ps1'
function Log([string]$Text) { Write-HelperLog $Text }

# ── the export inbox ──
$script:InboxState = $null
$script:InboxKnown = @(Read-InboxKnown)
$script:InboxRetryAt = [DateTime]::MinValue
# when to ask the hub whether it still has this PC's batch: at once after a start, then every 5 minutes while the inbox
# holds files; the first time after a start, files the hub has no batch of are announced with a notification
$script:InboxCheckAt = [DateTime]::MinValue
$script:InboxFirstCheck = $true
function Show-InboxToast([string]$Xml) {
  # a Windows notification, as the mail scanner shows them (under Windows PowerShell's name); a failure is only logged
  try {
    $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $doc.LoadXml($Xml)
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($doc))
  } catch { Log "inbox: notification failed: $($_.Exception.Message)" }
}
function Send-InboxBatch($Cfg, [string]$Key, [bool]$Toast) {
  # tells the hub what is in the inbox now (the whole inbox: a new batch replaces the one before), then, when $Toast,
  # the notification. A 400 (no file the hub would take: programs only, names it cannot keep) counts as announced.
  $body = ConvertTo-InboxBatch $script:InboxState $env:COMPUTERNAME
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Method POST -Headers @{ Authorization = "Bearer $Key" } -Uri ($Cfg.hub.TrimEnd('/') + '/api/outlook/inbox-batch') `
      -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 5 -Compress)))
  } catch {
    if ((Get-ErrorStatus $_.Exception) -eq 400) { Log 'inbox: the hub took none of the files (400)'; return }
    throw
  }
  $j = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
  $url = Get-HubPageUrl ([string]$j.url) $Cfg.hub
  $script:Lang = if ($j.lang -eq 'en') { 'en' } else { 'he' }
  $files = @($script:InboxState.files)
  Log ("inbox: batch {0}, {1} files{2}" -f $j.id, $files.Count, $(if ($Toast) { '' } else { ', again, without a notification' }))
  if (-not $Toast) { return }
  # only an address of the hub itself goes into the notification: Windows opens it in the default browser
  if ($url) { Show-InboxToast (Get-InboxToastXml $files.Count @($files | ForEach-Object { $_.name }) $url) }
  else { Log "inbox: the hub answered an address that is not its own: $($j.url)" }
}
function Test-HubHasBatch($Cfg, [string]$Key) {
  # GET /api/outlook/inbox-batch?pc=: whether the hub still has an open batch of this PC
  $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Headers @{ Authorization = "Bearer $Key" } -Uri ($Cfg.hub.TrimEnd('/') + '/api/outlook/inbox-batch?pc=' + [uri]::EscapeDataString($env:COMPUTERNAME))
  $j = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
  return [bool]$j.id
}
function Step-Inbox($Cfg, [string]$Key) {
  # one look at the inbox; when new files have settled: the hub is told (the whole inbox), then the notification. Now
  # and then (Test-InboxRecheck) the hub is asked whether it still has this PC's batch — none (it restarted, the batch
  # ended after a day, it was dismissed): the inbox is announced again, quietly except for the first time after a start.
  # A failure to reach the hub is tried again after a minute; the files count as announced only once it answered.
  try {
    $now = [DateTime]::UtcNow
    $script:InboxState = Get-InboxState $Cfg.inbox $script:InboxState $now -Known $script:InboxKnown
    if ($now -lt $script:InboxRetryAt) { return }
    $pick = Select-InboxAnnouncement $script:InboxState $script:InboxKnown
    if ($pick.announce) {
      Send-InboxBatch $Cfg $Key $true
      $script:InboxCheckAt = $now.AddMinutes(5)
      $script:InboxFirstCheck = $false
    } elseif (Test-InboxRecheck $script:InboxState $now $script:InboxCheckAt) {
      if (-not (Test-HubHasBatch $Cfg $Key)) { Send-InboxBatch $Cfg $Key $script:InboxFirstCheck }
      $script:InboxCheckAt = $now.AddMinutes(5)
      $script:InboxFirstCheck = $false
    }
    if ($pick.changed) {
      $script:InboxKnown = @($pick.known)
      Save-InboxKnown $script:InboxKnown
    }
  } catch {
    Log "inbox: $($_.Exception.Message)"
    $script:InboxRetryAt = [DateTime]::UtcNow.AddMinutes(1)
  }
}
function Wait-Agent([int]$Seconds, $Cfg, [string]$Key) {
  # a pause that keeps looking at the inbox
  $until = [DateTime]::UtcNow.AddSeconds($Seconds)
  while ([DateTime]::UtcNow -lt $until) { Start-Sleep -Seconds 3; if ($Key) { Step-Inbox $Cfg $Key } }
}

# the long poll runs on HttpClient, so the inbox is looked at every 3 seconds while it waits
$exitCode = 0
try {
  $http = New-Object Net.Http.HttpClient
  $http.Timeout = [TimeSpan]::FromSeconds(60)
  Log 'started'
  while ($true) {
    $cfg = $null; $key = $null; $req = $null; $resp = $null
    try {
      $cfg = Get-HelperConfig
      $key = Read-HelperKey
      if (-not $key) { Log 'no key: run Install-FileHelper.ps1'; Start-Sleep -Seconds 300; continue }
      # the inbox goes along, so the Hub's settings show where this PC's export inbox is
      $uri = $cfg.hub.TrimEnd('/') + '/api/outlook/filing-next?pc=' + [uri]::EscapeDataString($env:COMPUTERNAME) + '&inbox=' + [uri]::EscapeDataString($cfg.inbox)
      $req = New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::Get, $uri)
      $req.Headers.Authorization = New-Object Net.Http.Headers.AuthenticationHeaderValue('Bearer', $key)
      $pending = $http.SendAsync($req)
      while (-not $pending.Wait(3000)) { Step-Inbox $cfg $key }
      Step-Inbox $cfg $key
      $resp = $pending.Result
      $code = [int]$resp.StatusCode
      if ($code -eq 401) { Log 'the key was refused (401): issue a new key and run Install-FileHelper.ps1 again'; Start-Sleep -Seconds 300; continue }
      if (-not $resp.IsSuccessStatusCode) { throw "HTTP $code" }
      $j = [Text.Encoding]::UTF8.GetString($resp.Content.ReadAsByteArrayAsync().Result) | ConvertFrom-Json
      $t = $j.task
      if ($t -and (Test-TaskKind $t.kind) -and (Test-HelperToken $t.token)) {
        Log "task $($t.id) $($t.kind)"
        # -WindowStyle Hidden on Start-Process would hide the folder picker too (it inherits the hidden show state);
        # as powershell.exe's own argument it hides only its console, which may flash for a moment
        Start-Process powershell.exe -ArgumentList @('-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$runner`"", '-Token', $t.token)
      }
    } catch {
      # one failing round never ends the agent: it is logged, and the loop goes on after a pause
      try {
        $e = $_.Exception
        while ($e.InnerException) { $e = $e.InnerException }
        Log "error: $($e.Message)"
      } catch {}
      try { if ($cfg -and $key) { Wait-Agent 15 $cfg $key } else { Start-Sleep -Seconds 15 } } catch { Start-Sleep -Seconds 15 }
    } finally {
      if ($resp) { $resp.Dispose() }
      if ($req) { $req.Dispose() }
    }
  }
} catch {
  # anything that gets out of the loop: the reason is in the log; the scheduled task starts the agent again
  $exitCode = 1
  Log ('fatal: ' + (Format-ErrorDetail $_))
} finally {
  Log 'stopped'
}
exit $exitCode
