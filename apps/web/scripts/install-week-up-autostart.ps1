param(
  [string]$TaskName = "Week UP Local Service",
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "Programs\Week UP"),
  [string]$DataRoot = (Join-Path $env:LOCALAPPDATA "Week UP")
)

$ErrorActionPreference = "Stop"

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { "C:\Program Files\nodejs\node.exe" }
if (-not (Test-Path -LiteralPath $nodeExe)) {
  throw "Node.js was not found. Expected node.exe on PATH or at C:\Program Files\nodejs\node.exe."
}
$publisherPath = Join-Path $PSScriptRoot "runtime-release.mjs"
& $nodeExe $publisherPath publish --project-root $ProjectRoot --install-root $InstallRoot --data-root $DataRoot
if ($LASTEXITCODE -ne 0) { throw "Week UP runtime publication failed with exit code $LASTEXITCODE." }

$runnerPath = Join-Path $InstallRoot "run-current-week-up.ps1"
if (-not (Test-Path -LiteralPath $runnerPath)) { throw "Week UP stable runner was not found: $runnerPath" }

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$powerShellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`" -InstallRoot `"$InstallRoot`" -DataRoot `"$DataRoot`""

$action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments -WorkingDirectory $InstallRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -DisallowHardTerminate `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

function Get-WeekUpListener {
  Get-NetTCPConnection `
    -LocalAddress "127.0.0.1" `
    -LocalPort 4173 `
    -State Listen `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Test-WeekUpListener {
  param($Listener)
  if ($null -eq $Listener) { return $false }
  try {
    $runtime = Invoke-RestMethod `
      -Uri "http://127.0.0.1:4173/api/runtime" `
      -TimeoutSec 2 `
      -ErrorAction Stop
    return $runtime.runtime.appId -eq "week-up"
  }
  catch {
    return $false
  }
}

function Stop-ExistingWeekUpService {
  param($ExistingTask)
  $listener = Get-WeekUpListener
  if ($null -ne $listener -and -not (Test-WeekUpListener -Listener $listener)) {
    throw "Port 4173 is occupied by an application that is not Week UP. The process was not stopped."
  }
  if ($null -ne $ExistingTask -and $ExistingTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    Start-Sleep -Milliseconds 500
  }
  if ($null -ne $listener -and $null -ne (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $listener.OwningProcess -Force
  }
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if ($null -eq (Get-WeekUpListener)) { return }
    Start-Sleep -Milliseconds 250
  }
  throw "Timed out waiting for the previous Week UP listener to release port 4173."
}

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Stop-ExistingWeekUpService -ExistingTask $existingTask

try {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Starts the local Week UP web and SQLite service at user logon and restarts it after failures." `
    -Force | Out-Null
}
catch {
  $legacyRunner = $null -ne $existingTask -and $existingTask.Actions.Arguments -match 'run-week-up-service\.ps1'
  if (-not $legacyRunner) { throw }
  Write-Warning "Scheduled task replacement was denied; the existing task can continue through the compatibility runner."
}

Start-ScheduledTask -TaskName $TaskName
Write-Output "Installed and started scheduled task: $TaskName"
