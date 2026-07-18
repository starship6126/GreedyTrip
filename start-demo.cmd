@echo off
setlocal

cd /d "%~dp0"

set "CODEX_NODE_DIR=C:\Users\stars\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "CODEX_NODE=%CODEX_NODE_DIR%\node.exe"

if not exist "%CODEX_NODE%" (
  echo [GreedyTrip] Bundled Node.js was not found.
  echo Install Node.js 20 or newer, reopen this terminal, then run npm install.
  exit /b 1
)

if not exist "node_modules\next\dist\bin\next" (
  echo [GreedyTrip] Project dependencies are missing.
  echo Install Node.js 20 or newer, reopen this terminal, then run npm install.
  exit /b 1
)

if not exist ".env.local" copy /Y ".env.example" ".env.local" >nul

set "PATH=%CODEX_NODE_DIR%;%CD%\node_modules\.bin;%PATH%"

echo [GreedyTrip] Checking demo readiness...
call "%CD%\node_modules\.bin\cross-env.cmd" NODE_OPTIONS=--conditions=react-server GREEDYTRIP_SKIP_LIVE_SEED=true tsx scripts\prepare-demo.ts
if errorlevel 1 exit /b %errorlevel%

if /I "%~1"=="prepare" exit /b 0

echo [GreedyTrip] Starting http://localhost:3000
"%CODEX_NODE%" "%CD%\node_modules\next\dist\bin\next" dev
