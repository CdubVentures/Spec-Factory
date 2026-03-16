@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

set "MODE=%~1"

if /I "%MODE%"=="--help" goto :show_help
if /I "%MODE%"=="-h" goto :show_help
if /I "%MODE%"=="/?" goto :show_help
if /I "%MODE%"=="help" goto :show_help
if /I "%MODE%"=="api" goto :start_api_only
if /I "%MODE%"=="api-only" goto :start_api_only
if /I "%MODE%"=="backend" goto :start_api_only
if /I "%MODE%"=="--api" goto :start_api_only
if /I "%MODE%"=="--api-only" goto :start_api_only
goto :start_stack

:start_stack
echo Starting SpecFactory on http://localhost:8788
echo   GUI/API: http://localhost:8788
echo   Command: npm run gui:api
echo.
call node tools\dev-stack-control.js start-stack
goto :eof

:start_api_only
echo Starting SpecFactory API on http://localhost:8788
echo   Command: npm run gui:api
call node tools\dev-stack-control.js start-api
goto :eof

:show_help
echo.
echo Usage: 00_StartGuiApi.bat [api-only]
echo.
echo   (no arg)    starts the 8788 app entry point
echo   api-only    starts API only
echo.
goto :eof
