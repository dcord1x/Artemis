@echo off
REM Force a frontend rebuild on every launch so local edits are always picked up.
if exist "%~dp0.last_build_hash" del "%~dp0.last_build_hash"
echo Checking for updates...
call "%~dp0update.bat"
echo.
echo Starting Artemis...
echo.

REM Open browser after backend has a moment to start
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:8000"

REM Start backend in this window (blocking — close window to stop the app)
cd /d "%~dp0backend"
echo Running at http://localhost:8000
echo Close this window to stop Artemis.
echo.
"%~dp0backend_env\Scripts\python" -m uvicorn main:app --port 8000
