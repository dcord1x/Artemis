#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "================================================"
echo "  Red Light Alert — Demo Startup"
echo "================================================"
echo ""

# ── 1. Python check ───────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "ERROR: Python 3 is not installed."
  echo "Install it from https://python.org/downloads and re-run this script."
  exit 1
fi

PYTHON=$(command -v python3)
echo "Using Python: $PYTHON ($($PYTHON --version))"

# ── 2. Create virtualenv if needed ───────────────
VENV="$DIR/venv_mac"
if [ ! -d "$VENV" ]; then
  echo ""
  echo "Setting up virtual environment (first run only)..."
  $PYTHON -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip -q
  "$VENV/bin/pip" install -r "$DIR/requirements.txt" -q
  echo "Dependencies installed."
fi

# ── 3. Start backend ──────────────────────────────
echo ""
echo "Starting backend on http://localhost:8000 ..."
cd "$DIR/backend"
"$VENV/bin/python" -m uvicorn main:app --port 8000 &
BACKEND_PID=$!
cd "$DIR"

# ── 4. Wait for backend, then open browser ────────
sleep 2
echo ""
echo "================================================"
echo "  Opening http://localhost:8000"
echo "  Press Ctrl+C to stop."
echo "================================================"
open "http://localhost:8000"

# Wait for Ctrl+C
wait $BACKEND_PID
