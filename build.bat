@echo off
setlocal
title Domain Masker - Build Desktop Application

echo ========================================================
echo   Domain Masker - Desktop App Builder (Windows)
echo ========================================================
echo.

REM 1. Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Node.js was not found on your system!
  echo Please install Node.js from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

REM 2. Check for node_modules and install if missing
if not exist node_modules (
  echo [*] Dependencies folder "node_modules" not found.
  echo [*] Installing required packages via "npm install"...
  echo.
  call npm install
  if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] npm install failed! Please verify your internet connection.
    pause
    exit /b 1
  )
  echo [OK] Dependencies installed successfully.
  echo.
)

if not exist node_modules\next (
  echo [*] Next.js not found in node_modules. Running "npm install"...
  call npm install
  if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] npm install failed!
    pause
    exit /b 1
  )
)

REM 3. Set build environment variables
set ELECTRON_BUILD=true
set NODE_ENV=production

REM 4. Step 1: Export Next.js frontend into /out
echo [1/2] Exporting Next.js frontend into out folder...
call npm run build:export
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [*] First export attempt failed. Cleaning cache and retrying...
  if exist .next rmdir /s /q .next
  call npm run build:export
  if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Next.js static export build failed!
    echo Please make sure dependencies are up to date via "npm install".
    pause
    exit /b 1
  )
)

REM Verify out\index.html exists
if not exist out\index.html (
  echo.
  echo [ERROR] Exported file "out\index.html" was not found!
  pause
  exit /b 1
)

echo.
echo [OK] Static frontend successfully exported to out!
echo.

REM 5. Step 2: Package Electron Executable
echo [2/2] Packaging Electron Executable via electron-builder...
call npm run package
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [*] Retrying packaging with npx electron-builder...
  call npx electron-builder
  if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] electron-builder packaging failed!
    pause
    exit /b 1
  )
)

echo.
echo ========================================================
echo   BUILD COMPLETE!
echo   Your executable has been created in: dist-electron\
echo ========================================================
echo.
pause

