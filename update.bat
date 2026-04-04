@echo off
setlocal EnableDelayedExpansion

set "DIR=%~dp0"
set "LOG=%DIR%update.log"
set "PY=%DIR%backend_env\Scripts\python.exe"

REM Rotate log if over 100 KB
if exist "%LOG%" (
    for %%A in ("%LOG%") do if %%~zA gtr 102400 del "%LOG%"
)

echo [%date% %time%] Update check started >> "%LOG%"

REM ── 1. Fetch latest refs ──────────────────────────────────────────────────
git -C "%DIR%" fetch origin master --quiet 2>>"%LOG%"
if errorlevel 1 (
    echo [%date% %time%] git fetch failed - skipping update >> "%LOG%"
    goto :done
)

REM ── 2. Compare local HEAD vs origin/master ────────────────────────────────
for /f %%i in ('git -C "%DIR%" rev-parse HEAD 2^>nul') do set "LOCAL=%%i"
for /f %%i in ('git -C "%DIR%" rev-parse origin/master 2^>nul') do set "REMOTE=%%i"

if "%LOCAL%"=="%REMOTE%" (
    echo [%date% %time%] Already up to date ^(%LOCAL:~0,7%^) >> "%LOG%"
    goto :done
)

echo [%date% %time%] Update available %LOCAL:~0,7% to %REMOTE:~0,7% >> "%LOG%"

REM ── 3. Stash any local edits, then pull ───────────────────────────────────
git -C "%DIR%" stash --quiet 2>>"%LOG%"
git -C "%DIR%" pull origin master --quiet 2>>"%LOG%"
if errorlevel 1 (
    echo [%date% %time%] git pull failed - restoring stash >> "%LOG%"
    git -C "%DIR%" stash pop --quiet 2>>"%LOG%"
    goto :done
)
echo [%date% %time%] Code updated successfully >> "%LOG%"

REM ── 4. Python deps check ──────────────────────────────────────────────────
set "REQ_FILE=%DIR%requirements.txt"
set "REQ_HASH_FILE=%DIR%.last_requirements_hash"
set "NEW_REQ_HASH="

for /f "skip=1 tokens=*" %%h in ('certutil -hashfile "%REQ_FILE%" MD5 2^>nul') do (
    if not defined NEW_REQ_HASH set "NEW_REQ_HASH=%%h"
)
set "NEW_REQ_HASH=%NEW_REQ_HASH: =%"

set "OLD_REQ_HASH="
if exist "%REQ_HASH_FILE%" set /p OLD_REQ_HASH=<"%REQ_HASH_FILE%"

if not "%NEW_REQ_HASH%"=="%OLD_REQ_HASH%" (
    echo [%date% %time%] requirements.txt changed - reinstalling Python deps >> "%LOG%"
    if exist "%PY%" (
        "%PY%" -m pip install -r "%REQ_FILE%" -q 2>>"%LOG%"
        if errorlevel 1 (
            echo [%date% %time%] pip install failed >> "%LOG%"
        ) else (
            echo %NEW_REQ_HASH%> "%REQ_HASH_FILE%"
            echo [%date% %time%] Python deps updated >> "%LOG%"
        )
    ) else (
        echo [%date% %time%] Python virtualenv not found - skipping pip install >> "%LOG%"
    )
) else (
    echo [%date% %time%] Python deps unchanged >> "%LOG%"
)

REM ── 5. Node deps check ────────────────────────────────────────────────────
set "PKG_FILE=%DIR%frontend\package.json"
set "LOCK_FILE=%DIR%frontend\package-lock.json"
set "PKG_HASH_FILE=%DIR%.last_package_hash"
set "NEW_PKG_H1="
set "NEW_PKG_H2="

for /f "skip=1 tokens=*" %%h in ('certutil -hashfile "%PKG_FILE%" MD5 2^>nul') do (
    if not defined NEW_PKG_H1 set "NEW_PKG_H1=%%h"
)
for /f "skip=1 tokens=*" %%h in ('certutil -hashfile "%LOCK_FILE%" MD5 2^>nul') do (
    if not defined NEW_PKG_H2 set "NEW_PKG_H2=%%h"
)
set "NEW_PKG_H1=%NEW_PKG_H1: =%"
set "NEW_PKG_H2=%NEW_PKG_H2: =%"
set "NEW_PKG_HASH=%NEW_PKG_H1%%NEW_PKG_H2%"

set "OLD_PKG_HASH="
if exist "%PKG_HASH_FILE%" set /p OLD_PKG_HASH=<"%PKG_HASH_FILE%"

if not "%NEW_PKG_HASH%"=="%OLD_PKG_HASH%" (
    echo [%date% %time%] package.json changed - running npm ci >> "%LOG%"
    pushd "%DIR%frontend"
    npm ci --silent 2>>"%LOG%"
    if errorlevel 1 (
        echo [%date% %time%] npm ci failed >> "%LOG%"
        popd
    ) else (
        popd
        echo %NEW_PKG_HASH%> "%PKG_HASH_FILE%"
        echo [%date% %time%] Node deps updated >> "%LOG%"
    )
) else (
    echo [%date% %time%] Node deps unchanged >> "%LOG%"
)

REM ── 6. Rebuild frontend (now served as static files from backend) ─────────
echo [%date% %time%] Building frontend... >> "%LOG%"
pushd "%DIR%frontend"
npm run build --silent 2>>"%LOG%"
if errorlevel 1 (
    echo [%date% %time%] Frontend build failed - old dist may still serve >> "%LOG%"
    popd
) else (
    popd
    echo [%date% %time%] Frontend built successfully >> "%LOG%"
)

:done
echo [%date% %time%] Update check complete >> "%LOG%"
endlocal
