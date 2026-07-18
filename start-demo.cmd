@echo off
setlocal

cd /d "%~dp0"

set "NODE_EXE="
set "BUNDLED_NODE_DIR=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"

if exist "%BUNDLED_NODE_DIR%\node.exe" set "NODE_EXE=%BUNDLED_NODE_DIR%\node.exe"
if not defined NODE_EXE (
  for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
)

if not defined NODE_EXE (
  echo [GreedyTrip] Node.js was not found.
  echo Install Node.js 20.9 or newer, reopen this terminal, then run npm install.
  exit /b 1
)

"%NODE_EXE%" -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>20||(major===20&&minor>=9)?0:1)"
if errorlevel 1 (
  echo [GreedyTrip] Node.js 20.9 or newer is required.
  exit /b 1
)

if not exist "node_modules\next\dist\bin\next" (
  echo [GreedyTrip] Project dependencies are missing.
  echo Install Node.js 20.9 or newer, reopen this terminal, then run npm install.
  exit /b 1
)

if not exist "node_modules\tsx\dist\cli.mjs" (
  echo [GreedyTrip] Project dependencies are missing.
  echo Install Node.js 20.9 or newer, reopen this terminal, then run npm install.
  exit /b 1
)

if not exist ".env.local" copy /Y ".env.example" ".env.local" >nul

echo [GreedyTrip] Checking demo readiness...
set "SAVED_NODE_OPTIONS=%NODE_OPTIONS%"
set "SAVED_SKIP_LIVE_SEED=%GREEDYTRIP_SKIP_LIVE_SEED%"
set "NODE_OPTIONS=--conditions=react-server"
set "GREEDYTRIP_SKIP_LIVE_SEED=true"
"%NODE_EXE%" "%CD%\node_modules\tsx\dist\cli.mjs" scripts\prepare-demo.ts
if errorlevel 1 exit /b %errorlevel%

if /I "%~1"=="prepare" exit /b 0

set "NODE_OPTIONS=%SAVED_NODE_OPTIONS%"
set "GREEDYTRIP_SKIP_LIVE_SEED=%SAVED_SKIP_LIVE_SEED%"
echo [GreedyTrip] Starting http://localhost:3000
"%NODE_EXE%" "%CD%\node_modules\next\dist\bin\next" dev
exit /b %errorlevel%
