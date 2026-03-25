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

:check_node
for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
for /f "tokens=*" %%p in ('where node 2^>nul') do (
  if not defined NODE_PATH set "NODE_PATH=%%p"
)
if not defined NODE_VER (
  echo.
  echo   [ERROR] Node.js not found on PATH.
  echo   Install Node.js 20+ or check your PATH / nvm settings.
  echo.
  pause
  exit /b 1
)
echo.
echo   ============================================
echo     Spec Factory
echo   ============================================
echo.
echo   Node:    %NODE_VER% (%NODE_PATH%)
echo   Port:    8788
echo   URL:     http://localhost:8788
echo.
goto :eof

:start_stack
call :check_node
if %ERRORLEVEL% NEQ 0 exit /b 1
call node tools\dev-stack-control.js start-stack
goto :eof

:start_api_only
call :check_node
if %ERRORLEVEL% NEQ 0 exit /b 1
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
