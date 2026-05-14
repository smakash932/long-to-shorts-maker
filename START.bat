@echo off
title Shorts Maker - Starting...
color 0A
echo.
echo ============================================
echo    Shorts Maker - Local AI Tool
echo    Backend: Port 3847  Frontend: Port 5187
echo ============================================
echo.

:: Start Backend
echo [1/2] Starting Backend Server (port 3847)...
cd /d "%~dp0backend"
start "Shorts Maker Backend (3847)" cmd /c "node server.js"
timeout /t 2 /nobreak > nul

:: Start Frontend
echo [2/2] Starting Frontend (port 5187)...
cd /d "%~dp0frontend"
start "Shorts Maker Frontend (5187)" cmd /c "npm run dev"
timeout /t 3 /nobreak > nul

echo.
echo ============================================
echo    All servers started!
echo.
echo    Frontend: http://localhost:5187
echo    Backend:  http://localhost:3847
echo.
echo    Open http://localhost:5187 in your browser
echo ============================================
echo.

:: Open browser
start http://localhost:5187

pause
