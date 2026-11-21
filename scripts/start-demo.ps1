param(
  [string]$Addr = "127.0.0.1:8080"
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "env.ps1")
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $root "apps\web\dist\index.html"))) {
  Write-Host "Building web frontend..."
  Push-Location (Join-Path $root "apps\web")
  npm run build
  Pop-Location
}

Write-Host "Starting Garment Management Prototype on http://$Addr ..."
$env:ADDR = $Addr
$env:STATIC_DIR = Join-Path $root "apps\web\dist"
$env:DATA_DIR = Join-Path $root "backend\data"
Push-Location (Join-Path $root "backend")
go run ./cmd/api
Pop-Location
