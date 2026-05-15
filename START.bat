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

REM ----------------------------------------------------------------
REM  1. Check required tools (Python, Node, FFmpeg)
REM ----------------------------------------------------------------
set "MISSING="

where python >nul 2>&1
if errorlevel 1 (
    set "MISSING=!MISSING! Python"
)

where node >nul 2>&1
if errorlevel 1 (
    set "MISSING=!MISSING! Node.js"
)

where ffmpeg >nul 2>&1
if errorlevel 1 (
    set "MISSING=!MISSING! FFmpeg"
)

if defined MISSING (
    color 0C
    echo.
    echo [ERROR] Missing required tools:!MISSING!
    echo.
    echo Please install these BEFORE running Shorts Maker:
    echo.
    echo   Python 3.10+:  https://www.python.org/downloads/
    echo                  IMPORTANT: tick "Add python.exe to PATH"
    echo.
    echo   Node.js 18+:   https://nodejs.org/en/download
    echo.
    echo   FFmpeg:        https://www.gyan.dev/ffmpeg/builds/
    echo                  Download the "release essentials" zip,
    echo                  extract, and add the bin folder to PATH.
    echo.
    echo Once installed, close this window, open a NEW terminal, run
    echo "python --version", "node --version", and "ffmpeg -version"
    echo to confirm, then double-click START.bat again.
    echo.
    pause
    exit /b 1
)

REM ----------------------------------------------------------------
REM  2. First-run setup: venv + pip + npm install
REM ----------------------------------------------------------------
set "VENV_PY=%ROOT%venv\Scripts\python.exe"
set "SETUP_MARKER=%ROOT%venv\.setup_done"

if not exist "%VENV_PY%" (
    echo [Setup 1/4] Creating Python virtual environment...
    python -m venv "%ROOT%venv"
    if errorlevel 1 (
        color 0C
        echo [ERROR] Failed to create venv. Make sure Python 3.10+ is on PATH.
        pause
        exit /b 1
    )
)

if not exist "%SETUP_MARKER%" (
    echo [Setup 2/4] Installing Python packages ^(this can take a few minutes the first time^)...
    "%VENV_PY%" -m pip install --upgrade pip
    "%VENV_PY%" -m pip install -r "%ROOT%engine\requirements.txt"
    if errorlevel 1 (
        color 0C
        echo [ERROR] pip install failed. See messages above.
        pause
        exit /b 1
    )

    echo [Setup 3/4] Installing backend Node packages...
    pushd "%ROOT%backend"
    call npm install
    if errorlevel 1 (
        color 0C
        popd
        echo [ERROR] npm install ^(backend^) failed. See messages above.
        pause
        exit /b 1
    )
    popd

    echo [Setup 4/4] Installing frontend Node packages...
    pushd "%ROOT%frontend"
    call npm install
    if errorlevel 1 (
        color 0C
        popd
        echo [ERROR] npm install ^(frontend^) failed. See messages above.
        pause
        exit /b 1
    )
    popd

    echo. > "%SETUP_MARKER%"
    echo.
    echo ============================================
    echo    First-time setup complete!
    echo ============================================
    echo.
) else (
    REM Quick sanity checks: if either node_modules is missing, reinstall
    if not exist "%ROOT%backend\node_modules" (
        echo [Repair] backend\node_modules missing - reinstalling...
        pushd "%ROOT%backend" && call npm install && popd
    )
    if not exist "%ROOT%frontend\node_modules" (
        echo [Repair] frontend\node_modules missing - reinstalling...
        pushd "%ROOT%frontend" && call npm install && popd
    )
)

REM ----------------------------------------------------------------
REM  3. Print GPU detection summary (helps user confirm NVENC/CUDA)
REM ----------------------------------------------------------------
echo.
echo [GPU Check] Detecting NVIDIA hardware for accelerated encode/transcribe...
"%VENV_PY%" "%ROOT%engine\gpu_utils.py"
echo.

REM ----------------------------------------------------------------
REM  4. Start backend + frontend
REM ----------------------------------------------------------------
echo [1/2] Starting Backend Server (port 3847)...
set "LTS_PYTHON=%VENV_PY%"
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
