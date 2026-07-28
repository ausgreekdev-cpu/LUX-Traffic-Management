@echo off
echo ============================================
echo   LUX Traffic Management - Build Script
echo ============================================
echo.

echo [1/4] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install root dependencies
    pause
    exit /b 1
)

echo.
echo [2/4] Installing backend dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install backend dependencies
    pause
    exit /b 1
)
cd ..

echo.
echo [3/4] Installing frontend dependencies and building...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install frontend dependencies
    pause
    exit /b 1
)
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build frontend
    pause
    exit /b 1
)
cd ..

echo.
echo [4/4] Building Electron app...
call npx electron-builder build --windows
if %errorlevel% neq 0 (
    echo ERROR: Failed to build Electron app
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Build complete! Check the 'release' folder
echo ============================================
pause
