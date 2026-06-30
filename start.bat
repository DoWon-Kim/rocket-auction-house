@echo off
title Rocket Auction House - Starting...

echo.
echo  ========================================
echo   Rocket Auction House - START
echo  ========================================
echo.

:: [0] Kill existing processes
echo [0/4] Cleaning up existing processes...
taskkill /FI "WINDOWTITLE eq Backend - Rocket AH" /F > nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend - Rocket AH" /F > nul 2>&1
timeout /t 1 /nobreak > nul

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F > nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F > nul 2>&1
)
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH 2^>nul') do (
    wmic process where "ProcessId=%%~a" get CommandLine /VALUE 2>nul | findstr /I "\.next\\dev\\build" > nul 2>&1
    if not errorlevel 1 taskkill /PID %%~a /F > nul 2>&1
)
timeout /t 2 /nobreak > nul
echo Done.

:: [1] Fix corrupted Next.js cache
echo [1/4] Checking Next.js cache...
set DEVTOOLS_CFG=d:\Rocket_Auction_House\frontend\.next\dev\cache\next-devtools-config.json
if exist "%DEVTOOLS_CFG%" (
    findstr /C:"}" "%DEVTOOLS_CFG%" > nul 2>&1
    if errorlevel 1 (
        echo {"theme":"light"} > "%DEVTOOLS_CFG%"
        echo Cache file repaired.
    )
)
echo Done.

:: [2] PostgreSQL
echo [2/4] Checking PostgreSQL...
sc query postgresql-x64-17 | findstr "RUNNING" > nul 2>&1
if %errorlevel% neq 0 (
    echo Starting PostgreSQL...
    net start postgresql-x64-17 > nul 2>&1
    timeout /t 3 /nobreak > nul
    sc query postgresql-x64-17 | findstr "RUNNING" > nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  [ERROR] PostgreSQL failed to start!
        echo  Service name: postgresql-x64-17
        echo  Please start it manually and try again.
        echo.
        pause
        exit /b 1
    )
    echo PostgreSQL started.
) else (
    echo PostgreSQL already running.
)

:: [3] Backend
echo [3/4] Starting Backend... (port 4000)
start "Backend - Rocket AH" cmd /k "title Backend - Rocket AH && cd /d d:\Rocket_Auction_House\backend && set NODE_OPTIONS=--max-old-space-size=256 && npm run dev"

set /a WAIT=0
:WAIT_BACKEND
timeout /t 2 /nobreak > nul
set /a WAIT+=2
netstat -ano | findstr ":4000 " | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 goto BACKEND_OK
if %WAIT% geq 30 (
    echo  [WARN] Backend not responding. Check the backend window.
    goto START_FRONTEND
)
goto WAIT_BACKEND
:BACKEND_OK
echo Backend ready (%WAIT%s).

:: [4] Frontend
:START_FRONTEND
echo [4/4] Starting Frontend... (port 3000, Webpack)
start "Frontend - Rocket AH" cmd /k "title Frontend - Rocket AH && cd /d d:\Rocket_Auction_House\frontend && set NODE_OPTIONS=--max-old-space-size=512 && npm run dev"

set /a WAIT=0
:WAIT_FRONTEND
timeout /t 3 /nobreak > nul
set /a WAIT+=3
netstat -ano | findstr ":3000 " | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 goto FRONTEND_OK
if %WAIT% geq 60 (
    echo  [WARN] Frontend not responding. Check the frontend window.
    goto DONE
)
goto WAIT_FRONTEND
:FRONTEND_OK
echo Frontend ready (%WAIT%s).

:DONE
echo.
echo  ========================================
echo   All servers are running!
echo  ========================================
echo   Frontend : http://localhost:3000
echo   Backend  : http://localhost:4000/api
echo  ========================================
echo   Close each server window to stop them.
echo  ========================================
echo.
pause
