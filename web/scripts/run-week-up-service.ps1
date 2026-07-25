param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

$serverPath = Join-Path $ProjectRoot "server\server.mjs"
$staticEntry = Join-Path $ProjectRoot "demo-dist\index.html"
$localDataRoot = Join-Path $env:LOCALAPPDATA "Week UP"
$logRoot = Join-Path $localDataRoot "logs"
$logPath = Join-Path $logRoot "service.log"
$previousLogPath = Join-Path $logRoot "service.previous.log"

if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "Week UP server entry was not found: $serverPath"
}
if (-not (Test-Path -LiteralPath $staticEntry)) {
  throw "Week UP production build was not found: $staticEntry"
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { "C:\Program Files\nodejs\node.exe" }
if (-not (Test-Path -LiteralPath $nodeExe)) {
  throw "Node.js was not found. Expected node.exe on PATH or at C:\Program Files\nodejs\node.exe."
}

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 5MB) {
  if (Test-Path -LiteralPath $previousLogPath) {
    Remove-Item -LiteralPath $previousLogPath -Force
  }
  Move-Item -LiteralPath $logPath -Destination $previousLogPath
}

$env:NODE_ENV = "production"
$env:WEEK_UP_PORT = "4173"
$env:WEEK_UP_DATA_DIR = $localDataRoot

try {
  Push-Location $ProjectRoot
  "[$(Get-Date -Format o)] Starting Week UP on http://127.0.0.1:4173/" | Add-Content -LiteralPath $logPath -Encoding utf8
  # Windows PowerShell converts a native process' stderr into ErrorRecord
  # objects. With Stop enabled, a recoverable console.error from the long-lived
  # Node service would terminate this watchdog even while Node was healthy.
  $ErrorActionPreference = "Continue"
  & $nodeExe $serverPath *>> $logPath
  $nodeExitCode = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  "[$(Get-Date -Format o)] Week UP stopped with exit code $nodeExitCode" | Add-Content -LiteralPath $logPath -Encoding utf8
  if ($nodeExitCode -eq 0) {
    exit 1
  }
  exit $nodeExitCode
}
catch {
  "[$(Get-Date -Format o)] Week UP failed: $($_.Exception.Message)" | Add-Content -LiteralPath $logPath -Encoding utf8
  exit 1
}
finally {
  Pop-Location
}
