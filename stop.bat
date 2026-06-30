@echo off
title Rocket Auction House - Stopping...

echo.
echo  ========================================
echo   Rocket Auction House - STOP
echo  ========================================
echo.

echo [1/3] Closing server windows...
taskkill /FI "WINDOWTITLE eq Backend - Rocket AH" /F > nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend - Rocket AH" /F > nul 2>&1
timeout /t 1 /nobreak > nul

echo [2/3] Killing processes on ports 3000 and 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F > nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /PID %%a /F > nul 2>&1
)

echo [3/3] Cleaning up worker processes...
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH 2^>nul') do (
    wmic process where "ProcessId=%%~a" get CommandLine /VALUE 2>nul | findstr /I "Rocket_Auction_House" > nul 2>&1
    if not errorlevel 1 taskkill /PID %%~a /F > nul 2>&1
)
timeout /t 1 /nobreak > nul

set ALL_CLEAR=1
netstat -ano | findstr ":3000 " | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 set ALL_CLEAR=0
netstat -ano | findstr ":4000 " | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 set ALL_CLEAR=0

echo.
if %ALL_CLEAR%==1 (
    echo  ========================================
    echo   All servers stopped successfully.
    echo  ========================================
) else (
    echo  ========================================
    echo   [WARN] Some ports are still in use.
    echo   Check Task Manager for node.exe
    echo  ========================================
)
echo.
timeout /t 2 /nobreak > nul
