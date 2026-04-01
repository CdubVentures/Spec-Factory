@echo off
setlocal EnableDelayedExpansion EnableExtensions
title Spec Factory Process Manager

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

:: ── CLI dispatch (if arguments provided) ──────────────────────────────
set "ACTION=%~1"
if "%ACTION%"=="" goto :menu

if /I "%ACTION%"=="start" goto :action_start
if /I "%ACTION%"=="start-api" goto :action_start_api
if /I "%ACTION%"=="reload" goto :action_reload
if /I "%ACTION%"=="refresh" goto :action_refresh
if /I "%ACTION%"=="rebuild-frontend" goto :action_rebuild_frontend
if /I "%ACTION%"=="rebuild-restart" goto :action_rebuild_restart
if /I "%ACTION%"=="build-gui" goto :action_build_gui
if /I "%ACTION%"=="build-exe" goto :action_build_exe
if /I "%ACTION%"=="build-launcher" goto :action_build_launcher
if /I "%ACTION%"=="kill" goto :action_kill
if /I "%ACTION%"=="status" goto :action_status
if /I "%ACTION%"=="cleanup" goto :action_cleanup
if /I "%ACTION%"=="help" goto :show_help
if /I "%ACTION%"=="--help" goto :show_help
if /I "%ACTION%"=="-h" goto :show_help
if /I "%ACTION%"=="/?" goto :show_help

echo Unknown command: %ACTION%
echo Run: SpecFactory.bat help
exit /b 1

:: ══════════════════════════════════════════════════════════════════════
::  Interactive menu
:: ══════════════════════════════════════════════════════════════════════
:menu
call :check_node
if %ERRORLEVEL% NEQ 0 (
  pause
  exit /b 1
)

echo.
echo   --- Server ---
echo   [1] Start Server            (API + browser)
echo   [2] Full Reload             (kill all + rebuild + restart)
echo   [3] Refresh Browser         (force reload localhost:8788)
echo.
echo   --- Hot Rebuild (safe while server is running) ---
echo   [4] Rebuild Frontend        (vite build only, skip native)
echo   [5] Rebuild + Restart API   (vite build + restart server)
echo.
echo   --- Build ---
echo   [6] Build GUI               (rebuild native + vite build)
echo   [7] Build GUI (Quick)       (build + sync gui-dist for exe)
echo   [8] Build EXE               (full SpecFactory.exe pipeline)
echo   [9] Build EXE (Quick)       (GUI only + sync gui-dist)
echo   [10] Build Launcher EXE
echo.
echo   --- Manage ---
echo   [11] Kill Processes         (kill tracked SF PIDs + port 8788)
echo   [12] Process Status         (show tracked PIDs)
echo   [13] Cleanup Artifacts      (remove out/, artifacts/)
echo.
echo   [H] Help    [Q] Quit
echo.
set "CHOICE="
set /P "CHOICE=  Enter choice: "

if /I "!CHOICE!"=="1" goto :action_start
if /I "!CHOICE!"=="2" goto :action_reload
if /I "!CHOICE!"=="3" goto :action_refresh
if /I "!CHOICE!"=="4" goto :action_rebuild_frontend
if /I "!CHOICE!"=="5" goto :action_rebuild_restart
if /I "!CHOICE!"=="6" goto :action_build_gui
if /I "!CHOICE!"=="7" goto :action_build_gui_quick
if /I "!CHOICE!"=="8" goto :action_build_exe
if /I "!CHOICE!"=="9" goto :action_build_exe_quick
if /I "!CHOICE!"=="10" goto :action_build_launcher
if /I "!CHOICE!"=="11" goto :action_kill
if /I "!CHOICE!"=="12" goto :action_status
if /I "!CHOICE!"=="13" goto :action_cleanup
if /I "!CHOICE!"=="H" goto :show_help
if /I "!CHOICE!"=="Q" goto :done_quiet
if /I "!CHOICE!"=="q" goto :done_quiet

echo.
echo   Invalid choice: !CHOICE!
goto :menu

:: ══════════════════════════════════════════════════════════════════════
::  Actions
:: ══════════════════════════════════════════════════════════════════════

:: ── Start Server ──────────────────────────────────────────────────────
:action_start
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   Starting server...
echo.
call node tools\dev-stack-control.js start-api
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] Server failed to start. Check .server-state\spec-factory-api.log
)
goto :done

:action_start_api
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   Starting API (no browser)...
echo.
call node tools\dev-stack-control.js start-api --no-browser
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] API failed to start. Check .server-state\spec-factory-api.log
)
goto :done

:: ── Full Reload ───────────────────────────────────────────────────────
:action_reload
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   ============================================
echo     Full Reload
echo   ============================================
echo.

echo   [1/4] Killing tracked Spec Factory processes...
set "STATE_DIR=%ROOT%\.server-state"
for %%f in ("%STATE_DIR%\*.pid") do (
  set /p PID=<"%%f"
  if defined PID (
    tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
      echo         Killing tracked PID !PID! ^(%%~nxf^)
      taskkill /F /PID !PID! >nul 2>nul
    ) else (
      echo         Tracked PID !PID! already gone ^(%%~nxf^)
    )
    del "%%f" >nul 2>nul
  )
  set "PID="
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8788 " ^| findstr "LISTENING"') do (
  if "%%p" NEQ "0" (
    echo         Killing leftover process on port 8788 ^(PID %%p^)
    taskkill /F /PID %%p >nul 2>nul
  )
)
timeout /t 2 /nobreak >nul
echo         Done.
echo.

echo   [2/4] Rebuilding native modules...
call npm rebuild better-sqlite3 2>nul
echo         Done.
echo.

echo   [3/4] Building GUI...
call npm run gui:build
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] GUI build failed. Aborting.
  goto :done
)
echo         Done.
echo.

echo   [4/4] Starting server and opening browser...
call node tools\dev-stack-control.js start-api
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] Server failed to start. Check .server-state\spec-factory-api.log
  goto :done
)
echo.
echo   ============================================
echo     Reload complete!  http://localhost:8788
echo   ============================================
goto :done

:: ── Refresh Browser ───────────────────────────────────────────────────
:action_refresh
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
call node tools\dev-stack-control.js refresh-page
goto :done

:: ── Rebuild Frontend (Hot) ──────────────────────────────────────────
:action_rebuild_frontend
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   Rebuilding frontend (vite build only)...
echo   Skipping native module rebuild - safe while server is running.
echo.
pushd "%ROOT%\tools\gui-react"
call npm run build
popd
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] Frontend build failed.
  goto :done
)
echo.
echo   Frontend rebuilt successfully.
echo   Refresh your browser at http://localhost:8788 to see changes.
goto :done

:: ── Rebuild + Restart API ───────────────────────────────────────────
:action_rebuild_restart
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   ============================================
echo     Rebuild + Restart API
echo   ============================================
echo.
echo   [1/3] Rebuilding frontend (vite build only)...
pushd "%ROOT%\tools\gui-react"
call npm run build
popd
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] Frontend build failed. Aborting.
  goto :done
)
echo         Done.
echo.
echo   [2/3] Stopping API server...
set "STATE_DIR=%ROOT%\.server-state"
set "API_PID_FILE=%STATE_DIR%\spec-factory-api.pid"
if exist "%API_PID_FILE%" (
  set /p PID=<"%API_PID_FILE%"
  if defined PID (
    tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
      echo         Killing API PID !PID!
      taskkill /F /PID !PID! >nul 2>nul
    ) else (
      echo         API PID !PID! already gone.
    )
    del "%API_PID_FILE%" >nul 2>nul
  )
  set "PID="
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8788 " ^| findstr "LISTENING"') do (
  if "%%p" NEQ "0" (
    echo         Killing leftover process on port 8788 ^(PID %%p^)
    taskkill /F /PID %%p >nul 2>nul
  )
)
timeout /t 2 /nobreak >nul
echo         Done.
echo.
echo   [3/3] Starting server...
call node tools\dev-stack-control.js start-api
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] Server failed to start. Check .server-state\spec-factory-api.log
  goto :done
)
echo.
echo   ============================================
echo     Rebuild + Restart complete!  http://localhost:8788
echo   ============================================
goto :done

:: ── Build GUI ─────────────────────────────────────────────────────────
:action_build_gui
set "QUICK_MODE=0"
if /I "%~2"=="--quick" set "QUICK_MODE=1"
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   Rebuilding native modules...
call npm rebuild better-sqlite3 2>nul
echo   Building GUI...
call npm run gui:build
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] GUI build failed.
  goto :done
)
if "%QUICK_MODE%"=="1" goto :sync_gui_dist
echo.
echo   GUI build complete.
goto :done

:action_build_gui_quick
set "QUICK_MODE=1"
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   Rebuilding native modules...
call npm rebuild better-sqlite3 2>nul
echo   Building GUI...
call npm run gui:build
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] GUI build failed.
  goto :done
)
goto :sync_gui_dist

:sync_gui_dist
echo   Syncing GUI assets to gui-dist...
if exist "%ROOT%\gui-dist" rmdir /s /q "%ROOT%\gui-dist"
robocopy "%ROOT%\tools\gui-react\dist" "%ROOT%\gui-dist" /MIR /NFL /NDL /NJH /NJS /nc /ns /np
echo.
echo   GUI build complete (gui-dist synchronized).
goto :done

:: ── Build EXE ─────────────────────────────────────────────────────────
:action_build_exe
if /I "%~2"=="--quick" goto :action_build_exe_quick
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   ============================================
echo     SpecFactory Full Build
echo   ============================================
echo   Building: React GUI + server bundle + SpecFactory.exe + gui-dist
echo.
call node tools/build-exe.mjs
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] Build failed.
  goto :done
)
echo.
echo   Build complete.
goto :done

:action_build_exe_quick
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   Quick GUI rebuild for existing SpecFactory.exe...
call npm run gui:build
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] GUI build failed.
  goto :done
)
if exist "%ROOT%\gui-dist" rmdir /s /q "%ROOT%\gui-dist"
robocopy "%ROOT%\tools\gui-react\dist" "%ROOT%\gui-dist" /MIR /NFL /NDL /NJH /NJS /nc /ns /np
echo.
echo   GUI assets synced to gui-dist. Restart SpecFactory.exe to load updated assets.
goto :done

:: ── Build Launcher EXE ────────────────────────────────────────────────
:action_build_launcher
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
echo   ============================================
echo     Launcher EXE Build
echo   ============================================
echo.
call node tools\build-setup-exe.mjs
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo   [ERROR] Launcher build failed.
  goto :done
)
echo.
echo   Launcher build complete.
goto :done

:: ── Kill Processes ────────────────────────────────────────────────────
:action_kill
echo.
echo   Killing tracked Spec Factory processes...
set "STATE_DIR=%ROOT%\.server-state"
set "KILLED=0"

for %%f in ("%STATE_DIR%\*.pid") do (
  set /p PID=<"%%f"
  if defined PID (
    tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
      echo     Killing tracked PID !PID! ^(%%~nxf^)
      taskkill /F /PID !PID! >nul 2>nul
      set /a KILLED+=1
    ) else (
      echo     Tracked PID !PID! already gone ^(%%~nxf^)
    )
    del "%%f" >nul 2>nul
  )
  set "PID="
)

for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8788 " ^| findstr "LISTENING"') do (
  if "%%p" NEQ "0" (
    echo     Killing port 8788 owner ^(PID %%p^)
    taskkill /F /PID %%p >nul 2>nul
    set /a KILLED+=1
  )
)

if "!KILLED!"=="0" (
  echo     No Spec Factory processes found.
) else (
  echo     Killed !KILLED! process^(es^).
)
goto :done

:: ── Process Status ────────────────────────────────────────────────────
:action_status
call :check_node
if %ERRORLEVEL% NEQ 0 goto :done
echo.
call node tools\specfactory-process-manager.js state
goto :done

:: ── Cleanup Artifacts ─────────────────────────────────────────────────
:action_cleanup
set "OUT_DIR=%ROOT%\out"
set "BILLING_DIR=%OUT_DIR%\_billing"
set "ARTIFACTS_DIR=%ROOT%\artifacts"
set "SPEC_DB_DIR=%ROOT%\.workspace\db"

set "DRY_RUN=0"
set "DELETE_REMOTE=0"
set "FORCE=0"
set "KEEP_BILLING=1"
set "DELETE_SPEC_DB=0"

:: Skip first arg ("cleanup") and parse the rest
shift

:cleanup_parse
if "%~1"=="" goto :cleanup_args_done
if /I "%~1"=="--dry-run" goto :cleanup_dry_run
if /I "%~1"=="-n" goto :cleanup_dry_run
if /I "%~1"=="--remote" goto :cleanup_remote
if /I "%~1"=="--yes" goto :cleanup_yes
if /I "%~1"=="-y" goto :cleanup_yes
if /I "%~1"=="--clear-billing" goto :cleanup_clear_billing
if /I "%~1"=="--clear-db" goto :cleanup_clear_db
if /I "%~1"=="--clear-specdb" goto :cleanup_clear_db
if /I "%~1"=="--all" goto :cleanup_all
if /I "%~1"=="--help" goto :cleanup_help
if /I "%~1"=="-h" goto :cleanup_help

echo Unknown cleanup option: %~1
goto :cleanup_help

:cleanup_dry_run
set "DRY_RUN=1"
shift
goto :cleanup_parse

:cleanup_remote
set "DELETE_REMOTE=1"
shift
goto :cleanup_parse

:cleanup_yes
set "FORCE=1"
shift
goto :cleanup_parse

:cleanup_clear_billing
set "KEEP_BILLING=0"
shift
goto :cleanup_parse

:cleanup_clear_db
set "DELETE_SPEC_DB=1"
shift
goto :cleanup_parse

:cleanup_all
set "KEEP_BILLING=0"
set "DELETE_SPEC_DB=1"
shift
goto :cleanup_parse

:cleanup_args_done
echo.
echo   This will remove run artifacts from: %OUT_DIR%
echo   This will also remove history folder: %ARTIFACTS_DIR%

if "%DELETE_SPEC_DB%"=="1" (
  echo   This will remove local spec db: %SPEC_DB_DIR%
) else (
  echo   Preserving local spec db: %SPEC_DB_DIR%
)
if "%KEEP_BILLING%"=="0" (
  echo   Will remove billing folder: %BILLING_DIR%
) else (
  echo   Preserving billing folder: %BILLING_DIR%
)

echo.
echo   Paths to remove:
echo     out\specs, out\runs, out\_runtime, out\final, out\logs
echo     out\normalized, out\output, out\_queue, out\_reports, out\_review
if "%KEEP_BILLING%"=="0" echo     out\_billing
echo     artifacts
if "%DELETE_SPEC_DB%"=="1" echo     .workspace\db
if "%DRY_RUN%"=="1" echo   --dry-run: no files will be deleted.
echo.

if "%FORCE%"=="1" goto :cleanup_confirmed
set /P "CONFIRM=  Type YES to continue: "
if /I not "%CONFIRM%"=="YES" (
  echo   Cancelled.
  goto :done
)

:cleanup_confirmed
call :delete_path "%OUT_DIR%\specs" "specs"
call :delete_path "%OUT_DIR%\runs" "runs"
call :delete_path "%OUT_DIR%\_runtime" "_runtime"
call :delete_path "%OUT_DIR%\final" "final"
call :delete_path "%OUT_DIR%\logs" "logs"
call :delete_path "%OUT_DIR%\normalized" "normalized"
call :delete_path "%OUT_DIR%\output" "output"
call :delete_path "%OUT_DIR%\_queue" "_queue"
call :delete_path "%OUT_DIR%\_reports" "_reports"
call :delete_path "%OUT_DIR%\_review" "_review"
if "%KEEP_BILLING%"=="0" call :delete_path "%BILLING_DIR%" "_billing"
if "%DELETE_SPEC_DB%"=="1" call :delete_path "%SPEC_DB_DIR%" ".workspace\db"
call :delete_path "%ARTIFACTS_DIR%" "artifacts"

if "%DELETE_REMOTE%"=="1" call :delete_remote

if "%DRY_RUN%"=="1" (
  echo.
  echo   Dry run complete.
) else (
  echo.
  echo   Cleanup complete.
)
goto :done

:cleanup_help
echo.
echo   cleanup [--dry-run] [--remote] [--yes] [--clear-billing] [--clear-db] [--all]
echo.
echo   Default: remove run artifacts + history, keep billing.
echo   --dry-run         Show what would be removed.
echo   --yes / -y        Skip confirmation prompt.
echo   --remote          Also remove from S3 (requires S3_BUCKET).
echo   --clear-billing   Also remove out\_billing.
echo   --clear-db        Also remove .workspace\db.
echo   --all             Same as --clear-billing --clear-db.
goto :done

:: ══════════════════════════════════════════════════════════════════════
::  Subroutines
:: ══════════════════════════════════════════════════════════════════════

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
  exit /b 1
)
echo.
echo   ============================================
echo     Spec Factory Process Manager
echo   ============================================
echo.
echo   Node:    %NODE_VER% (%NODE_PATH%)
echo   Port:    8788
echo   URL:     http://localhost:8788
exit /b 0

:delete_path
set "TARGET_PATH=%~1"
set "TARGET_NAME=%~2"
if not exist "%TARGET_PATH%" (
  echo     Skipping missing %TARGET_NAME%
  exit /b 0
)
if "%DRY_RUN%"=="1" (
  echo     [dry-run] would remove %TARGET_NAME%
  exit /b 0
)
echo     Removing %TARGET_NAME%
rmdir /S /Q "%TARGET_PATH%"
exit /b 0

:delete_remote
if not defined S3_BUCKET (
  echo     S3_BUCKET not set. Skipping remote cleanup.
  exit /b 0
)
where.exe aws >nul 2>&1
if errorlevel 1 (
  echo     AWS CLI not found in PATH. Skipping remote cleanup.
  exit /b 0
)
set "S3_PATH=specs/outputs/"
if defined S3_OUTPUT_PREFIX set "S3_PATH=%S3_OUTPUT_PREFIX%"
if "%DRY_RUN%"=="1" (
  if "%KEEP_BILLING%"=="1" (
    echo     [dry-run] would run: aws s3 rm "s3://%S3_BUCKET%/%S3_PATH%" --recursive --exclude "_billing/*"
  ) else (
    echo     [dry-run] would run: aws s3 rm "s3://%S3_BUCKET%/%S3_PATH%" --recursive
  )
  exit /b 0
)
if "%KEEP_BILLING%"=="1" (
  aws s3 rm "s3://%S3_BUCKET%/%S3_PATH%" --recursive --exclude "_billing/*" --exclude "_billing"
) else (
  aws s3 rm "s3://%S3_BUCKET%/%S3_PATH%" --recursive
)
exit /b 0

:: ══════════════════════════════════════════════════════════════════════
::  Help + Exit
:: ══════════════════════════════════════════════════════════════════════

:show_help
echo.
echo   Spec Factory Process Manager
echo.
echo   Usage: SpecFactory.bat [command] [options]
echo.
echo   Commands:
echo     start              Start server + open browser
echo     start-api          Start API only (no browser)
echo     reload             Kill all + rebuild GUI + restart server
echo     refresh            Refresh browser at localhost:8788
echo     rebuild-frontend   Vite build only (safe while server running)
echo     rebuild-restart    Vite build + restart API server
echo     build-gui          Build GUI (--quick to also sync gui-dist)
echo     build-exe          Build SpecFactory.exe (--quick for GUI only)
echo     build-launcher     Build Launcher EXE
echo     kill               Kill tracked Spec Factory processes
echo     status             Show process status (JSON)
echo     cleanup [flags]    Remove run artifacts (see cleanup --help)
echo     help               Show this help
echo.
echo   No arguments: show interactive menu.
echo.
goto :done

:done
echo.
echo   Press any key to close.
pause >nul
exit /b 0

:done_quiet
exit /b 0
