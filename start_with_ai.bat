@echo off
echo Checking for updates...
call "%~dp0update.bat"
echo.
echo Starting Artemis (with AI suggestions)...
echo.

REM *** PUT YOUR ANTHROPIC API KEY BELOW ***
set ANTHROPIC_API_KEY=your-api-key-here

REM Open browser after backend has a moment to start
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:8000"

REM Start backend in this window (blocking — close window to stop the app)
cd /d "%~dp0backend"
echo Running at http://localhost:8000
echo Close this window to stop Artemis.
echo.
set ANTHROPIC_API_KEY=%ANTHROPIC_API_KEY%
"%~dp0backend_env\Scripts\python" -m uvicorn main:app --port 8000
