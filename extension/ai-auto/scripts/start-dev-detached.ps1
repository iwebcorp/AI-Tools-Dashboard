$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$outLog = Join-Path $root "plasmo-dev.out.log"
$errLog = Join-Path $root "plasmo-dev.err.log"
$pidFile = Join-Path $root "plasmo-dev.pid"
$plasmoBin = Join-Path $root "node_modules\\plasmo\\bin\\index.mjs"

if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existingPid) {
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($existingProcess) {
      Stop-Process -Id $existingPid -Force
      Start-Sleep -Seconds 1
    }
  }
  Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $outLog, $errLog -ErrorAction SilentlyContinue

if (-not (Test-Path $plasmoBin)) {
  throw "Plasmo CLI not found at $plasmoBin"
}

$process = Start-Process -FilePath "node" `
  -ArgumentList $plasmoBin, "dev" `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

Set-Content -LiteralPath $pidFile -Value $process.Id

Start-Sleep -Seconds 5

$outExists = Test-Path $outLog
$errExists = Test-Path $errLog
$outSize = if ($outExists) { (Get-Item $outLog).Length } else { 0 }
$errSize = if ($errExists) { (Get-Item $errLog).Length } else { 0 }

Write-Output "Started plasmo dev in background."
Write-Output "PID: $($process.Id)"
Write-Output "stdout: $outLog ($outSize bytes)"
Write-Output "stderr: $errLog ($errSize bytes)"
