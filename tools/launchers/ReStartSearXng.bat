@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "ROOT_DIR=%%~fI"
set "COMPOSE_FILE=%ROOT_DIR%\tools\searxng\docker-compose.yml"

if not exist "%COMPOSE_FILE%" (
  echo SearXNG compose file not found: "%COMPOSE_FILE%"
  exit /b 1
)

echo Restarting SearXNG using "%COMPOSE_FILE%"...
call docker compose -f "%COMPOSE_FILE%" down
if errorlevel 1 (
  echo Failed to stop the SearXNG stack.
  exit /b 1
)

call docker compose -f "%COMPOSE_FILE%" up -d
if errorlevel 1 (
  echo Failed to start the SearXNG stack.
  exit /b 1
)

echo SearXNG restart complete.
exit /b 0
