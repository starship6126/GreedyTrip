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

if not exist "node_modules\tsx\dist\cli.mjs" (
  echo [GreedyTrip] Project dependencies are missing.
  exit /b 1
)

echo [GreedyTrip] Warming real Bright Data cache. This can take several minutes.
echo [GreedyTrip] Leave this window open until the cached-record count appears.
echo [GreedyTrip] The fallback demo remains available if collection times out.
set "NODE_OPTIONS=--conditions=react-server"
"%NODE_EXE%" "%CD%\node_modules\tsx\dist\cli.mjs" scripts\seed-places.ts
if errorlevel 1 exit /b %errorlevel%

echo [GreedyTrip] Bright Data cache is ready for the judge demo.
exit /b 0
