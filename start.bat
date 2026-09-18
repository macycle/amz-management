@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
if not exist web\dist\index.html (
  echo Building web application...
  call npm run build -w web
  if errorlevel 1 pause & exit /b 1
)
set PORT=8080
start "" http://localhost:8080
echo AMZ management is running at http://localhost:8080
echo Press Ctrl+C to stop.
call node server\src\index.js
