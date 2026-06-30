@echo off
title Rocket Auction House - Restarting...

echo.
echo  ========================================
echo   Rocket Auction House - RESTART
echo  ========================================
echo.

call "%~dp0stop.bat" > nul 2>&1
timeout /t 2 /nobreak > nul
call "%~dp0start.bat"
