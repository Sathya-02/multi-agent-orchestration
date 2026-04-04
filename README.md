# Multi Agent Orchestration

> A fully local, offline multi-agent AI system with a real-time 3D executive boardroom, live web search, RAG knowledge base, Telegram bot, and autonomous self-improvement — no cloud API keys required.

**Stack:** CrewAI · Ollama · FastAPI · WebSockets · React 18 · Three.js · Vite · PostgreSQL (optional, for auth)

---

## Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11 | `brew install python@3.11` |
| Node.js | 20 LTS | `brew install node@20` |
| Ollama | latest | [ollama.com/download](https://ollama.com/download) |

---

## Environment-Specific Setup (`setup.sh`)

A single script handles all three environments. Run with one argument:

```bash
./setup.sh              # defaults to local
./setup.sh local        # local dev — Ollama auto-started, hot-reload, no API key needed
./setup.sh dev          # dev/staging — reads .env.dev, hot-reload
./setup.sh production   # production — gunicorn, npm build, REQUIRE_API_KEY=true
```

### Per-Step Control

Run only specific steps by passing step names after the environment:

```bash
./setup.sh local check           # verify tools only
./setup.sh local venv db         # install deps + init DB (no servers)
./setup.sh dev backend           # restart backend only
./setup.sh production npm        # rebuild frontend static bundle
./setup.sh production db         # re-apply schema to production DB
```

| Step | What it does |
|------|--------------|
| `check` | Verify Python, Node, Ollama are installed |
| `venv` | Create/reuse Python venv, install requirements |
| `db` | Create database and apply schema |
| `npm` | Install frontend deps / build static bundle |
| `ollama` | Pull default models, start Ollama server |
| `backend` | Start FastAPI server |
| `frontend` | Start Vite dev server (local/dev) or build (production) |

### Environment Differences

| | `local` | `dev` | `production` |
|--|---------|-------|--------------|
| Server | uvicorn `--reload` | uvicorn `--reload` | gunicorn + UvicornWorker |
| `REQUIRE_API_KEY` | false | false | true |
| Frontend | Vite dev server | Vite dev server | `npm run build` |
| Ollama | auto-started | auto-started | skipped |
| DB name | `mao_local` | `mao_dev` | `mao_production` |
| Env file | `.env.local` | `.env.dev` | `.env.production` |

---

## Authentication & Authorisation (Google OAuth)

Google OAuth login is built-in. Users sign in with their Gmail or Google Workspace account. Access is controlled by email domain and explicit allowlists.

### Setup

1. **Create OAuth credentials** at [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Application type: **Web application**
   - Authorised redirect URI: `http://localhost:8000/auth/callback/google` (local) or your production URL

2. **Add to your `.env` / `.env.local`:**

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback/google

# Email-based authorisation
# Leave ALLOWED_EMAIL_DOMAINS empty to allow ANY Google account
ALLOWED_EMAIL_DOMAINS=gmail.com,yourcompany.com
ALLOWED_EMAILS=extra@otherdomain.com
ADMIN_EMAILS=you@yourcompany.com

# Session JWT
SESSION_SECRET=replace-with-a-32-byte-random-secret
SESSION_COOKIE_NAME=mao_session
SESSION_TTL_HOURS=8
```

3. **Install auth deps:**
   ```bash
   pip install -r backend/requirements.txt
   # PyJWT and psycopg2-binary are now included automatically
   ```

### Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/login/google` | Redirect to Google consent screen |
| `GET` | `/auth/callback/google` | Handle OAuth callback, set session cookie |
| `GET` | `/auth/me` | Return current logged-in user (from cookie) |
| `POST` | `/auth/logout` | Clear session cookie |

### Authorisation Policy

| `ALLOWED_EMAIL_DOMAINS` | Effect |
|------------------------|--------|
| *(empty)* | Any valid Google account can log in |
| `gmail.com` | Only Gmail accounts |
| `gmail.com,mycompany.com` | Gmail + your company Google Workspace |
| `mycompany.com` | Company accounts only — no public Gmail |

- Users in `ADMIN_EMAILS` get `plan=enterprise` and `is_admin=True`.
- All others get `plan=free` (upgradeable manually in Postgres).
- API key auth continues to work for programmatic access alongside session auth.

---

## Environment Files

```bash
# Local development
cp .env.example .env.local

# Dev/staging
cp .env.example .env.dev

# Production (cloud)
cp .env.cloud.example .env.production
```

See `.env.example` and `.env.cloud.example` for all available variables.

---

## Running the App (manual, 3 terminals)

```bash
# Terminal 1 — Ollama
ollama serve

# Terminal 2 — Backend
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3 — Frontend
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Project Structure

```
multi-agent-orchestration/
├── setup.sh                   # Environment-specific setup & run script
├── Makefile                   # Convenience targets
├── .env.example               # Local env template
├── .env.cloud.example         # Production env template
├── docker-compose.yml         # Local Docker stack
├── docker-compose.cloud.yml   # Cloud Docker stack
├── backend/
│   ├── main.py                # FastAPI app — all endpoints + auth routes
│   ├── settings.py            # Config from env vars
│   ├── requirements.txt       # Python deps (incl. PyJWT, psycopg2-binary)
│   ├── infra/
│   │   ├── auth.py            # API-key auth + unified require_user_or_key()
│   │   ├── oauth.py           # Google OAuth2, session JWT, email allowlist
│   │   ├── billing.py         # Stripe billing (optional)
│   │   └── db/                # Postgres schema (init.sql)
│   ├── agents_crew.py
│   ├── tasks_crew.py
│   ├── tools.py
│   ├── rag_engine.py
│   ├── web_search_tool.py
│   ├── telegram_bot.py
│   └── self_improver.py
└── frontend/
    └── src/
        └── App.jsx            # React SPA — login gate, auth state, user header
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ModuleNotFoundError: pyjwt` | `pip install PyJWT` |
| `ModuleNotFoundError: psycopg2` | `pip install psycopg2-binary` |
| Google login returns 403 | Check `ALLOWED_EMAIL_DOMAINS` in `.env` |
| `GOOGLE_CLIENT_ID not set` | Add credentials to `.env.local` |
| `Invalid session` on /auth/me | `SESSION_SECRET` changed — users must log in again |
| `pip not found` | `source backend/venv/bin/activate` first |
| RAM pressure on M1 8GB | Switch to `llama3.2:3b` via model badge in header |
