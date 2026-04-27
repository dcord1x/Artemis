@echo off
title Artemis — Starting...

echo ============================================================
echo  Artemis
echo ============================================================
echo.

REM ── 1. Check for git updates (pull only if remote has new commits) ────────────
echo [1/3] Checking for git updates...
git -C "%~dp0" fetch origin master --quiet 2>nul
if errorlevel 1 (
    echo      No network or git not found — skipping update check.
    goto :build
)

for /f %%i in ('git -C "%~dp0" rev-parse HEAD 2^>nul') do set "LOCAL=%%i"
for /f %%i in ('git -C "%~dp0" rev-parse origin/master 2^>nul') do set "REMOTE=%%i"

if "%LOCAL%"=="%REMOTE%" (
    echo      Already up to date.
    goto :build
)

echo      New commits on origin — pulling...
git -C "%~dp0" pull origin master --quiet 2>nul
if errorlevel 1 (
    echo      Pull failed — building from current local files.
) else (
    echo      Code updated to latest.
)

:build
echo.

REM ── 2. Build frontend ────────────────────────────────────────────────────────
echo [2/3] Building frontend (first run may take ~30 seconds)...
pushd "%~dp0frontend"
call npm run build
if errorlevel 1 (
    echo.
    echo  ERROR: Frontend build failed. See errors above.
    echo  Press any key to exit.
    pause >nul
    popd
    exit /b 1
)
popd
echo      Frontend built OK.
echo.

REM ── 3. Start backend ─────────────────────────────────────────────────────────
echo [3/3] Starting backend...
echo.

title Artemis — Running at http://localhost:8000
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:8000"

cd /d "%~dp0backend"
echo  Running at http://localhost:8000
echo  Close this window to stop Artemis.
echo ============================================================
echo.
"%~dp0backend_env\Scripts\python" -m uvicorn main:app --port 8000
