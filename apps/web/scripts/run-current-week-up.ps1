param(
  [string]$InstallRoot = $PSScriptRoot,
  [string]$DataRoot = (Join-Path $env:LOCALAPPDATA "Week UP")
)

$ErrorActionPreference = "Stop"

$resolvedInstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$resolvedDataRoot = [System.IO.Path]::GetFullPath($DataRoot)
if (
  $resolvedInstallRoot.Equals($resolvedDataRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
  $resolvedInstallRoot.StartsWith($resolvedDataRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
  $resolvedDataRoot.StartsWith($resolvedInstallRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
) {
  throw "Week UP install and user data roots must not overlap."
}

$currentPath = Join-Path $resolvedInstallRoot "current.json"
if (-not (Test-Path -LiteralPath $currentPath)) {
  throw "Week UP current release pointer was not found: $currentPath"
}
$current = Get-Content -LiteralPath $currentPath -Raw | ConvertFrom-Json
$releaseId = [string]$current.releaseId
if ($releaseId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
  throw "Week UP current release pointer is invalid."
}

$versionsRoot = [System.IO.Path]::GetFullPath((Join-Path $resolvedInstallRoot "versions"))
$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $versionsRoot $releaseId))
if (-not $releaseRoot.StartsWith($versionsRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Week UP release path escaped the versions root."
}
$runnerPath = Join-Path $releaseRoot "scripts\run-week-up-service.ps1"
if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Week UP release runner was not found: $runnerPath"
}

& $runnerPath -ProjectRoot $releaseRoot
exit $LASTEXITCODE
