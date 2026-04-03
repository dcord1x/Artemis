@echo off
echo Starting Red Light Alert...
echo.

REM Start backend (must run from backend/ directory so imports resolve)
start "RLA Backend" cmd /k "cd /d "%~dp0backend" && "..\backend_env\Scripts\python" -m uvicorn main:app --reload --port 8000"

REM Wait a moment then start frontend
timeout /t 2 /nobreak >nul
start "RLA Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Both servers starting. Open http://localhost:5173 in your browser.
pause
