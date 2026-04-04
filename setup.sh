#!/usr/bin/env bash
# =============================================================================
# setup.sh — Multi Agent Orchestration — Single-click setup & launcher
# =============================================================================
#
# USAGE
# -----
#   ./setup.sh [ENVIRONMENT] [STEP...]
#
# ENVIRONMENTS
#   local       Local development — no HTTPS, hot-reload, Ollama included
#   dev         Development — mirrors staging, REQUIRE_API_KEY=false, DEBUG on
#   production  Production — REQUIRE_API_KEY=true, no hot-reload, gunicorn
#
#   Defaults to: local
#
# STEPS (run in order if none given; combine freely)
#   check       Verify required system tools are installed
#   venv        Create Python virtualenv + install backend deps
#   npm         Install frontend npm deps
#   db          Create Postgres database + apply schema
#   ollama      Start ollama serve (local/dev only)
#   backend     Start FastAPI backend
#   frontend    Start React frontend (local/dev only)
#   all         Run all steps above in order (default)
#
# EXAMPLES
#   ./setup.sh                        # local + all steps
#   ./setup.sh local                  # local + all steps
#   ./setup.sh dev                    # dev   + all steps
#   ./setup.sh production             # production + all steps
#   ./setup.sh local venv db          # only setup venv and DB, then stop
#   ./setup.sh dev backend            # just (re)start the dev backend
#   ./setup.sh production db          # apply schema to production DB
#   ./setup.sh local check            # verify tools only
#
# ENVIRONMENT VARIABLES (override env-file values)
#   MAO_DB_NAME     Postgres database name       (default: mao_<env>)
#   DATABASE_URL    Full Postgres connection URL  (overrides MAO_DB_NAME)
#   OLLAMA_HOST     Ollama bind address           (default: 127.0.0.1:11434)
#   BACKEND_PORT    uvicorn/gunicorn port         (default: 8000)
#   FRONTEND_PORT   Vite dev server port          (default: 5173)
#
# ENV FILES (.env.<environment> in project root)
#   .env.local      Loaded for 'local'
#   .env.dev        Loaded for 'dev'
#   .env.production Loaded for 'production'
#
#   If a matching file exists, its variables are exported before anything else
#   runs (the explicit environment variables above always take priority).
# =============================================================================

set -euo pipefail

# ── Helpers ────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

C_RESET="\033[0m"
C_BOLD="\033[1m"
C_GREEN="\033[32m"
C_YELLOW="\033[33m"
C_RED="\033[31m"
C_CYAN="\033[36m"
C_DIM="\033[2m"

info()    { echo -e "${C_GREEN}[INFO]${C_RESET}  $*"; }
warn()    { echo -e "${C_YELLOW}[WARN]${C_RESET}  $*"; }
error()   { echo -e "${C_RED}[ERROR]${C_RESET} $*"; }
section() { echo -e "\n${C_BOLD}${C_CYAN}── $* ──${C_RESET}"; }
dim()     { echo -e "${C_DIM}        $*${C_RESET}"; }

# ── Argument parsing ─────────────────────────────────────────────────────

VALID_ENVS="local dev production"
VALID_STEPS="check venv npm db ollama backend frontend all"

ENV=""
STEPS=()

for arg in "$@"; do
  if echo "$VALID_ENVS" | grep -qw "$arg"; then
    ENV="$arg"
  elif echo "$VALID_STEPS" | grep -qw "$arg"; then
    STEPS+=("$arg")
  else
    error "Unknown argument: '$arg'"
    echo ""
    echo "  Usage: ./setup.sh [local|dev|production] [check|venv|npm|db|ollama|backend|frontend|all]"
    exit 1
  fi
done

ENV="${ENV:-local}"
if [ ${#STEPS[@]} -eq 0 ]; then
  STEPS=("all")
fi

# Expand 'all' to ordered list
if printf '%s\n' "${STEPS[@]}" | grep -q "^all$"; then
  STEPS=("check" "venv" "npm" "db" "ollama" "backend" "frontend")
fi

# ── Load env file ─────────────────────────────────────────────────────────

ENV_FILE="$ROOT_DIR/.env.$ENV"
if [ -f "$ENV_FILE" ]; then
  info "Loading environment from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  warn ".env.$ENV not found — using system env vars and defaults."
fi

# ── Per-environment defaults ────────────────────────────────────────────────

case "$ENV" in
  local)
    MAO_DB_NAME="${MAO_DB_NAME:-mao_local}"
    BACKEND_PORT="${BACKEND_PORT:-8000}"
    FRONTEND_PORT="${FRONTEND_PORT:-5173}"
    REQUIRE_API_KEY="${REQUIRE_API_KEY:-false}"
    UVICORN_RELOAD="--reload"
    USE_GUNICORN=0
    RUN_FRONTEND=1
    RUN_OLLAMA=1
    ;;
  dev)
    MAO_DB_NAME="${MAO_DB_NAME:-mao_dev}"
    BACKEND_PORT="${BACKEND_PORT:-8000}"
    FRONTEND_PORT="${FRONTEND_PORT:-5173}"
    REQUIRE_API_KEY="${REQUIRE_API_KEY:-false}"
    UVICORN_RELOAD="--reload"
    USE_GUNICORN=0
    RUN_FRONTEND=1
    RUN_OLLAMA=1
    ;;
  production)
    MAO_DB_NAME="${MAO_DB_NAME:-mao_production}"
    BACKEND_PORT="${BACKEND_PORT:-8000}"
    FRONTEND_PORT="${FRONTEND_PORT:-5173}"
    REQUIRE_API_KEY="${REQUIRE_API_KEY:-true}"
    UVICORN_RELOAD=""
    USE_GUNICORN=1
    RUN_FRONTEND=0
    RUN_OLLAMA=0
    ;;
esac

VENV_DIR="$BACKEND_DIR/venv"

# ── Banner ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${C_BOLD}  ⧡ Multi Agent Orchestration — Setup${C_RESET}"
echo -e "  Environment : ${C_CYAN}${ENV}${C_RESET}"
echo -e "  Steps       : ${C_CYAN}${STEPS[*]}${C_RESET}"
echo -e "  DB name     : ${C_CYAN}${MAO_DB_NAME}${C_RESET}"
echo ""

# =============================================================================
# STEP: check
# =============================================================================

run_check() {
  section "Checking required tools"

  local missing=0

  need_cmd() {
    if command -v "$1" >/dev/null 2>&1; then
      info "  ✓ $1 $(command -v "$1")"
    else
      error "  ✗ '$1' not found on PATH."
      missing=1
    fi
  }

  need_cmd python3.11
  need_cmd node
  need_cmd npm

  if command -v psql >/dev/null 2>&1; then
    info "  ✓ psql $(psql --version | head -1)"
    HAS_PSQL=1
  else
    warn "  ⚠ psql not found — DB step will be skipped."
    HAS_PSQL=0
  fi

  if command -v ollama >/dev/null 2>&1; then
    info "  ✓ ollama $(ollama --version 2>/dev/null | head -1 || echo '(version unknown)')"
    HAS_OLLAMA=1
  else
    warn "  ⚠ ollama not found — skipping Ollama step."
    HAS_OLLAMA=0
  fi

  if command -v gunicorn >/dev/null 2>&1; then
    info "  ✓ gunicorn found"
  elif [ "$USE_GUNICORN" = "1" ]; then
    warn "  ⚠ gunicorn not found (production mode). Will fall back to uvicorn."
    USE_GUNICORN=0
  fi

  if [ "$missing" = "1" ]; then
    error "One or more required tools are missing. Please install them and retry."
    exit 1
  fi
}

# =============================================================================
# STEP: venv
# =============================================================================

run_venv() {
  section "Python virtualenv + backend deps"

  if [ ! -d "$VENV_DIR" ]; then
    info "Creating Python 3.11 virtualenv at backend/venv..."
    python3.11 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip setuptools wheel
    info "Installing backend/requirements.txt..."
    pip install -r "$BACKEND_DIR/requirements.txt"
    pip install requests psutil pypdf python-docx openpyxl pyjwt || true
    pip install duckduckgo-search yfinance || true
    pip install "python-telegram-bot==20.7" || true
    if [ "$USE_GUNICORN" = "1" ]; then
      pip install gunicorn || true
    fi
    info "Virtualenv ready."
  else
    info "Virtualenv exists at backend/venv — reusing."
    source "$VENV_DIR/bin/activate"
    pip install -r "$BACKEND_DIR/requirements.txt" --quiet || true
  fi
}

# =============================================================================
# STEP: npm
# =============================================================================

run_npm() {
  section "Frontend npm deps"

  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    info "Running npm install in frontend/..."
    (cd "$FRONTEND_DIR" && npm install)
  else
    info "frontend/node_modules present — skipping npm install."
  fi

  if [ "$ENV" = "production" ]; then
    info "Building production frontend bundle (npm run build)..."
    (cd "$FRONTEND_DIR" && npm run build)
    info "Frontend build complete → frontend/dist"
    warn "Serve frontend/dist via nginx/Caddy/static host in production."
  fi
}

# =============================================================================
# STEP: db
# =============================================================================

run_db() {
  section "Postgres database + schema"

  if [ "${HAS_PSQL:-0}" = "0" ]; then
    warn "psql not available — skipping DB setup."
    return
  fi

  if [ -n "${DATABASE_URL:-}" ]; then
    info "Using DATABASE_URL from environment."
    DB_CONNECT="$DATABASE_URL"
    DB_DISPLAY="$DATABASE_URL"
  else
    DB_CONNECT="$MAO_DB_NAME"
    DB_DISPLAY="$MAO_DB_NAME (local socket)"
    info "Ensuring database '$MAO_DB_NAME' exists..."

    if ! psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$MAO_DB_NAME'" 2>/dev/null | grep -q 1; then
      info "Creating database '$MAO_DB_NAME'..."
      psql postgres -c "CREATE DATABASE \"$MAO_DB_NAME\"" || {
        warn "Could not create DB automatically. Create it manually: createdb $MAO_DB_NAME"
      }
    else
      info "Database '$MAO_DB_NAME' already exists — skipping creation."
    fi

    export DATABASE_URL="postgres:///$MAO_DB_NAME"
    info "DATABASE_URL set to $DATABASE_URL"
  fi

  if psql "$DB_CONNECT" -c 'SELECT 1' >/dev/null 2>&1; then
    info "Applying backend/infra/db/init.sql (idempotent)..."
    psql "$DB_CONNECT" -f "$BACKEND_DIR/infra/db/init.sql" && info "Schema up to date." || warn "Schema apply had warnings — check output above."
  else
    warn "Could not connect to $DB_DISPLAY — skipping schema apply."
  fi
}

# =============================================================================
# STEP: ollama
# =============================================================================

run_ollama() {
  section "Ollama"

  if [ "$RUN_OLLAMA" = "0" ]; then
    dim "Skipped in $ENV environment."
    return
  fi

  if [ "${HAS_OLLAMA:-0}" = "0" ]; then
    warn "ollama not found. Install from https://ollama.com/ and pull models."
    warn "  e.g.  ollama pull phi3:mini && ollama pull nomic-embed-text"
    return
  fi

  if pgrep -x ollama >/dev/null 2>&1; then
    info "ollama is already running — leaving as-is."
  else
    info "Starting ollama serve in background..."
    OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
    OLLAMA_HOST="$OLLAMA_HOST" nohup ollama serve >/tmp/ollama.log 2>&1 &
    sleep 2
    info "ollama serve started (log: /tmp/ollama.log)"
  fi
}

# =============================================================================
# STEP: backend
# =============================================================================

run_backend() {
  section "FastAPI backend"

  source "$VENV_DIR/bin/activate"

  export REQUIRE_API_KEY="${REQUIRE_API_KEY:-false}"

  if [ "$USE_GUNICORN" = "1" ]; then
    info "Starting gunicorn (production)  →  http://0.0.0.0:${BACKEND_PORT}"
    (
      cd "$BACKEND_DIR"
      PYTHONWARNINGS=ignore \
      gunicorn main:app \
        --worker-class uvicorn.workers.UvicornWorker \
        --workers "${GUNICORN_WORKERS:-2}" \
        --bind "0.0.0.0:${BACKEND_PORT}" \
        --log-level info \
        --access-logfile -
    ) &
  else
    info "Starting uvicorn ($ENV)  →  http://0.0.0.0:${BACKEND_PORT}"
    (
      cd "$BACKEND_DIR"
      PYTHONWARNINGS=ignore \
      uvicorn main:app \
        --host 0.0.0.0 \
        --port "${BACKEND_PORT}" \
        ${UVICORN_RELOAD}
    ) &
  fi

  BACKEND_PID=$!
  info "Backend PID: $BACKEND_PID"
}

# =============================================================================
# STEP: frontend
# =============================================================================

run_frontend() {
  section "React frontend (dev server)"

  if [ "$RUN_FRONTEND" = "0" ]; then
    warn "Frontend dev server is disabled in '$ENV' environment."
    warn "Run './setup.sh $ENV npm' to rebuild the static bundle."
    return
  fi

  info "Starting Vite dev server  →  http://localhost:${FRONTEND_PORT}"
  (
    cd "$FRONTEND_DIR"
    VITE_PORT="${FRONTEND_PORT}" npm run dev -- --port "${FRONTEND_PORT}"
  ) &
  FRONTEND_PID=$!
  info "Frontend PID: $FRONTEND_PID"
}

# =============================================================================
# Run requested steps
# =============================================================================

HAS_PSQL=0; command -v psql >/dev/null 2>&1 && HAS_PSQL=1
HAS_OLLAMA=0; command -v ollama >/dev/null 2>&1 && HAS_OLLAMA=1

BACKEND_PID=""
FRONTEND_PID=""

for step in "${STEPS[@]}"; do
  case "$step" in
    check)    run_check   ;;
    venv)     run_venv    ;;
    npm)      run_npm     ;;
    db)       run_db      ;;
    ollama)   run_ollama  ;;
    backend)  run_backend ;;
    frontend) run_frontend ;;
  esac
done

# ── Wait / summary ───────────────────────────────────────────────────────────────────

if [ -n "$BACKEND_PID" ] || [ -n "$FRONTEND_PID" ]; then
  echo ""
  echo -e "${C_BOLD}  Services running (${ENV})${C_RESET}"
  [ -n "$BACKEND_PID"  ] && echo -e "  Backend  → ${C_CYAN}http://localhost:${BACKEND_PORT}${C_RESET}"
  [ -n "$FRONTEND_PID" ] && echo -e "  Frontend → ${C_CYAN}http://localhost:${FRONTEND_PORT}${C_RESET}"
  echo ""
  echo "  Press Ctrl+C to stop."
  echo ""

  trap 'echo ""; info "Stopping services..."; [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null; [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null; exit 0' INT TERM

  wait
else
  echo ""
  info "All requested steps complete."
fi
