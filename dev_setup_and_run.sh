#!/usr/bin/env bash

# dev_setup_and_run.sh — one-click local setup for Multi Agent Orchestration
# - Creates Python venv and installs backend deps (if missing)
# - Installs frontend npm deps (if missing)
# - Ensures Postgres database and schema (if psql available)
# - Starts Ollama (if installed and not running), backend, and frontend
#
# This script is idempotent where possible: it checks for existing venv,
# node_modules, and database before creating them.

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

info()  { echo "[INFO]  $*"; }
warn()  { echo "[WARN]  $*"; }
error() { echo "[ERROR] $*"; }

info "Multi Agent Orchestration — dev setup starting"

# ── Basic tool checks ────────────────────────────────────────────────────

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command '$1' not found on PATH. Please install it first."
    return 1
  fi
}

need_cmd python3.11 || exit 1
need_cmd node || exit 1
need_cmd npm || exit 1

if command -v psql >/dev/null 2>&1; then
  HAS_PSQL=1
  info "psql found — Postgres setup will be attempted."
else
  HAS_PSQL=0
  warn "psql not found — skipping Postgres setup (DATABASE_URL will not be configured)."
fi

# ── Python venv + backend deps ───────────────────────────────────────────

VENV_DIR="$BACKEND_DIR/venv"

if [ ! -d "$VENV_DIR" ]; then
  info "Creating Python 3.11 virtual environment in backend/venv..."
  python3.11 -m venv "$VENV_DIR"
  source "$VENV_DIR/bin/activate"
  pip install --upgrade pip setuptools wheel
  info "Installing backend requirements..."
  pip install -r "$BACKEND_DIR/requirements.txt"
  # Optional extras used in README quick start
  pip install requests psutil pypdf python-docx openpyxl || true
  pip install duckduckgo-search yfinance || true
  pip install "python-telegram-bot==20.7" || true
  info "Backend Python environment ready."
else
  info "Python venv already exists at backend/venv — reusing."
  # Always activate and ensure requirements are present (safe to re-run)
  source "$VENV_DIR/bin/activate"
  if [ -f "$BACKEND_DIR/requirements.txt" ]; then
    pip install -r "$BACKEND_DIR/requirements.txt" >/dev/null 2>&1 || true
  fi
fi

# ── Frontend deps ────────────────────────────────────────────────────────

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  info "Installing frontend dependencies (npm install)..."
  (cd "$FRONTEND_DIR" && npm install)
else
  info "frontend/node_modules already present — skipping npm install."
fi

# ── Postgres DB + schema (optional) ──────────────────────────────────────

if [ "$HAS_PSQL" = "1" ]; then
  DB_NAME="${MAO_DB_NAME:-mao_dev}"
  info "Ensuring Postgres database '$DB_NAME' exists..."

  # Check if DB exists in cluster using the default 'postgres' database
  if ! psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    info "Creating database '$DB_NAME'..."
    psql postgres -c "CREATE DATABASE \"$DB_NAME\"" || {
      warn "Failed to create database '$DB_NAME'. You may need to create it manually."
    }
  else
    info "Database '$DB_NAME' already exists — skipping creation."
  fi

  if psql "$DB_NAME" -c 'SELECT 1' >/dev/null 2>&1; then
    info "Applying infra/db/init.sql schema (idempotent)..."
    psql "$DB_NAME" -f "$BACKEND_DIR/infra/db/init.sql" || warn "Schema init may have failed; check psql output."
  else
    warn "Unable to connect to database '$DB_NAME' — skipping schema init."
  fi

  if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL="postgres:///$DB_NAME"
    info "DATABASE_URL not set — defaulting to $DATABASE_URL"
  else
    info "DATABASE_URL already set — leaving as-is."
  fi
else
  warn "Postgres not available — DB-backed features (API keys, plans, usage) will be disabled unless DATABASE_URL is set."
fi

# ── Ollama ───────────────────────────────────────────────────────────────

if command -v ollama >/dev/null 2>&1; then
  if pgrep -x ollama >/dev/null 2>&1; then
    info "ollama already running — leaving as-is."
  else
    info "Starting ollama serve in background..."
    nohup ollama serve >/dev/null 2>&1 &
    sleep 2
  fi
else
  warn "ollama not found on PATH. Install from https://ollama.com/ and pull models (e.g. 'ollama pull phi3:mini')."
fi

# ── Start backend and frontend ───────────────────────────────────────────

info "Starting FastAPI backend (uvicorn)..."
(
  cd "$BACKEND_DIR"
  source "$VENV_DIR/bin/activate"
  PYTHONWARNINGS=ignore uvicorn main:app --host 0.0.0.0 --port 8000 --reload
) &
BACKEND_PID=$!

info "Starting React frontend (npm run dev)..."
(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!

info "All services started."
info "Backend:  http://localhost:8000"
info "Frontend: http://localhost:5173"

echo ""
echo "Press Ctrl+C to stop backend and frontend (this will not stop ollama if it was already running)."

wait $BACKEND_PID $FRONTEND_PID || true
