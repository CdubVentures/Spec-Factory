@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "OUT_DIR=%ROOT_DIR%out"
set "BILLING_DIR=%OUT_DIR%\_billing"
set "ARTIFACTS_DIR=%ROOT_DIR%artifacts"
set "SPEC_DB_DIR=%ROOT_DIR%.specfactory_tmp"

set "DRY_RUN=0"
set "DELETE_REMOTE=0"
set "FORCE=0"
set "KEEP_BILLING=1"
set "DELETE_SPEC_DB=0"

if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--dry-run" goto opt_dry_run
if /I "%~1"=="-n" goto opt_dry_run
if /I "%~1"=="--remote" goto opt_remote
if /I "%~1"=="--yes" goto opt_yes
if /I "%~1"=="-y" goto opt_yes
if /I "%~1"=="--clear-billing" goto opt_clear_billing
if /I "%~1"=="--clear-db" goto opt_clear_db
if /I "%~1"=="--clear-specdb" goto opt_clear_db
if /I "%~1"=="--all" goto opt_all

echo Unknown option: %~1
call :usage
exit /b 1

:opt_dry_run
set "DRY_RUN=1"
shift
goto parse_args

:opt_remote
set "DELETE_REMOTE=1"
shift
goto parse_args

:opt_yes
set "FORCE=1"
shift
goto parse_args

:opt_clear_billing
set "KEEP_BILLING=0"
shift
goto parse_args

:opt_clear_db
set "DELETE_SPEC_DB=1"
shift
goto parse_args

:opt_all
set "KEEP_BILLING=0"
set "DELETE_SPEC_DB=1"
shift
goto parse_args

:args_done
echo.
echo This will remove run artifacts from: %OUT_DIR%
echo This will also remove run history folder: %ARTIFACTS_DIR%

if "%DELETE_SPEC_DB%"=="1" goto keep_db_print_remove

echo Preserving local spec db folder: %SPEC_DB_DIR%
goto db_print_done

:keep_db_print_remove
echo This will remove local spec db folder: %SPEC_DB_DIR%
:db_print_done

if "%KEEP_BILLING%"=="1" goto keep_billing_print

echo Will remove billing folder: %BILLING_DIR%
goto billing_print_done

:keep_billing_print
echo Preserving billing folder: %BILLING_DIR%
:billing_print_done

echo.
echo Local paths to remove:
echo   out\specs
echo   out\runs
echo   out\_runtime
echo   out\final
echo   out\logs
echo   out\normalized
echo   out\output
echo   out\_queue
echo   out\_reports
echo   out\_review
if "%KEEP_BILLING%"=="0" echo   out\_billing
echo   artifacts
if "%DELETE_SPEC_DB%"=="1" echo   .specfactory_tmp
if "%DRY_RUN%"=="1" echo --dry-run: no files will be deleted.
if "%DELETE_REMOTE%"=="1" goto print_remote
goto print_remote_done

:print_remote
if "%KEEP_BILLING%"=="1" echo Remote cleanup enabled (S3 outputs excluding _billing).
goto print_remote_done

echo Remote cleanup enabled (S3 outputs including _billing).
:print_remote_done

echo.
if "%FORCE%"=="1" goto confirm_done
set /P "CONFIRM=Type YES to continue: "
if /I "%CONFIRM%"=="YES" goto confirm_done

echo Cancelled.
exit /b 0

:confirm_done

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
if "%KEEP_BILLING%"=="1" goto skip_billing_delete
call :delete_path "%BILLING_DIR%" "_billing"
:skip_billing_delete

if "%DELETE_SPEC_DB%"=="1" call :delete_path "%SPEC_DB_DIR%" ".specfactory_tmp"
call :delete_path "%ARTIFACTS_DIR%" "artifacts"

if "%DELETE_REMOTE%"=="1" call :delete_remote

if "%DRY_RUN%"=="1" goto msg_dry_done

echo.
echo Cleanup complete.
goto final_done

:msg_dry_done
echo.
echo Dry run complete.

:final_done
exit /b 0

:delete_path
set "TARGET_PATH=%~1"
set "TARGET_NAME=%~2"
if not exist "%TARGET_PATH%" goto path_missing
if "%DRY_RUN%"=="1" goto path_dry

echo Removing %TARGET_NAME%
rmdir /S /Q "%TARGET_PATH%"
goto path_delete_done

:path_dry
echo [dry-run] would remove %TARGET_NAME%
goto path_delete_done

:path_missing
echo Skipping missing %TARGET_NAME%
goto path_delete_done

:path_delete_done
exit /b 0

:delete_remote
if not defined S3_BUCKET goto err_no_bucket
where.exe aws >nul 2>&1
if errorlevel 1 goto err_no_aws

set "S3_PATH=specs/outputs/"
if defined S3_OUTPUT_PREFIX set "S3_PATH=%S3_OUTPUT_PREFIX%"

if "%DRY_RUN%"=="1" goto remote_dry
if "%KEEP_BILLING%"=="1" goto remote_keep
aws s3 rm "s3://%S3_BUCKET%/%S3_PATH%" --recursive
goto delete_remote_done

:remote_keep
aws s3 rm "s3://%S3_BUCKET%/%S3_PATH%" --recursive --exclude "_billing/*" --exclude "_billing"
goto delete_remote_done

:remote_dry
if "%KEEP_BILLING%"=="1" goto remote_dry_keep

echo [dry-run] would run: aws s3 rm "s3://%S3_BUCKET%/%S3_PATH%" --recursive
goto remote_dry_done

:remote_dry_keep
echo [dry-run] would run: aws s3 rm "s3://%S3_BUCKET%/%S3_PATH%" --recursive --exclude "_billing/*" --exclude "_billing"

goto remote_dry_done

:remote_dry_done
goto delete_remote_done

:err_no_aws
echo AWS CLI not found in PATH. Install AWS CLI and retry.
goto delete_remote_done

:err_no_bucket
echo S3_BUCKET not set. Set S3_BUCKET before using --remote.
goto delete_remote_done

:delete_remote_done
exit /b 0

:usage
echo RunDump.bat [--dry-run] [--remote] [--yes] [--clear-billing] [--clear-db]
echo           [--all] [--help]
echo.
echo Default behavior: remove all run artifacts and history, keep billing.
echo --dry-run         Show what would be removed, do not delete.
echo --yes             Skip prompt and execute immediately.
echo --remote          Also remove matching run artifacts from S3 output prefix.
echo                   Requires S3_BUCKET and optional S3_OUTPUT_PREFIX.
echo --clear-billing   Also remove out\_billing locally and from remote cleanup.
echo --clear-db        Also remove local .specfactory_tmp directory.
echo --all             Same as --clear-billing --clear-db.
echo -h, --help        Show this help.
exit /b 1

