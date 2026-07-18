@echo off
setlocal

cd /d "%~dp0"

set "CODEX_NODE_DIR=C:\Users\stars\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "CODEX_NODE=%CODEX_NODE_DIR%\node.exe"

if not exist "%CODEX_NODE%" (
  echo [GreedyTrip] Bundled Node.js was not found.
  exit /b 1
)

if not exist "node_modules\tsx\dist\cli.mjs" (
  echo [GreedyTrip] Project dependencies are missing.
  exit /b 1
)

set "PATH=%CODEX_NODE_DIR%;%CD%\node_modules\.bin;%PATH%"

echo [GreedyTrip] Warming real Bright Data cache. This can take several minutes.
echo [GreedyTrip] Leave this window open until the cached-record count appears.
call "%CD%\node_modules\.bin\cross-env.cmd" NODE_OPTIONS=--conditions=react-server tsx scripts\seed-places.ts
if errorlevel 1 exit /b %errorlevel%

echo [GreedyTrip] Bright Data cache is ready for the judge demo.
