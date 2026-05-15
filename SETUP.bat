@echo off
setlocal EnableDelayedExpansion
title Shorts Maker - One-Time Setup
color 0B

set "ROOT=%~dp0"
cd /d "%ROOT%"

cls
echo ============================================================
echo    Shorts Maker - One-Time Setup
echo ============================================================
echo This script checks your PC and installs everything the tool
echo needs. It is safe to run multiple times - already-installed
echo packages are skipped automatically.
echo ============================================================
echo.

REM ----------------------------------------------------------------
REM  Step 1: Check system tools (Python, Node, FFmpeg)
REM ----------------------------------------------------------------
set "MISSING="

set "PY_VER="
for /f "delims=" %%v in ('python --version 2^>nul') do set "PY_VER=%%v"
if "%PY_VER%"=="" (
    set "MISSING=!MISSING! Python"
)

set "NODE_VER="
for /f "delims=" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
if "%NODE_VER%"=="" (
    set "MISSING=!MISSING! Node.js"
)

set "FFMPEG_OK=0"
ffmpeg -version >nul 2>&1 && set "FFMPEG_OK=1"

if "%FFMPEG_OK%"=="0" (
    set "MISSING=!MISSING! FFmpeg"
)

if defined MISSING (
    color 0C
    echo.
    echo [X] These system tools are missing:!MISSING!
    echo.
    echo Please install them first, then re-run SETUP.bat:
    echo.
    echo   Python 3.10+:   https://www.python.org/downloads/
    echo                   IMPORTANT: tick "Add python.exe to PATH" during install.
    echo.
    echo   Node.js 18+:    https://nodejs.org/en/download
    echo.
    echo   FFmpeg:         https://www.gyan.dev/ffmpeg/builds/
    echo                   Download the "release essentials" zip,
    echo                   extract it, and add the bin folder to PATH.
    echo.
    echo After installing, open a NEW terminal and verify:
    echo     python --version
    echo     node --version
    echo     ffmpeg -version
    echo Then double-click SETUP.bat again.
    echo.
    pause
    exit /b 1
)

echo [OK] %PY_VER%
echo [OK] Node.js %NODE_VER%
echo [OK] FFmpeg detected on PATH
echo.

REM ----------------------------------------------------------------
REM  Step 2: Python venv
REM ----------------------------------------------------------------
set "VENV_PY=%ROOT%venv\Scripts\python.exe"

if exist "%VENV_PY%" (
    echo [OK] Python virtual environment already exists - skipping create
) else (
    echo [..] Creating Python virtual environment...
    python -m venv "%ROOT%venv"
    if errorlevel 1 (
        color 0C
        echo [X] Failed to create venv. Make sure Python 3.10+ is on PATH.
        pause
        exit /b 1
    )
    echo [OK] Python virtual environment created
)

REM ----------------------------------------------------------------
REM  Step 3: Python packages
REM ----------------------------------------------------------------
REM Detect whether requirements are already satisfied by probing a key
REM import. If the import works we skip the slow pip install.
set "PY_DEPS_OK=0"
"%VENV_PY%" -c "import faster_whisper, cv2, numpy" >nul 2>&1
if not errorlevel 1 set "PY_DEPS_OK=1"

if "%PY_DEPS_OK%"=="1" (
    echo [OK] Python packages already installed - skipping pip install
) else (
    echo [..] Installing Python packages ^(this can take 2-5 minutes the first time^)...
    "%VENV_PY%" -m pip install --upgrade pip
    "%VENV_PY%" -m pip install -r "%ROOT%engine\requirements.txt"
    if errorlevel 1 (
        color 0C
        echo [X] pip install failed. See messages above.
        pause
        exit /b 1
    )
    echo [OK] Python packages installed
)

REM ----------------------------------------------------------------
REM  Step 4: Backend Node packages
REM ----------------------------------------------------------------
if exist "%ROOT%backend\node_modules\express" (
    echo [OK] Backend node_modules already present - skipping npm install
) else (
    echo [..] Installing backend Node packages...
    pushd "%ROOT%backend"
    call npm install
    if errorlevel 1 (
        color 0C
        popd
        echo [X] npm install ^(backend^) failed. See messages above.
        pause
        exit /b 1
    )
    popd
    echo [OK] Backend Node packages installed
)

REM ----------------------------------------------------------------
REM  Step 5: Frontend Node packages
REM ----------------------------------------------------------------
if exist "%ROOT%frontend\node_modules\vite" (
    echo [OK] Frontend node_modules already present - skipping npm install
) else (
    echo [..] Installing frontend Node packages...
    pushd "%ROOT%frontend"
    call npm install
    if errorlevel 1 (
        color 0C
        popd
        echo [X] npm install ^(frontend^) failed. See messages above.
        pause
        exit /b 1
    )
    popd
    echo [OK] Frontend Node packages installed
)

REM ----------------------------------------------------------------
REM  Step 6: GPU detection report (optional info, never fails setup)
REM ----------------------------------------------------------------
echo.
echo --- GPU detection -------------------------------------------
"%VENV_PY%" "%ROOT%engine\gpu_utils.py"
echo -------------------------------------------------------------
echo.

REM ----------------------------------------------------------------
REM  Done
REM ----------------------------------------------------------------
color 0A
echo.
echo ============================================================
echo    [DONE] All requirements installed!
echo.
echo    You can now close this window and double-click
echo    START.bat to launch Shorts Maker.
echo.
echo    Tip: in the Clip Settings panel you can toggle
echo    "GPU Accelerate" off if you want to force CPU mode
echo    (useful when sharing the tool with PCs that do not have
echo    an NVIDIA GPU).
echo ============================================================
echo.
pause
endlocal
