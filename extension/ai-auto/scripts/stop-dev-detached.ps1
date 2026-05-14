$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root "plasmo-dev.pid"

if (-not (Test-Path $pidFile)) {
  Write-Output "No PID file found."
  exit 0
}

$existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $existingPid) {
  Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
  Write-Output "PID file was empty."
  exit 0
}

$existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
if ($existingProcess) {
  Stop-Process -Id $existingPid -Force
  Write-Output "Stopped process $existingPid."
} else {
  Write-Output "Process $existingPid was not running."
}

Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
