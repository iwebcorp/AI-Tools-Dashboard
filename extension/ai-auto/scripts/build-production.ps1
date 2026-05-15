$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot "build\chrome-mv3-prod"
$esbuild = Join-Path $projectRoot "node_modules\.bin\esbuild.CMD"
$envFile = Join-Path $projectRoot ".env"
$iconSource = Join-Path $projectRoot "assets\icon.png"

function Read-DotEnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  $prefix = "$Key="

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line.StartsWith($prefix)) {
      return $line.Substring($prefix.Length)
    }
  }

  return ""
}

function Invoke-Esbuild {
  param(
    [string[]]$Arguments
  )

  & $esbuild @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "esbuild failed with exit code $LASTEXITCODE"
  }
}

$syncApiUrl = Read-DotEnvValue -Path $envFile -Key "PLASMO_PUBLIC_SYNC_API_URL"
$syncSecret = Read-DotEnvValue -Path $envFile -Key "PLASMO_PUBLIC_SYNC_SECRET"

if ([string]::IsNullOrWhiteSpace($syncApiUrl) -or [string]::IsNullOrWhiteSpace($syncSecret)) {
  throw "PLASMO_PUBLIC_SYNC_API_URL or PLASMO_PUBLIC_SYNC_SECRET is missing in .env"
}

if (Test-Path -LiteralPath $outputDir) {
  Remove-Item -LiteralPath $outputDir -Recurse -Force
}

New-Item -ItemType Directory -Path $outputDir | Out-Null

$processBanner = "globalThis.process={env:{PLASMO_PUBLIC_SYNC_API_URL:'$syncApiUrl',PLASMO_PUBLIC_SYNC_SECRET:'$syncSecret',NODE_ENV:'production'}};"

Invoke-Esbuild -Arguments @(
  "background.ts",
  "--bundle",
  "--platform=browser",
  "--target=chrome120",
  "--format=iife",
  "--banner:js=$processBanner",
  "--outfile=build/chrome-mv3-prod/background.js"
)

Invoke-Esbuild -Arguments @(
  "contents/chatgpt.ts",
  "--bundle",
  "--platform=browser",
  "--target=chrome120",
  "--format=iife",
  "--banner:js=$processBanner",
  "--outfile=build/chrome-mv3-prod/chatgpt.js"
)

Invoke-Esbuild -Arguments @(
  "popup-main.tsx",
  "--bundle",
  "--platform=browser",
  "--target=chrome120",
  "--format=iife",
  "--jsx=automatic",
  "--banner:js=$processBanner",
  "--outfile=build/chrome-mv3-prod/popup.js"
)

Copy-Item -LiteralPath $iconSource -Destination (Join-Path $outputDir "icon.png")

$manifest = [ordered]@{
  manifest_version = 3
  name = "Ai auto"
  version = "0.0.1"
  description = "Session sync extension for Cursor and ChatGPT."
  permissions = @("cookies", "tabs", "storage", "alarms")
  host_permissions = @(
    "https://*.cursor.com/*",
    "https://*.chatgpt.com/*",
    "https://ai-tools-dashboard-psi.vercel.app/*"
  )
  action = @{
    default_popup = "popup.html"
    default_icon = @{
      "16" = "icon.png"
      "32" = "icon.png"
      "48" = "icon.png"
      "128" = "icon.png"
    }
  }
  icons = @{
    "16" = "icon.png"
    "32" = "icon.png"
    "48" = "icon.png"
    "128" = "icon.png"
  }
  background = @{
    service_worker = "background.js"
  }
  content_scripts = @(
    @{
      matches = @("https://chatgpt.com/*")
      js = @("chatgpt.js")
      run_at = "document_idle"
    }
  )
}

$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outputDir "manifest.json")

@'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ai auto</title>
  </head>
  <body>
    <div id="__plasmo"></div>
    <script src="popup.js"></script>
  </body>
</html>
'@ | Set-Content -LiteralPath (Join-Path $outputDir "popup.html")

Write-Host "Production extension bundle created at $outputDir"
