$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target = Join-Path $root 'release\MindPalace-win32-x64'
$electronDist = Join-Path $root 'node_modules\electron\dist'
$staging = Join-Path $root '.electron-app'

if (-not $target.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Unexpected target path: $target"
}

if (-not (Test-Path -LiteralPath $electronDist)) {
  throw "Electron runtime not found at $electronDist"
}

if (-not (Test-Path -LiteralPath $staging)) {
  throw "Electron staging app not found at $staging"
}

Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $target | Out-Null

Copy-Item -Path (Join-Path $electronDist '*') -Destination $target -Recurse -Force

$appDir = Join-Path $target 'resources\app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null

Copy-Item -LiteralPath (Join-Path $staging 'dist') -Destination $appDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $staging 'electron') -Destination $appDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $staging 'data') -Destination $appDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $staging 'package.json') -Destination $appDir -Force

Rename-Item -LiteralPath (Join-Path $target 'electron.exe') -NewName 'Mind Palace.exe' -Force

Write-Host "Built: $target"
Write-Host "Executable: $(Join-Path $target 'Mind Palace.exe')"
