param(
  [string]$TaskName = "Week UP Local Service"
)

$ErrorActionPreference = "Stop"

$runnerPath = Join-Path $PSScriptRoot "run-week-up-service.ps1"
if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Week UP service runner was not found: $runnerPath"
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$powerShellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`""

$action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

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
