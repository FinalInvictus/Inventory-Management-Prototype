$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "env.ps1")
$root = Split-Path -Parent $PSScriptRoot

Write-Host "1. Running Go vet and backend unit/integration tests..."
Push-Location (Join-Path $root "backend")
go vet ./...
go test -v ./...
Write-Host "2. Building Go server binary..."
New-Item -ItemType Directory -Force (Join-Path $root "bin") | Out-Null
$exe = Join-Path $root "bin\garment-api.exe"
go build -o $exe ./cmd/api
Pop-Location

Write-Host "3. Starting server on http://127.0.0.1:18080 ..."
$dataDir = Join-Path $root ".cache\e2e-data"
Remove-Item -Recurse -Force $dataDir -ErrorAction SilentlyContinue
$env:ADDR = "127.0.0.1:18080"
$env:STATIC_DIR = Join-Path $root "apps\web\dist"
$env:DATA_DIR = $dataDir
$proc = Start-Process -FilePath $exe -PassThru -NoNewWindow

try {
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $r = Invoke-RestMethod -Uri "http://127.0.0.1:18080/api/v1/health" -TimeoutSec 2
      if ($r.status -eq "ok") { break }
    } catch {}
    Start-Sleep -Milliseconds 300
  }

  Write-Host "4. Running Playwright browser E2E acceptance suite (PT-001..PT-013)..."
  Push-Location (Join-Path $root "apps\web")
  $env:BASE_URL = "http://127.0.0.1:18080"
  node e2e/demo-flow.mjs
  if ($LASTEXITCODE -ne 0) { throw "Playwright E2E failed with exit code $LASTEXITCODE" }
  Pop-Location
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}
