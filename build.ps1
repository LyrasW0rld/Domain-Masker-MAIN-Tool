Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Domain Masker - Desktop App Builder (PowerShell)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
try {
    $nodeVer = node -v
    Write-Host "[OK] Node.js detected: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is not installed or not in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/"
    Read-Host "Press Enter to exit..."
    exit 1
}

# 2. Check node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "[*] Dependencies folder not found. Running 'npm install'..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit..."
        exit $LASTEXITCODE
    }
}

# 3. Environment
$env:ELECTRON_BUILD = "true"
$env:NODE_ENV = "production"

# 4. Next.js export
Write-Host ""
Write-Host "[1/2] Exporting Next.js frontend into /out..." -ForegroundColor Yellow
npm run build:export
if ($LASTEXITCODE -ne 0) {
    Write-Host "[*] Retrying build:export after clearing .next cache..." -ForegroundColor Yellow
    if (Test-Path ".next") { Remove-Item -Recurse -Force ".next" }
    npm run build:export
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Next.js static export failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit..."
        exit $LASTEXITCODE
    }
}

if (-not (Test-Path "out/index.html")) {
    Write-Host "[ERROR] out/index.html was not generated!" -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    exit 1
}

Write-Host "[OK] Static frontend successfully exported to /out!" -ForegroundColor Green
Write-Host ""

# 5. Electron Builder
Write-Host "[2/2] Packaging Electron app..." -ForegroundColor Yellow
npm run package
if ($LASTEXITCODE -ne 0) {
    Write-Host "[*] Retrying with npx electron-builder..." -ForegroundColor Yellow
    npx electron-builder
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] electron-builder failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit..."
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE! Executable in: dist-electron\" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close..."
