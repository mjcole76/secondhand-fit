@echo off
setlocal
cd /d "%~dp0"
set "PORT=3001"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20.9 or later from https://nodejs.org, then run this again.
  goto :end
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)"
if errorlevel 1 (
  echo This project needs Node.js 20.9 or later. Found:
  node -v
  goto :end
)

rem Always use the project's own Next.js. If dependencies are missing, npx would
rem fall back to a global or freshly downloaded Next.js of a different version.
if not exist "node_modules\next\dist\bin\next" (
  echo Installing dependencies with npm ci. This only happens the first time...
  call npm ci
  if errorlevel 1 (
    echo.
    echo npm ci failed. Fix the error above, then run this again.
    goto :end
  )
)

netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Port %PORT% is already in use. Secondhand Fit may already be running in another window.
  echo Close that window first, or open http://localhost:%PORT% if it is working.
  goto :end
)

echo Starting Secondhand Fit on http://localhost:%PORT% ...
rem Open the browser once the server has had a few seconds to start.
start "" /b cmd /c "ping -n 9 127.0.0.1 >nul & start "" http://localhost:%PORT%"
echo Press Ctrl+C to stop the server.
node node_modules\next\dist\bin\next dev -p %PORT%

:end
pause
endlocal
