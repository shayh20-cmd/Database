<# Project Hub — how much of the Azure Free plan's daily quotas the site used today.
   The Free plan keeps no history: Azure shows only today's counters (they reset at midnight UTC). Run near the
   end of the day (the scheduled task "Project Hub Azure usage" runs it Sunday to Thursday at 23:30); each run
   appends one line to %LOCALAPPDATA%\ProjectHub\azure-usage.csv. Needs the Azure CLI, signed in (az login).
   Saved as UTF-8 with BOM. #>
param(
  [string]$Name = 'kkarc-hub',
  [string]$ResourceGroup = 'project-hub',
  [string]$Out = (Join-Path $env:LOCALAPPDATA 'ProjectHub\azure-usage.csv')
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path (Split-Path $Out -Parent) | Out-Null
$now = Get-Date
try {
  $plan = az webapp show --name $Name --resource-group $ResourceGroup --query serverFarmId -o tsv
  if (-not $plan) { throw 'az webapp show returned nothing (signed in? az login)' }
  $json = az rest --method get --url "https://management.azure.com$plan/usages?api-version=2023-12-01" -o json
  $u = @{}
  foreach ($v in ($json | ConvertFrom-Json).value) { $u[$v.name.value] = $v }
  $pct = { param($k) $x = $u[$k]; if ($x -and $x.limit -gt 0) { [math]::Round(100 * $x.currentValue / $x.limit, 1) } else { '' } }
  $row = [pscustomobject]@{
    measured      = $now.ToString('yyyy-MM-dd HH:mm')
    weekday       = $now.DayOfWeek
    sent_mb       = [math]::Round($u['BytesSent'].currentValue / 1MB, 1)
    sent_pct      = & $pct 'BytesSent'
    cpu_min       = [math]::Round($u['CpuTime'].currentValue / 60000, 1)
    cpu_pct       = & $pct 'CpuTime'
    storage_mb    = [math]::Round($u['FileSystemStorage'].currentValue / 1MB, 1)
    storage_pct   = & $pct 'FileSystemStorage'
    received_mb   = [math]::Round($u['BytesReceived'].currentValue / 1MB, 1)
    stop_requests = $u['WPStopRequests'].currentValue
    error         = ''
  }
} catch {
  $row = [pscustomobject]@{ measured = $now.ToString('yyyy-MM-dd HH:mm'); weekday = $now.DayOfWeek; sent_mb = ''; sent_pct = ''; cpu_min = ''; cpu_pct = ''; storage_mb = ''; storage_pct = ''; received_mb = ''; stop_requests = ''; error = $_.Exception.Message }
}
$row | Export-Csv -LiteralPath $Out -Append -NoTypeInformation -Encoding UTF8
$row
