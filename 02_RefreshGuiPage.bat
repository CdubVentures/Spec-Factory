@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"
echo Refresh target uses http://localhost:8788.
call node tools\dev-stack-control.js refresh-page
pause
