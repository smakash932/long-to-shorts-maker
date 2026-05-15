@echo off
setlocal EnableDelayedExpansion
title Shorts Maker - Starting...
color 0A

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo ============================================
echo    Shorts Maker - Local AI Tool
echo    Backend: Port 3847  Frontend: Port 5187
echo ============================================
echo.

REM Quick sanity check: are we set up? If not, point user to SETUP.bat.
set "VENV_PY=%ROOT%venv\Scripts\python.exe"
set "SETUP_MISSING=0"

if not exist "%VENV_PY%" set "SETUP_MISSING=1"
if not exist "%ROOT%backend\node_modules" set "SETUP_MISSING=1"
if not exist "%ROOT%frontend\node_modules" set "SETUP_MISSING=1"

if "%SETUP_MISSING%"=="1" (
    color 0C
    echo [X] This PC is not set up yet.
    echo.
    echo Please double-click SETUP.bat first - that script installs
    echo the Python venv, Python packages, and Node packages.
    echo.
    echo You only need to run SETUP.bat once per PC. After that,
    echo just double-click START.bat to launch the tool.
    echo.
    pause
    exit /b 1
)

REM Tell the backend exactly which Python interpreter to use.
set "LTS_PYTHON=%VENV_PY%"

echo [1/2] Starting Backend Server (port 3847)...
start "Shorts Maker Backend (3847)" cmd /c "cd /d %ROOT%backend && set LTS_PYTHON=%VENV_PY% && node server.js"
timeout /t 2 /nobreak > nul

echo [2/2] Starting Frontend (port 5187)...
start "Shorts Maker Frontend (5187)" cmd /c "cd /d %ROOT%frontend && npm run dev"
timeout /t 3 /nobreak > nul

echo.
echo ============================================
echo    All servers started!
echo.
echo    Frontend: http://localhost:5187
echo    Backend:  http://localhost:3847
echo.
echo    Browser will open automatically.
echo    Keep both terminal windows OPEN while using the app.
echo ============================================
echo.

start http://localhost:5187

pause
endlocal
