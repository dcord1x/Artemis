#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "================================================"
echo "  Red Light Alert — Demo Startup"
echo "================================================"
echo ""

# ── 1. Python check ───────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "ERROR: Python 3 is not installed."
  echo "Install it from https://python.org/downloads and re-run this script."
  exit 1
fi

PYTHON=$(command -v python3)
echo "Using Python: $PYTHON ($($PYTHON --version))"

# ── 2. Auto-update ────────────────────────────────────────────────────────────
VENV="$DIR/venv_mac"
LOG="$DIR/update.log"

# Rotate log if over 100 KB
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 102400 ]; then rm "$LOG"; fi

echo "[$(date)] Update check started" >> "$LOG"
echo "Checking for updates..."

if git -C "$DIR" fetch origin master --quiet 2>>"$LOG"; then
    LOCAL=$(git -C "$DIR" rev-parse HEAD 2>/dev/null)
    REMOTE=$(git -C "$DIR" rev-parse origin/master 2>/dev/null)

    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "[$(date)] Update available: ${LOCAL:0:7} -> ${REMOTE:0:7}" >> "$LOG"

        git -C "$DIR" stash --quiet 2>>"$LOG"

        if git -C "$DIR" pull origin master --quiet 2>>"$LOG"; then
            echo "[$(date)] Code updated successfully" >> "$LOG"

            # Python deps
            REQ_FILE="$DIR/requirements.txt"
            REQ_HASH_FILE="$DIR/.last_requirements_hash"
            NEW_REQ_HASH=$(md5 -q "$REQ_FILE" 2>/dev/null || md5sum "$REQ_FILE" | cut -d' ' -f1)
            OLD_REQ_HASH=$(cat "$REQ_HASH_FILE" 2>/dev/null || echo "none")

            if [ "$NEW_REQ_HASH" != "$OLD_REQ_HASH" ] && [ -d "$VENV" ]; then
                echo "[$(date)] requirements.txt changed - reinstalling Python deps" >> "$LOG"
                "$VENV/bin/pip" install -r "$REQ_FILE" -q >>"$LOG" 2>&1 \
                    && echo "$NEW_REQ_HASH" > "$REQ_HASH_FILE" \
                    && echo "[$(date)] Python deps updated" >> "$LOG" \
                    || echo "[$(date)] pip install failed" >> "$LOG"
            fi

            # Node deps
            PKG_FILE="$DIR/frontend/package.json"
            LOCK_FILE="$DIR/frontend/package-lock.json"
            PKG_HASH_FILE="$DIR/.last_package_hash"
            H1=$(md5 -q "$PKG_FILE" 2>/dev/null || md5sum "$PKG_FILE" | cut -d' ' -f1)
            H2=$(md5 -q "$LOCK_FILE" 2>/dev/null || md5sum "$LOCK_FILE" | cut -d' ' -f1)
            NEW_PKG_HASH="${H1}${H2}"
            OLD_PKG_HASH=$(cat "$PKG_HASH_FILE" 2>/dev/null || echo "none")

            if [ "$NEW_PKG_HASH" != "$OLD_PKG_HASH" ]; then
                echo "[$(date)] package.json changed - running npm ci" >> "$LOG"
                cd "$DIR/frontend" \
                    && npm ci --silent >>"$LOG" 2>&1 \
                    && echo "$NEW_PKG_HASH" > "$PKG_HASH_FILE" \
                    && echo "[$(date)] Node deps updated" >> "$LOG" \
                    || echo "[$(date)] npm ci failed" >> "$LOG"
                cd "$DIR"
            fi

            # Frontend rebuild (Mac serves from dist/)
            echo "[$(date)] Building frontend..." >> "$LOG"
            cd "$DIR/frontend" \
                && npm run build --silent >>"$LOG" 2>&1 \
                && echo "[$(date)] Frontend built successfully" >> "$LOG" \
                || echo "[$(date)] Frontend build failed - old dist may still serve" >> "$LOG"
            cd "$DIR"

        else
            echo "[$(date)] git pull failed - restoring stash" >> "$LOG"
            git -C "$DIR" stash pop --quiet 2>>"$LOG"
        fi
    else
        echo "[$(date)] Already up to date (${LOCAL:0:7})" >> "$LOG"
    fi
else
    echo "[$(date)] git fetch failed - skipping update" >> "$LOG"
fi

echo "[$(date)] Update check complete" >> "$LOG"

# ── 3. Create virtualenv if needed ───────────────────────────────────────────
if [ ! -d "$VENV" ]; then
  echo ""
  echo "Setting up virtual environment (first run only)..."
  $PYTHON -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip -q
  "$VENV/bin/pip" install -r "$DIR/requirements.txt" -q
  echo "Dependencies installed."
  # Write hash so next update doesn't re-run pip
  NEW_HASH=$(md5 -q "$DIR/requirements.txt" 2>/dev/null || md5sum "$DIR/requirements.txt" | cut -d' ' -f1)
  echo "$NEW_HASH" > "$DIR/.last_requirements_hash"
fi

# ── 4. Build frontend if dist/ is missing (first run after fresh clone) ───────
if [ ! -d "$DIR/frontend/dist" ]; then
  echo "Building frontend (first run)..."
  if [ ! -d "$DIR/frontend/node_modules" ]; then
    cd "$DIR/frontend" && npm install -q && cd "$DIR"
  fi
  cd "$DIR/frontend" && npm run build --silent && cd "$DIR"
  H1=$(md5 -q "$DIR/frontend/package.json" 2>/dev/null || md5sum "$DIR/frontend/package.json" | cut -d' ' -f1)
  H2=$(md5 -q "$DIR/frontend/package-lock.json" 2>/dev/null || md5sum "$DIR/frontend/package-lock.json" | cut -d' ' -f1)
  echo "${H1}${H2}" > "$DIR/.last_package_hash"
fi

# ── 5. Validate spaCy model (handles version mismatch on existing venvs) ──────
if ! "$VENV/bin/python" -c "import spacy; spacy.load('en_core_web_sm')" 2>/dev/null; then
  echo ""
  echo "spaCy model missing or incompatible — reinstalling (one-time, ~12 MB)..."
  "$VENV/bin/pip" install "spacy>=3.8.0,<3.9.0" --upgrade -q
  "$VENV/bin/pip" install "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl" -q
  echo "spaCy model ready."
fi

# ── 6. Start backend ──────────────────────────────────────────────────────────
echo ""
echo "Starting backend on http://localhost:8000 ..."
cd "$DIR/backend"
"$VENV/bin/python" -m uvicorn main:app --port 8000 &
BACKEND_PID=$!
cd "$DIR"

# ── 7. Wait for backend, then open browser ────────────────────────────────────
sleep 2
echo ""
echo "================================================"
echo "  Opening http://localhost:8000"
echo "  Press Ctrl+C to stop."
echo "================================================"
open "http://localhost:8000"

# Wait for Ctrl+C
wait $BACKEND_PID
