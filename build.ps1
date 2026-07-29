# LUX Traffic Management - Build Script
# Run with: .\build.ps1

Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  LUX Traffic Management - Build Script" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1/4] Installing root dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed" -ForegroundColor Red; exit 1 }

Write-Host "[2/4] Installing backend dependencies..." -ForegroundColor Cyan
Set-Location backend
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed" -ForegroundColor Red; exit 1 }
Set-Location ..

Write-Host "[3/4] Building frontend..." -ForegroundColor Cyan
Set-Location frontend
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed" -ForegroundColor Red; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed" -ForegroundColor Red; exit 1 }
Set-Location ..

Write-Host "[4/4] Building Electron app..." -ForegroundColor Cyan
npx electron-builder build --windows
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Build complete! Check the 'release' folder" -ForegroundColor Green
