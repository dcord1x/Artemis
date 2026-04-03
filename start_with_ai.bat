@echo off
echo Starting Red Light Alert (with AI suggestions)...
echo.

REM *** PUT YOUR ANTHROPIC API KEY BELOW ***
set ANTHROPIC_API_KEY=your-api-key-here

REM Start backend
start "RLA Backend" cmd /k "cd /d "%~dp0backend" && set ANTHROPIC_API_KEY=%ANTHROPIC_API_KEY% && "..\backend_env\Scripts\python" -m uvicorn main:app --reload --port 8000"

timeout /t 2 /nobreak >nul
start "RLA Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
pause
