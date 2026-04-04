# Multi Agent Orchestration

A local-first, multi-agent AI orchestration platform. Run powerful AI agent pipelines on your laptop with Ollama, or deploy to the cloud with full multi-user support, Google OAuth login, and email-based authorisation.

---

## Quick Start

```bash
git clone https://github.com/Sathya-02/multi-agent-orchestration.git
cd multi-agent-orchestration
chmod +x setup.sh
./setup.sh local
```

| Service  | URL                         |
|----------|---------------------------------|
| Backend  | http://localhost:8000           |
| Frontend | http://localhost:5173           |
| API docs | http://localhost:8000/docs      |

Press **Ctrl+C** to stop everything cleanly.

---

## Setup Script

```
./setup.sh [ENVIRONMENT] [STEP...]
```

### Environments

| Argument     | Description                                                     | API Key     | Server      | Frontend        | Ollama      |
|--------------|-----------------------------------------------------------------|-------------|-------------|-----------------|-------------|
| `local`      | Hot-reload, Ollama auto-started, no API key needed *(default)*  | not required| uvicorn --reload | Vite dev server | auto-started |
| `dev`        | Mirrors staging — DEBUG logging, API key optional               | not required| uvicorn --reload | Vite dev server | auto-started |
| `production` | Gunicorn, API key enforced, static frontend build               | **required**| gunicorn    | `npm run build` only | skipped |

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
# ── Environment only ────────────────────────────────────────────────────
./setup.sh                          # local + all steps (default)
./setup.sh local                    # same as above
./setup.sh dev                      # dev environment, all steps
./setup.sh production               # production build + start

# ── Specific steps ───────────────────────────────────────────────────────
./setup.sh local check              # verify tools only
./setup.sh local venv               # create virtualenv only
./setup.sh local venv db            # setup only — don't start servers
./setup.sh dev backend              # restart backend without touching deps
./setup.sh production db            # re-apply schema to production DB
./setup.sh production npm           # rebuild frontend static bundle
./setup.sh local npm                # reinstall / refresh npm deps
./setup.sh production backend       # restart production backend only
```

---

## Environment Files

| File                      | Loaded by               | Committed? | Purpose                          |
|---------------------------|-------------------------|------------|----------------------------------|
| `.env.local`              | `./setup.sh local`      | ✅ yes      | Safe local defaults              |
| `.env.dev`                | `./setup.sh dev`        | ❌ no       | Dev/staging values               |
| `.env.production`         | `./setup.sh production` | ❌ no       | Production secrets               |
| `.env.production.example` | Reference               | ✅ yes      | Template for production          |
| `.env.cloud.example`      | Reference               | ✅ yes      | Cloud deployment template        |

Explicit shell environment variables always override values from the loaded file.

### Local defaults (`.env.local` — already in the repo)

```env
# No secrets — safe to commit
MAO_DB_NAME=mao_local
REQUIRE_API_KEY=false
OLLAMA_MODEL=phi3:mini
SESSION_SECRET=local-dev-secret-change-in-prod

# Google OAuth — leave empty to disable (default)
# GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback/google
OAUTH_SUCCESS_REDIRECT=http://localhost:5173
```

### Production quickstart (`.env.production`)

```env
MAO_DB_NAME=mao_production
REQUIRE_API_KEY=true
MASTER_API_KEY=<strong-secret>

GOOGLE_CLIENT_ID=<prod-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<prod-secret>
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/callback/google
OAUTH_SUCCESS_REDIRECT=https://yourdomain.com

SESSION_SECRET=<32-byte-random-hex>   # python -c "import secrets; print(secrets.token_hex(32))"

ALLOWED_EMAIL_DOMAINS=yourcompany.com
ADMIN_EMAILS=admin@yourcompany.com

GUNICORN_WORKERS=4
ALLOWED_ORIGINS=https://yourdomain.com
```

---

## Authentication & Authorisation

Two auth modes coexist — API keys for programmatic clients, Google OAuth for browser users.

### 1 — API key (programmatic)

- Set `REQUIRE_API_KEY=true` and `MASTER_API_KEY=<secret>` in production.
- Pass the key as `Authorization: Bearer <key>` or `?key=<key>`.
- Disabled by default for `local` and `dev` (`REQUIRE_API_KEY=false`).

### 2 — Google OAuth (browser login)

- Enabled by setting `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- When those vars are **empty** (local default), the login button is hidden and the API stubs `/auth/me` as a local admin — no friction during development.
- When configured, the flow is:
  1. User clicks **Sign in with Google**
  2. Browser → `GET /auth/login/google` → Google consent screen
  3. Google redirects → `GET /auth/callback/google?code=…`
  4. Backend verifies the ID token, finds-or-creates a `users` row
  5. HTTP-only session cookie (`mao_session`) set → browser redirected to frontend

### Email-based authorisation

Configure via environment variables — no code changes needed:

| Variable               | Effect                                                            |
|------------------------|-------------------------------------------------------------------|
| `ALLOWED_EMAIL_DOMAINS`| Only these domains can log in (empty = any Google account)       |
| `ALLOWED_EMAILS`       | Explicit per-address override (always allowed, ignores domain)   |
| `ADMIN_EMAILS`         | These users get `plan=enterprise` and `is_admin=true`            |

**Domain → plan mapping (default policy):**

| Condition                         | `plan`       | `is_admin` |
|-----------------------------------|--------------|------------|
| Email in `ADMIN_EMAILS`           | `enterprise` | true       |
| Any other allowed email/domain    | `free`       | false      |
| Disallowed domain                 | 403 Forbidden| —          |

### Auth endpoints

| Method | Path                    | Description                                |
|--------|-------------------------|-----------------------------------------|
| GET    | `/auth/login/google`    | Redirect browser to Google consent screen |
| GET    | `/auth/callback/google` | OAuth callback — sets session cookie      |
| GET    | `/auth/me`              | Returns current user as JSON              |
| POST   | `/auth/logout`          | Clears the session cookie                 |

---

## Prerequisites

| Tool       | Version | Install                        |
|------------|---------|--------------------------------|
| Python     | 3.11+   | https://python.org             |
| Node.js    | 18+     | https://nodejs.org             |
| PostgreSQL | 14+     | https://postgresql.org         |
| Ollama     | latest  | https://ollama.com             |

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
│   ├── main.py              # FastAPI app entry point + all HTTP routes
│   ├── settings.py          # All configuration (single source of truth)
│   ├── requirements.txt
│   ├── agents/              # Agent definitions and registry
│   ├── tools/               # Tool definitions and registry
│   ├── infra/
│   │   ├── auth.py          # API-key authentication dependency
│   │   ├── oauth.py         # Google OAuth + session JWT helpers
│   │   └── db/
│   │       └── init.sql     # Postgres schema (idempotent)
│   └── data/                # Runtime JSON state (gitignored)
├── frontend/
│   └── src/
│       └── App.jsx          # Single-page React app
├── setup.sh                 # Environment-aware setup & launch script
├── .env.local               # Local defaults (safe to commit)
├── .env.production.example  # Production template
├── .env.cloud.example       # Cloud deployment template
└── docker-compose.yml       # Docker local alternative
```

---

## Docker (alternative to setup.sh)

```bash
# Local
docker compose up

# Cloud / production
docker compose -f docker-compose.cloud.yml up -d
```

---

## Troubleshooting

**psql: connection refused** — ensure PostgreSQL is running:
```bash
brew services start postgresql   # macOS
sudo systemctl start postgresql  # Linux
```

**ollama: model not found** — pull the model first:
```bash
ollama pull phi3:mini
```

**Port already in use** — override before calling setup.sh:
```bash
BACKEND_PORT=8001 ./setup.sh local
```

**OAuth redirect mismatch** — the Authorised redirect URI in your Google Cloud Console must match `GOOGLE_REDIRECT_URI` exactly (protocol, host, port, and path).

**403 after login** — your email domain is not in `ALLOWED_EMAIL_DOMAINS`. Add it to `.env.production` and restart the backend.

**Login button not showing locally** — `GOOGLE_CLIENT_ID` is empty. This is intentional for local development. Set it in `.env.local` (or `.env.dev`) to enable OAuth locally.
