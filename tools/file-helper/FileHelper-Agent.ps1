<# Project Hub — filing helper: the background agent. Started hidden at Windows sign-in (Startup shortcut,
   run-file-helper-agent.vbs). It keeps one request open to the hub (/api/outlook/filing-next, up to 25 seconds,
   with the person's Outlook add-in key) and, when the person clicks "תייק בתיקיית הפרויקט" in Outlook, receives
   that job's one-time token and opens the filing window (File-Helper.ps1) with it.
   One agent per Windows session. Log: %LOCALAPPDATA%\ProjectHub\file-helper.log.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md
   Saved as UTF-8 with BOM. #>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'FileHelper.Core.ps1')
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$mutex = New-Object Threading.Mutex($false, 'Local\ProjectHubFileHelperAgent')
if (-not $mutex.WaitOne(0)) { exit 0 }

$log = Join-Path $env:LOCALAPPDATA 'ProjectHub\file-helper.log'
function Log([string]$Text) {
  try {
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 200KB) { Remove-Item -LiteralPath $log }
    Add-Content -LiteralPath $log -Value ('{0:s} {1}' -f (Get-Date), $Text) -Encoding UTF8
  } catch {}
}
$window = Join-Path $PSScriptRoot 'File-Helper.ps1'
Log 'started'
while ($true) {
  $cfg = Get-HelperConfig
  $key = Read-HelperKey
  if (-not $key) { Log 'no key: run Install-FileHelper.ps1'; Start-Sleep -Seconds 300; continue }
  try {
    $uri = $cfg.hub.TrimEnd('/') + '/api/outlook/filing-next?pc=' + [uri]::EscapeDataString($env:COMPUTERNAME)
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Headers @{ Authorization = "Bearer $key" } -Uri $uri
    $j = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json
    if ($j.job -and (Test-HelperToken $j.job.token)) {
      Log "job $($j.job.id)"
      Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', "`"$window`"", '-Token', $j.job.token)
    }
  } catch {
    $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    if ($code -eq 401) { Log 'the key was refused (401): issue a new key and run Install-FileHelper.ps1 again'; Start-Sleep -Seconds 300 }
    else { Log "error: $($_.Exception.Message)"; Start-Sleep -Seconds 15 }
  }
}
