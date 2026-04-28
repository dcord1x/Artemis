#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "============================================================"
echo "  Red Light Alert"
echo "============================================================"
echo ""

# ── 1. Python check ───────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "ERROR: Python 3 is not installed."
  echo "Install it from https://python.org/downloads and re-run this script."
  exit 1
fi

PYTHON=$(command -v python3)
echo "Using Python: $PYTHON ($($PYTHON --version))"

# ── 2. Git update (pull only if remote has new commits) ───────────────────────
LOG="$DIR/update.log"
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 102400 ]; then rm "$LOG"; fi

echo "[1/3] Checking for git updates..."

if git -C "$DIR" fetch origin --quiet 2>>"$LOG"; then
    LOCAL=$(git -C "$DIR" rev-parse HEAD 2>/dev/null)
    REMOTE=$(git -C "$DIR" rev-parse origin/master 2>/dev/null)

    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "       New commits on origin — pulling..."
        echo "[$(date)] Update: ${LOCAL:0:7} -> ${REMOTE:0:7}" >> "$LOG"

        if git -C "$DIR" pull origin master --quiet 2>>"$LOG"; then
            echo "       Code updated to latest."
            echo "[$(date)] Pull succeeded" >> "$LOG"

            # Reinstall Python deps if requirements.txt changed
            REQ_FILE="$DIR/requirements.txt"
            REQ_HASH_FILE="$DIR/.last_requirements_hash"
            NEW_REQ_HASH=$(md5 -q "$REQ_FILE" 2>/dev/null || md5sum "$REQ_FILE" | cut -d' ' -f1)
            OLD_REQ_HASH=$(cat "$REQ_HASH_FILE" 2>/dev/null || echo "none")
            VENV="$DIR/venv_mac"
            if [ "$NEW_REQ_HASH" != "$OLD_REQ_HASH" ] && [ -d "$VENV" ]; then
                echo "       requirements.txt changed — updating Python deps..."
                "$VENV/bin/pip" install -r "$REQ_FILE" -q >>"$LOG" 2>&1 \
                    && echo "$NEW_REQ_HASH" > "$REQ_HASH_FILE" \
                    && echo "[$(date)] Python deps updated" >> "$LOG" \
                    || echo "[$(date)] pip install failed" >> "$LOG"
            fi

            # Reinstall Node deps if package.json / package-lock.json changed
            PKG_FILE="$DIR/frontend/package.json"
            LOCK_FILE="$DIR/frontend/package-lock.json"
            PKG_HASH_FILE="$DIR/.last_package_hash"
            H1=$(md5 -q "$PKG_FILE" 2>/dev/null || md5sum "$PKG_FILE" | cut -d' ' -f1)
            H2=$(md5 -q "$LOCK_FILE" 2>/dev/null || md5sum "$LOCK_FILE" | cut -d' ' -f1)
            NEW_PKG_HASH="${H1}${H2}"
            OLD_PKG_HASH=$(cat "$PKG_HASH_FILE" 2>/dev/null || echo "none")
            if [ "$NEW_PKG_HASH" != "$OLD_PKG_HASH" ]; then
                echo "       package.json changed — running npm ci..."
                cd "$DIR/frontend" \
                    && npm ci --silent >>"$LOG" 2>&1 \
                    && echo "$NEW_PKG_HASH" > "$PKG_HASH_FILE" \
                    && echo "[$(date)] Node deps updated" >> "$LOG" \
                    || echo "[$(date)] npm ci failed" >> "$LOG"
                cd "$DIR"
            fi
        else
            echo "       Pull failed — building from current local files."
            echo "[$(date)] git pull failed" >> "$LOG"
        fi
    else
        echo "       Already up to date."
        echo "[$(date)] Already up to date (${LOCAL:0:7})" >> "$LOG"
    fi
else
    echo "       No network or git not found — skipping update check."
    echo "[$(date)] git fetch failed — skipping update" >> "$LOG"
fi

# ── 3. Create virtualenv + install deps (first run only) ──────────────────────
VENV="$DIR/venv_mac"
if [ ! -d "$VENV" ]; then
  echo ""
  echo "Setting up virtual environment (first run only)..."
  $PYTHON -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip -q
  "$VENV/bin/pip" install -r "$DIR/requirements.txt" -q
  echo "Dependencies installed."
  NEW_HASH=$(md5 -q "$DIR/requirements.txt" 2>/dev/null || md5sum "$DIR/requirements.txt" | cut -d' ' -f1)
  echo "$NEW_HASH" > "$DIR/.last_requirements_hash"
fi

# ── 4. Install Node modules if missing (first run after fresh clone) ───────────
if [ ! -d "$DIR/frontend/node_modules" ]; then
  echo "Installing Node modules (first run only)..."
  cd "$DIR/frontend" && npm install -q && cd "$DIR"
  H1=$(md5 -q "$DIR/frontend/package.json" 2>/dev/null || md5sum "$DIR/frontend/package.json" | cut -d' ' -f1)
  H2=$(md5 -q "$DIR/frontend/package-lock.json" 2>/dev/null || md5sum "$DIR/frontend/package-lock.json" | cut -d' ' -f1)
  echo "${H1}${H2}" > "$DIR/.last_package_hash"
fi

# ── 5. Validate spaCy model ────────────────────────────────────────────────────
if ! "$VENV/bin/python" -c "import spacy; spacy.load('en_core_web_sm')" 2>/dev/null; then
  echo ""
  echo "spaCy model missing or incompatible — reinstalling (one-time, ~12 MB)..."
  "$VENV/bin/pip" install "spacy>=3.8.0,<3.9.0" --upgrade -q
  "$VENV/bin/pip" install "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl" -q
  echo "spaCy model ready."
fi

# ── 6. Build frontend (always, so local commits are reflected) ─────────────────
echo ""
echo "[2/3] Building frontend (first run may take ~30 seconds)..."
cd "$DIR/frontend"
npm run build
if [ $? -ne 0 ]; then
  echo ""
  echo "ERROR: Frontend build failed. See errors above."
  exit 1
fi
cd "$DIR"
echo "       Frontend built OK."

# ── 7. Start backend ──────────────────────────────────────────────────────────
echo ""
echo "[3/3] Starting backend..."
echo ""
echo "============================================================"
echo "  Running at http://localhost:8000"
echo "  Press Ctrl+C to stop."
echo "============================================================"
echo ""

# Open browser after a short delay
(sleep 2 && open "http://localhost:8000") &

cd "$DIR/backend"
"$VENV/bin/python" -m uvicorn main:app --port 8000
