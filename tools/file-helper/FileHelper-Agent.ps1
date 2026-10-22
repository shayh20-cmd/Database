<# Project Hub — filing helper: the background agent. Started hidden at Windows sign-in (Startup shortcut,
   run-file-helper-agent.vbs). It keeps one request open to the hub (/api/outlook/filing-next, up to 25 seconds,
   with the person's Outlook add-in key) and receives the person's next task from the Outlook pane — pick the project
   folder, read its tree, open it, or file — with its one-time token, and runs it in Run-Task.ps1.
   One agent per Windows session. Log: %LOCALAPPDATA%\ProjectHub\file-helper.log.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md
   Saved as UTF-8 with BOM. #>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'FileHelper.Core.ps1')
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$mutex = New-Object Threading.Mutex($false, 'Local\ProjectHubFileHelperAgent')
if (-not $mutex.WaitOne(0)) { exit 0 }

$runner = Join-Path $PSScriptRoot 'Run-Task.ps1'
function Log([string]$Text) { Write-HelperLog $Text }
Log 'started'
while ($true) {
  $cfg = Get-HelperConfig
  $key = Read-HelperKey
  if (-not $key) { Log 'no key: run Install-FileHelper.ps1'; Start-Sleep -Seconds 300; continue }
  try {
    $uri = $cfg.hub.TrimEnd('/') + '/api/outlook/filing-next?pc=' + [uri]::EscapeDataString($env:COMPUTERNAME)
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Headers @{ Authorization = "Bearer $key" } -Uri $uri
    $j = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
    $t = $j.task
    if ($t -and (Test-TaskKind $t.kind) -and (Test-HelperToken $t.token)) {
      Log "task $($t.id) $($t.kind)"
      # -WindowStyle Hidden on Start-Process would hide the folder picker too (it inherits the hidden show state);
      # as powershell.exe's own argument it hides only its console, which may flash for a moment
      Start-Process powershell.exe -ArgumentList @('-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$runner`"", '-Token', $t.token)
    }
  } catch {
    $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    if ($code -eq 401) { Log 'the key was refused (401): issue a new key and run Install-FileHelper.ps1 again'; Start-Sleep -Seconds 300 }
    else { Log "error: $($_.Exception.Message)"; Start-Sleep -Seconds 15 }
  }
}
