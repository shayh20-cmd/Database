<#
.SYNOPSIS
Removes what Install-QuickAccess.ps1 added: the Start menu shortcuts and the right-click items.
#>
$ErrorActionPreference = "Stop"
$programs = Join-Path ([Environment]::GetFolderPath('Programs')) "Project Hub"
if (Test-Path $programs) { Remove-Item -Recurse -Force $programs }
foreach ($k in "HKCU:\Software\Classes\DesktopBackground\Shell\ProjectHubTask",
               "HKCU:\Software\Classes\Directory\Background\shell\ProjectHubTask") {
    if (Test-Path $k) { Remove-Item -Recurse -Force $k }
}
Write-Host "Project Hub quick access was removed." -ForegroundColor Green
