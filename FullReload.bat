@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

echo.
echo   ============================================
echo     Spec Factory — Full Reload
echo   ============================================
echo.

:: ── Step 1: Kill tracked PIDs from .server-state ──────────────────────
echo   [1/4] Killing tracked Spec Factory processes...

set "STATE_DIR=%ROOT%\.server-state"

for %%f in ("%STATE_DIR%\*.pid") do (
  set /p PID=<"%%f"
  if defined PID (
    tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
      echo         Killing tracked PID !PID! (%%~nxf)
      taskkill /F /PID !PID! >nul 2>nul
    ) else (
      echo         Tracked PID !PID! already gone (%%~nxf)
    )
    del "%%f" >nul 2>nul
  )
  set "PID="
)

:: ── Step 1b: Kill anything still on port 8788 ─────────────────────────
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8788 " ^| findstr "LISTENING"') do (
  if "%%p" NEQ "0" (
    echo         Killing leftover process on port 8788 (PID %%p)
    taskkill /F /PID %%p >nul 2>nul
  )
)

:: Brief pause to let ports release
timeout /t 2 /nobreak >nul

echo         Done.
echo.

:: ── Step 2: Rebuild native modules ────────────────────────────────────
echo   [2/4] Rebuilding native modules...
call npm rebuild better-sqlite3 2>nul
echo         Done.
echo.

:: ── Step 3: Build GUI ─────────────────────────────────────────────────
echo   [3/4] Building GUI...
call npm run gui:build
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] GUI build failed. Aborting.
  echo.
  pause
  exit /b 1
)
echo         Done.
echo.

:: ── Step 4: Start server + open browser ───────────────────────────────
echo   [4/4] Starting server and opening browser...
call node tools\dev-stack-control.js start-api
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] Server failed to start. Check .server-state\spec-factory-api.log
  echo.
  pause
  exit /b 1
)

echo.
echo   ============================================
echo     Reload complete!
echo     Running at http://localhost:8788
echo   ============================================
echo.
echo   Press any key to close this window.
echo   (Server keeps running in the background.)
echo.
pause
