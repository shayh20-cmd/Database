<#
.SYNOPSIS
Deploys the project hub — project_hub_01.html and its server — to Azure App Service
behind Microsoft (Entra) sign-in, so the firm works on one shared copy.

.DESCRIPTION
Creates what is missing, reuses what exists, deploys the code and checks that the site
answers. Re-runnable: a second run only redeploys the code.

What it creates, all in one resource group:
  - a Linux App Service plan (F1, free, by default) and a Node 22 web app
  - an Entra app registration (single tenant) with a client secret, used by App Service
    authentication ("Easy Auth") to sign people in with their work account
  - App Service authentication, with the server letting only the sign-in page through
    without a session

The documents live under /home/data on the web app, which App Service keeps across
restarts and deployments. See docs\azure.md.

.PARAMETER Name
The web app's name. It becomes the address — https://<name>.azurewebsites.net — so it
has to be unique across Azure.

.PARAMETER ResourceGroup
The resource group to hold everything. Created if missing.

.PARAMETER Location
Azure region. Regions go in and out of capacity for new subscriptions; if one refuses,
the script lists the ones offering the SKU.

.PARAMETER Sku
App Service plan tier. F1 is free (60 CPU-minutes a day, slow first request after a
quiet spell). B1 removes both limits.

.PARAMETER Seed
A project_hub_01.json to upload as the shared project document, for example the one in
data\ on the machine that has the demo project. Overwrites whatever is on the site.

.PARAMETER CodeOnly
Only package and deploy the code, then check the site. Skips creating and configuring
resources; use it for a page or server change once the site exists.

.EXAMPLE
.\Deploy-Azure.ps1 -Name kkarc-hub

.EXAMPLE
.\Deploy-Azure.ps1 -Name kkarc-hub -Seed C:\Users\Omega\Database\data\project_hub_01.json
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$')]
    [string]$Name,

    [string]$ResourceGroup = "project-hub",
    [string]$Location = "israelcentral",
    [ValidateSet("F1", "B1", "B2", "S1")]
    [string]$Sku = "F1",
    [string]$Seed,
    [switch]$CodeOnly
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$root = $PSScriptRoot
$plan = "$Name-plan"
$url = "https://$Name.azurewebsites.net"
$secretSetting = "MICROSOFT_PROVIDER_AUTHENTICATION_SECRET"

function Fail($message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Red
    Write-Host ""
    exit 1
}

function Step($message) { Write-Host $message -ForegroundColor Cyan }

# ARM briefly reports a resource it has just created as missing, often enough in some
# regions to fail a run at random. Retried only for that signature: a name already
# taken, or a region refusing the subscription, is a real answer.
function Invoke-AzWithRetry {
    param([Parameter(Mandatory)][scriptblock]$Action, [int]$Attempts = 6)
    # az writes routine notes to stderr (e.g. the SCM_DO_BUILD_DURING_DEPLOYMENT warning);
    # with the script's $ErrorActionPreference = "Stop", merging that into the error stream
    # via 2>&1 would turn a harmless note into a terminating exception. Local override only.
    $ErrorActionPreference = "Continue"
    $output = $null
    foreach ($attempt in 1..$Attempts) {
        $output = & $Action 2>&1
        if ($LASTEXITCODE -eq 0) { return [pscustomobject]@{ Success = $true; Output = $output } }
        if (($output | Out-String) -notmatch "ResourceNotFound|TooManyRequests|ServiceUnavailable|GatewayTimeout|429|503") { break }
        Start-Sleep -Seconds ([Math]::Min(5 * $attempt, 20))
    }
    return [pscustomobject]@{ Success = $false; Output = $output }
}

# Writes app settings through a file, so a secret never lands in shell history.
function Set-AppSettings([hashtable]$settings) {
    $file = Join-Path ([System.IO.Path]::GetTempPath()) "hub-settings-$([guid]::NewGuid()).json"
    try {
        $payload = @($settings.GetEnumerator() | ForEach-Object {
            [pscustomobject]@{ name = $_.Key; value = $_.Value; slotSetting = $false }
        })
        $payload | ConvertTo-Json -Depth 3 -AsArray | Set-Content -Path $file -Encoding utf8
        $applied = Invoke-AzWithRetry {
            az webapp config appsettings set --name $Name --resource-group $ResourceGroup --settings "@$file" --output none
        }
        if (-not $applied.Success) { Fail "Could not apply the configuration.`n`n$($applied.Output | Out-String)" }
    }
    finally {
        if (Test-Path $file) { Remove-Item $file -Force }
    }
}

# ---------------------------------------------------------------------------
# Refuse before deploying, not after
# ---------------------------------------------------------------------------
if ($Seed -and -not (Test-Path $Seed)) { Fail "Seed file not found: $Seed" }

if (-not (Test-Path (Join-Path $root "tools/local-server/node_modules/serve-handler"))) {
    Fail @"
The server's dependencies are not installed, so the deployed app would not start.

    cd tools\local-server
    npm install

Then run this again.
"@
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
}
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Fail "The Azure CLI is not installed or not on PATH.`n`n    winget install Microsoft.AzureCLI`n    az login"
}

Step "Checking the Azure sign-in..."
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) { Fail "Not signed in to Azure. Run 'az login', then this script again." }
$tenant = $account.tenantId
$subscription = $account.id
Write-Host "  subscription: $($account.name)  tenant: $($account.tenantDefaultDomain)" -ForegroundColor Gray
Write-Host ""

# ---------------------------------------------------------------------------
# Resources, created only when missing. -CodeOnly skips all of it: every configuration
# write restarts the app, and the free tier allows 15 restarts an hour.
# ---------------------------------------------------------------------------
if (-not $CodeOnly) {
$existingGroup = az group show --name $ResourceGroup 2>$null
if (-not $existingGroup) {
    Step "Resource group '$ResourceGroup'..."
    az group create --name $ResourceGroup --location $Location --output none
    if ($LASTEXITCODE -ne 0) { Fail "Could not create the resource group." }
}

$existingPlan = az appservice plan show --name $plan --resource-group $ResourceGroup 2>$null
if (-not $existingPlan) {
    Step "App Service plan '$plan' ($Sku, Linux)..."
    $planResult = az appservice plan create --name $plan --resource-group $ResourceGroup `
        --location $Location --sku $Sku --is-linux --output none 2>&1
    if ($LASTEXITCODE -ne 0) {
        $detail = ($planResult | Out-String).Trim()
        $offering = az appservice list-locations --sku $Sku --linux-workers-enabled --query "[].name" -o tsv 2>$null
        Fail @"
Azure will not create a $Sku plan in '$Location'.

Azure said:
$detail

Regions offering $Sku for this subscription right now:
$(($offering | Out-String).Trim())

Try one of them:

    .\Deploy-Azure.ps1 -Name $Name -Location <region>
"@
    }
}
else {
    $currentSku = ($existingPlan | ConvertFrom-Json).sku.name
    if ($currentSku -ne $Sku) {
        Step "Moving the plan from $currentSku to $Sku..."
        az appservice plan update --name $plan --resource-group $ResourceGroup --sku $Sku --output none
    }
}

$existingApp = az webapp show --name $Name --resource-group $ResourceGroup 2>$null
if (-not $existingApp) {
    Step "Web app '$Name' (Node 22)..."
    $appResult = az webapp create --name $Name --resource-group $ResourceGroup --plan $plan `
        --runtime "NODE:22-lts" --output none 2>&1
    if ($LASTEXITCODE -ne 0) {
        Fail @"
Could not create the web app. The usual cause is that '$Name' is taken — it has to be
unique across all of Azure. Try another -Name.

Azure said:
$(($appResult | Out-String).Trim())
"@
    }
}

else {
    # The free tier allows 15 worker restarts an hour. Past that, Azure disables the site
    # — and its deployment endpoint — until the hour turns, and every step below fails
    # with "Site Disabled". Say so up front rather than after five minutes of retries.
    $usage = ($existingApp | ConvertFrom-Json).usageState
    if ($usage -eq "Exceeded") {
        $resetAt = az rest --method get --url "https://management.azure.com/subscriptions/$subscription/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/$Name/usages?api-version=2022-03-01" `
            --query "value[?name.value=='WPStopRequests'].nextResetTime | [0]" -o tsv 2>$null
        Fail @"
'$Name' is disabled by Azure: a free-tier quota was exceeded (usually the 15 worker
restarts an hour, after a crash loop). It comes back at $resetAt UTC.

Either wait and run this again, or move off the free tier now:

    .\Deploy-Azure.ps1 -Name $Name -Sku B1
"@
    }
}

$hardened = Invoke-AzWithRetry {
    az webapp update --name $Name --resource-group $ResourceGroup --https-only true --output none
}
if (-not $hardened.Success) { Fail "Could not require HTTPS on '$Name'.`n`n$($hardened.Output | Out-String)" }

# The startup command is set only after the code is deployed (below): set earlier, the
# container starts, finds nothing to run, and restarts until the free tier's restart
# quota disables the whole site.
$ftps = Invoke-AzWithRetry {
    az webapp config set --name $Name --resource-group $ResourceGroup --ftps-state Disabled --output none
}
if (-not $ftps.Success) { Fail "Could not disable FTP on '$Name'.`n`n$($ftps.Output | Out-String)" }

# ---------------------------------------------------------------------------
# Sign-in: an app registration in the firm's directory, single tenant
# ---------------------------------------------------------------------------
Step "App registration '$Name'..."
$callback = "$url/.auth/login/aad/callback"
$app = az ad app list --display-name $Name --query "[?displayName=='$Name'] | [0]" -o json 2>$null | ConvertFrom-Json
if (-not $app) {
    $appResult = az ad app create --display-name $Name --sign-in-audience AzureADMyOrg `
        --web-redirect-uris $callback --enable-id-token-issuance true -o json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Fail @"
Could not register the application in Entra.

Your account may not be allowed to register applications in this directory. Ask an
administrator to run this script, or to grant your account the Application Developer
role, then run it again.

Azure said:
$(($appResult | Out-String).Trim())
"@
    }
    $app = ($appResult | Out-String) | ConvertFrom-Json
}
$appId = $app.appId

$sp = az ad sp show --id $appId 2>$null
if (-not $sp) {
    az ad sp create --id $appId --output none
    if ($LASTEXITCODE -ne 0) { Fail "Could not create the service principal for $appId." }
}

# The secret is created once and kept in the app's settings; a re-run leaves it alone.
$settings = [ordered]@{
    SITE_MODE                      = "cloud"
    DATA_DIR                       = "/home/data"
    SCM_DO_BUILD_DURING_DEPLOYMENT = "false"
}
$hasSecret = az webapp config appsettings list --name $Name --resource-group $ResourceGroup `
    --query "[?name=='$secretSetting'].name" -o tsv 2>$null
if (-not $hasSecret) {
    Step "Client secret (valid two years)..."
    $secret = az ad app credential reset --id $appId --display-name "easy-auth" --years 2 --append `
        --query password -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $secret) { Fail "Could not create a client secret for $appId." }
    $settings[$secretSetting] = $secret
    $secretExpires = (Get-Date).AddYears(2).ToString("yyyy-MM-dd")
}

Step "Applying configuration..."
Set-AppSettings $settings

# Anonymous requests reach the app, which is the gate: without a session it serves only
# /health and the sign-in page (login.html, whose button starts Microsoft sign-in) and
# answers everything else with a redirect there or a 401. The smoke check below verifies it.
Step "App Service authentication..."
$auth = @{
    properties = @{
        platform = @{ enabled = $true }
        globalValidation = @{
            requireAuthentication       = $false
            unauthenticatedClientAction = "AllowAnonymous"
        }
        identityProviders = @{
            azureActiveDirectory = @{
                enabled = $true
                registration = @{
                    openIdIssuer            = "https://login.microsoftonline.com/$tenant/v2.0"
                    clientId                = $appId
                    clientSecretSettingName = $secretSetting
                }
                validation = @{ allowedAudiences = @("api://$appId") }
            }
        }
        login = @{ tokenStore = @{ enabled = $true } }
        httpSettings = @{ requireHttps = $true }
    }
}
$authFile = Join-Path ([System.IO.Path]::GetTempPath()) "hub-auth-$([guid]::NewGuid()).json"
try {
    $auth | ConvertTo-Json -Depth 8 | Set-Content -Path $authFile -Encoding utf8
    $authUrl = "https://management.azure.com/subscriptions/$subscription/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/$Name/config/authsettingsV2?api-version=2022-03-01"
    $authApplied = Invoke-AzWithRetry { az rest --method put --url $authUrl --body "@$authFile" --output none }
    if (-not $authApplied.Success) { Fail "Could not configure authentication.`n`n$($authApplied.Output | Out-String)" }
}
finally {
    if (Test-Path $authFile) { Remove-Item $authFile -Force }
}
} # end of -not $CodeOnly

# ---------------------------------------------------------------------------
# Code: the page, the server and its installed dependencies. Nothing else.
# ---------------------------------------------------------------------------
$stage = Join-Path ([System.IO.Path]::GetTempPath()) "hub-stage-$([guid]::NewGuid())"
$zip = "$stage.zip"
try {
    Step "Packaging..."
    New-Item -ItemType Directory -Path (Join-Path $stage "tools/local-server") -Force | Out-Null
    foreach ($f in "project_hub_01.html", "login.html", "i18n.js", "i18n-dict.js") {
        Copy-Item (Join-Path $root $f) $stage
    }
    foreach ($f in "server.js", "package.json", "package-lock.json") {
        Copy-Item (Join-Path $root "tools/local-server/$f") (Join-Path $stage "tools/local-server")
    }
    Copy-Item (Join-Path $root "tools/local-server/node_modules") (Join-Path $stage "tools/local-server/node_modules") -Recurse
    # ZipFile.CreateFromDirectory writes entry names with the OS path separator under
    # Windows PowerShell 5.1's .NET Framework — backslashes on Windows — which Kudu's
    # Linux-side rsync then treats as literal characters in a single filename ("failed to
    # stat ...\local-server..."), so every file fails to land. Build entries by hand with
    # forward-slash names instead, which Linux needs.
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipArchive = [System.IO.Compression.ZipFile]::Open($zip, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        Get-ChildItem -Path $stage -Recurse -File | ForEach-Object {
            $relative = $_.FullName.Substring($stage.Length + 1) -replace '\\', '/'
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $_.FullName, $relative) | Out-Null
        }
    }
    finally { $zipArchive.Dispose() }

    Step "Deploying (a minute or two)..."
    $deployed = Invoke-AzWithRetry {
        az webapp deploy --name $Name --resource-group $ResourceGroup --src-path $zip --type zip --async false --output none
    }
    if (-not $deployed.Success) { Fail "The deployment failed.`n`n$($deployed.Output | Out-String)" }

    $startup = Invoke-AzWithRetry {
        az webapp config set --name $Name --resource-group $ResourceGroup `
            --startup-file "node /home/site/wwwroot/tools/local-server/server.js" --output none
    }
    if (-not $startup.Success) { Fail "Could not set the startup command.`n`n$($startup.Output | Out-String)" }

    if ($Seed) {
        Step "Uploading the seed document..."
        $seeded = Invoke-AzWithRetry {
            az webapp deploy --name $Name --resource-group $ResourceGroup --src-path $Seed --type static `
                --target-path /home/data/project_hub_01.json --async false --output none
        }
        if (-not $seeded.Success) { Fail "The seed upload failed.`n`n$($seeded.Output | Out-String)" }
    }
}
finally {
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    if (Test-Path $zip) { Remove-Item $zip -Force }
}

# ---------------------------------------------------------------------------
# Confirm it answers: /health proves the app runs, / proves sign-in is enforced.
# ---------------------------------------------------------------------------
Step "Waiting for it to answer..."
# Invoke-WebRequest's -SkipHttpErrorCheck is PowerShell 7+ only; under Windows PowerShell
# 5.1 that parameter does not exist, so the call fails before ever reaching the network —
# every poll "fails" and the loop only ever times out, even once the site is healthy.
# HttpClient works the same on both and does not throw on a non-2xx status.
Add-Type -AssemblyName System.Net.Http
$deadline = (Get-Date).AddMinutes(4)
$health = $null
$lastAnswer = "(no answer)"
while ((Get-Date) -lt $deadline) {
    try {
        $healthClient = [System.Net.Http.HttpClient]::new()
        $healthClient.Timeout = [TimeSpan]::FromSeconds(20)
        $response = $healthClient.GetAsync("$url/health").GetAwaiter().GetResult()
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $statusCode = [int]$response.StatusCode
        $healthClient.Dispose()
        $lastAnswer = "$statusCode $body"
        if ($statusCode -eq 200) { $health = $body | ConvertFrom-Json; break }
    }
    catch { $lastAnswer = $_.Exception.Message }
    Start-Sleep -Seconds 10
}
if (-not $health -or $health.mode -ne "cloud") {
    Fail @"
Deployed, but $url/health is not answering as expected. Last answer:

    $lastAnswer

A 503 with a JSON body is the app itself saying what is wrong. Anything else:

    az webapp log tail --name $Name --resource-group $ResourceGroup
"@
}

# Without a session the app must send a page request to the sign-in page. HttpClient
# rather than Invoke-WebRequest, which throws on a redirect it is told not to follow.
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.DefaultRequestHeaders.Accept.ParseAdd("text/html")
$client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0")
$gate = $client.GetAsync($url).GetAwaiter().GetResult()
$status = [int]$gate.StatusCode
$location = [string]$gate.Headers.Location
$client.Dispose()
if ($status -notin 301, 302 -or $location -notmatch "^/login") {
    Fail "The site answers, but $url did not redirect to the sign-in page (got $status $location). Sign-in is NOT enforced; do not share the address."
}
# The pages redirect; the data must refuse outright.
$apiClient = [System.Net.Http.HttpClient]::new()
$apiStatus = [int]$apiClient.GetAsync("$url/api/project-hub-01").GetAwaiter().GetResult().StatusCode
$apiClient.Dispose()
if ($apiStatus -ne 401) {
    Fail "The site answers, but $url/api/project-hub-01 returned $apiStatus without a session instead of 401. Sign-in is NOT enforced; do not share the address."
}

Write-Host ""
Write-Host "Deployed to $url" -ForegroundColor Green
Write-Host "  anyone with a $($account.tenantDefaultDomain) work account can sign in and edit the shared project" -ForegroundColor Gray
if ($secretExpires) {
    Write-Host "  the sign-in secret expires on $secretExpires — note it in docs\azure.md; a new one is: remove the" -ForegroundColor Gray
    Write-Host "  $secretSetting app setting and run this script again" -ForegroundColor Gray
}
if ($Sku -eq "F1") {
    Write-Host "  free tier: the first request after a quiet spell waits while the app starts; 60 CPU-minutes a day" -ForegroundColor Gray
}
Write-Host ""
