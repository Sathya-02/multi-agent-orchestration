# Multi Agent Orchestration

A local-first, multi-agent AI orchestration platform. Run powerful AI agent pipelines on your laptop with Ollama, or deploy to the cloud with full multi-user support.

---

## Quick Start (local)

```bash
git clone https://github.com/Sathya-02/multi-agent-orchestration.git
cd multi-agent-orchestration
chmod +x setup.sh
./setup.sh local
```

| Service  | URL                         |
|----------|-----------------------------|
| Backend  | http://localhost:8000       |
| Frontend | http://localhost:5173       |
| API docs | http://localhost:8000/docs  |

Press **Ctrl+C** to stop everything cleanly.

---

## Setup Script

```
./setup.sh [ENVIRONMENT] [STEP...]
```

### Environments

| Argument      | Description                                                   |
|---------------|---------------------------------------------------------------|
| `local`       | Hot-reload, Ollama, no API key needed *(default)*             |
| `dev`         | Mirrors staging — `REQUIRE_API_KEY=false`, DEBUG logging      |
| `production`  | Gunicorn, `REQUIRE_API_KEY=true`, static frontend build       |

### Steps

| Step       | What it does                                              |
|------------|-----------------------------------------------------------|
| `check`    | Verify python3.11 / node / npm / psql / ollama on PATH    |
| `venv`     | Create `backend/venv` and install Python deps             |
| `npm`      | `npm install` (+ `npm run build` in production)           |
| `db`       | Create Postgres DB and apply `infra/db/init.sql`          |
| `ollama`   | Start `ollama serve` in the background (local/dev only)   |
| `backend`  | Start uvicorn / gunicorn                                  |
| `frontend` | Start Vite dev server (local/dev only)                    |
| `all`      | Run all steps above in order *(default)*                  |

### Examples

```bash
./setup.sh                          # local + all steps
./setup.sh local                    # same as above
./setup.sh dev                      # dev environment, all steps
./setup.sh production               # production build + start

./setup.sh local check              # check tools only
./setup.sh local venv db            # setup only — don't start servers
./setup.sh dev backend              # restart backend (dev)
./setup.sh production db            # re-apply schema to production DB
./setup.sh production npm           # rebuild frontend static bundle
./setup.sh local npm                # reinstall / refresh npm deps
```

---

## Environment Files

| File                | Loaded by              | Purpose                          |
|---------------------|------------------------|----------------------------------|
| `.env.local`        | `./setup.sh local`     | Safe local defaults, committed   |
| `.env.dev`          | `./setup.sh dev`       | Dev/staging values, not committed|
| `.env.production`   | `./setup.sh production`| Production secrets, never commit |
| `.env.example`      | Reference              | Template for new env files       |
| `.env.cloud.example`| Reference              | Cloud deployment template        |

Explicit shell env vars always take priority over the loaded file.

### Key local variables (`.env.local`)

```env
# Database — setup.sh creates mao_local automatically
MAO_DB_NAME=mao_local

# Auth — no API key required locally
REQUIRE_API_KEY=false
MASTER_API_KEY=

# Google OAuth — leave empty to disable (safe default)
# GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback/google

# Session JWT
SESSION_SECRET=local-dev-secret-change-in-prod
OAUTH_SUCCESS_REDIRECT=http://localhost:5173

# LLM
OLLAMA_MODEL=phi3:mini
OLLAMA_URL=http://localhost:11434
```

---

## Authentication & Authorisation

The platform supports two auth modes that coexist:

### 1. API key (programmatic / existing)
- Set `REQUIRE_API_KEY=true` and `MASTER_API_KEY=<secret>` in production.
- Pass the key as `Authorization: Bearer <key>` or `?key=<key>`.
- Disabled by default for local (`REQUIRE_API_KEY=false`).

### 2. Google OAuth (browser login)
- Enabled by setting `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Login flow: browser → `/auth/login/google` → Google consent → `/auth/callback/google` → session cookie set → redirect to frontend.
- Session stored as an HTTP-only JWT cookie (`mao_session`).

### Email-based authorisation

| Variable               | Effect                                                       |
|------------------------|--------------------------------------------------------------|
| `ALLOWED_EMAIL_DOMAINS`| Only these domains can log in (empty = any Google account)  |
| `ALLOWED_EMAILS`       | Explicit allowlist (always allowed, regardless of domain)   |
| `ADMIN_EMAILS`         | These users get `plan=enterprise` and `is_admin=true`        |

### Auth endpoints

| Method | Path                        | Description                    |
|--------|-----------------------------|--------------------------------|
| GET    | `/auth/login/google`        | Redirect to Google consent     |
| GET    | `/auth/callback/google`     | OAuth callback, sets cookie    |
| GET    | `/auth/me`                  | Returns current user (JSON)    |
| POST   | `/auth/logout`              | Clears session cookie          |

---

## Prerequisites

| Tool        | Version   | Install                             |
|-------------|-----------|-------------------------------------|
| Python      | 3.11+     | https://python.org                  |
| Node.js     | 18+       | https://nodejs.org                  |
| PostgreSQL  | 14+       | https://postgresql.org              |
| Ollama      | latest    | https://ollama.com                  |

```bash
# Pull required models
ollama pull phi3:mini
ollama pull nomic-embed-text
```

---

## Project Structure

```
multi-agent-orchestration/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── settings.py          # All configuration (single source of truth)
│   ├── requirements.txt
│   ├── agents/              # Agent definitions
│   ├── tools/               # Tool definitions
│   ├── infra/
│   │   ├── auth.py          # API key authentication
│   │   ├── oauth.py         # Google OAuth + session JWT
│   │   └── db/
│   │       └── init.sql     # Schema (idempotent)
│   └── data/                # Runtime JSON state
├── frontend/
│   └── src/
│       └── App.jsx          # Single-page React app
├── setup.sh                 # Environment-aware setup & launch script
├── .env.local               # Local defaults (safe to commit)
├── .env.example             # Template for other environments
└── docker-compose.yml       # Docker local alternative
```

---

## Docker (alternative)

```bash
# Local
docker compose up

# Cloud / production
docker compose -f docker-compose.cloud.yml up -d
```

---

## Troubleshooting

**psql: connection refused** — ensure PostgreSQL is running: `brew services start postgresql` (macOS) or `sudo systemctl start postgresql` (Linux).

**ollama: model not found** — run `ollama pull phi3:mini` before starting.

**Port already in use** — set `BACKEND_PORT=8001` or `FRONTEND_PORT=5174` before calling `setup.sh`.

**OAuth redirect mismatch** — make sure the Authorised redirect URI in your Google Cloud Console matches `GOOGLE_REDIRECT_URI` exactly, including the protocol and port.
