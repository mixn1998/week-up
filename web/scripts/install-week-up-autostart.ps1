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
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest
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

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existingTask -and $existingTask.State -eq "Running") {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Starts the local Week UP web and SQLite service at user logon and restarts it after failures." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Output "Installed and started scheduled task: $TaskName"
