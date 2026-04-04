# 🤖 Multi Agent Orchestration

> A fully local, offline multi-agent AI system with a real-time 3D executive boardroom, live web search with stock prices, RAG knowledge base, Telegram bot control, and autonomous self-improvement — no cloud API keys required.

**CrewAI · Ollama · FastAPI · WebSockets · React 18 · Three.js · Vite · python-telegram-bot**  
Optimized for **MacBook Air M1 8 GB** · Version **7.0.0**

---

## What This Is

Five built-in AI agents collaborate to research topics, answer questions with real-time data, analyse uploaded files, and read/write local files. Everything runs locally via Ollama. No internet connection required for the core pipeline — web search and Telegram are opt-in.

The system has three major additions over the base multi-agent pattern:

**🌐 Real-time Web Search** — agents automatically detect when a query needs live data (stock prices, weather, exchange rates, current date/time, news) and route to the appropriate provider — Yahoo Finance for stocks, wttr.in for weather, WorldTimeAPI for time, ExchangeRate-API for currency, DuckDuckGo for everything else. All providers require zero API keys.

**📚 RAG / Knowledge Base** — upload your own documents (PDF, DOCX, TXT, CSV, JSON, HTML) and agents will search them using vector similarity before answering. Uses Ollama's `nomic-embed-text` for semantic embeddings. Falls back to keyword search if embeddings are unavailable. Results are injected into agent context automatically.

**🔄 Autonomous Self-Improvement** — a background scheduler reads all agent and tool definitions, reviews recent job activity, and uses the LLM to rewrite `BEST_PRACTICES.md` and optionally update agent goals and tool descriptions — entirely hands-free.

---

## 🚀 Quick Start — One-Click Setup

All environments use the same `setup.sh` script at the project root.

```bash
chmod +x setup.sh          # one-time only
```

### Environments

| Command | Environment | Who it's for |
|---|---|---|
| `./setup.sh` | `local` (default) | Local development, Ollama, hot-reload |
| `./setup.sh local` | local | Same as above |
| `./setup.sh dev` | dev | Dev/staging server, mirrors production config |
| `./setup.sh production` | production | Gunicorn, API key required, static frontend build |

### Run Only Specific Steps

Individual steps can be combined freely:

| Step | What it does |
|---|---|
| `check` | Verify python3.11, node, npm, psql, ollama are installed |
| `venv` | Create Python virtualenv + install all backend deps |
| `npm` | Install frontend npm deps (production: also runs `npm run build`) |
| `db` | Create Postgres database + apply `backend/infra/db/init.sql` (idempotent) |
| `ollama` | Start `ollama serve` in background if not already running |
| `backend` | Start FastAPI (uvicorn in local/dev, gunicorn in production) |
| `frontend` | Start Vite dev server (skipped automatically in production) |

**Examples:**

```bash
# Full local setup + start everything
./setup.sh local

# Only check tools on a new machine
./setup.sh check

# Re-apply DB schema only (any env)
./setup.sh dev db
./setup.sh production db

# Rebuild frontend static bundle for production
./setup.sh production npm

# Just restart the backend after a code change (already setup)
./setup.sh dev backend

# Multiple steps in one command
./setup.sh local venv db
```

### Environment Files

Create a `.env.<environment>` file in the project root to override defaults. The script
loads it automatically before running any steps.

| File | Used by |
|---|---|
| `.env.local` | `./setup.sh local` |
| `.env.dev` | `./setup.sh dev` |
| `.env.production` | `./setup.sh production` |

**Minimal `.env.local` example:**
```env
DATABASE_URL=postgres:///mao_local
MASTER_API_KEY=local-dev-key
REQUIRE_API_KEY=false
OLLAMA_HOST=127.0.0.1:11434
```

**Minimal `.env.production` example:**
```env
DATABASE_URL=postgresql://user:pass@host:5432/mao_production
MASTER_API_KEY=change-this-to-a-real-secret
REQUIRE_API_KEY=true
SESSION_SECRET=32-bytes-of-random
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=https://agents.yourdomain.com/auth/callback/google
ALLOWED_EMAIL_DOMAINS=yourdomain.com
ADMIN_EMAILS=you@yourdomain.com
GUNICORN_WORKERS=4
BACKEND_PORT=8000
```

### Environment Override Variables

These can be set in your shell or `.env.*` file:

| Variable | Default | Description |
|---|---|---|
| `MAO_DB_NAME` | `mao_<env>` | Postgres database name |
| `DATABASE_URL` | derived | Full connection string (overrides `MAO_DB_NAME`) |
| `BACKEND_PORT` | `8000` | uvicorn / gunicorn listen port |
| `FRONTEND_PORT` | `5173` | Vite dev server port |
| `OLLAMA_HOST` | `127.0.0.1:11434` | Ollama bind address |
| `GUNICORN_WORKERS` | `2` | Number of gunicorn worker processes (production) |

---

## 👥 Users & Roles (Admin API)

When `REQUIRE_API_KEY=true` and a Postgres `DATABASE_URL` is configured, the backend
exposes admin endpoints to inspect and manage registered users.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/users` | List all users with `id`, `email`, `name`, `plan`, `role`, `active` |
| `PATCH` | `/admin/users/{user_id}` | Update `plan`, `role`, and/or `active` for a user |

Both endpoints require the master API key (`X-API-Key` header or `?key=`).

### Role values

| Role | Meaning |
|---|---|
| `admin` | Full access, can manage agents/tools/filesystem |
| `manager` | Run jobs + view results, no system config |
| `user` | Run jobs only (default for new Google logins) |
| `readonly` | View results only |

### Example

```bash
# List users
curl -H "X-API-Key: $MASTER_API_KEY" http://localhost:8000/admin/users

# Promote a user to admin
curl -X PATCH -H "X-API-Key: $MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin", "plan": "enterprise"}' \
  http://localhost:8000/admin/users/<user_id>
```

---

## 🔐 Authentication (Google OAuth)

Users can sign in via Google OAuth (`/auth/login/google`). After login, a session
cookie (`mao_session`) is issued. Access is controlled by email / domain allowlists
configured via environment variables.

| Variable | Example | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://agents.example.com/auth/callback/google` | Must match Google Console |
| `ALLOWED_EMAIL_DOMAINS` | `gmail.com,mycompany.com` | Comma-separated allowed domains |
| `ALLOWED_EMAILS` | `you@partner.com` | Additional explicit allowlist |
| `ADMIN_EMAILS` | `you@mycompany.com` | Automatically granted admin+enterprise |
| `SESSION_SECRET` | *(32 random bytes)* | JWT signing secret for session cookies |
