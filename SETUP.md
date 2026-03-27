# 🚀 Multi Agent Orchestration — Setup Guide

Version 7.0.0 · Quick reference for getting the project running.
See README.md for the full feature documentation.

---

## Option A — Local Setup (no Docker)

### Prerequisites

```bash
# Homebrew (macOS)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Python 3.11
brew install python@3.11
echo 'export PATH="/opt/homebrew/opt/python@3.11/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile

# Node.js 20
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile

# Ollama — download from https://ollama.com/download/mac
# Drag to Applications and launch once, then:
ollama pull phi3:mini          # default model (~2.3 GB)
ollama pull llama3.2:3b        # recommended for better quality
ollama pull nomic-embed-text   # for RAG/Knowledge Base (274 MB)
```

### Backend setup

```bash
cd multi-agent-3d/backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
pip install pypdf python-docx openpyxl psutil requests

# Optional — real web search + stock prices
pip install duckduckgo-search yfinance

# Optional — Telegram bot
pip install "python-telegram-bot==20.7"

# Fix CrewAI Python 3.11 compatibility (one-time)
sed -i '' 's/import pkg_resources/import importlib.metadata as pkg_resources/' \
  venv/lib/python3.11/site-packages/crewai/telemetry/telemetry.py

# Verify
python3.11 -c "import main; print('✅ Backend OK')"
```

### Frontend setup

```bash
cd multi-agent-3d/frontend
npm install
```

### Run

Open **3 terminal tabs**:

```bash
# Tab 1 — Ollama
ollama serve

# Tab 2 — Backend
cd multi-agent-3d/backend
source venv/bin/activate
PYTHONWARNINGS=ignore uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Tab 3 — Frontend
cd multi-agent-3d/frontend
npm run dev
```

Open **http://localhost:5173**

Or use the shortcut: `make dev` (from the project root)

---

## Option B — Docker (local, recommended)

### Prerequisites

- Docker Desktop installed and running
- Ollama installed on your Mac (for Apple Silicon GPU)

### Quick start

```bash
cd multi-agent-3d

# Copy env template
cp .env.example .env

# Build and start (first run takes 3–5 min to download images)
docker compose up -d --build

# Pull your LLM model
docker compose exec ollama ollama pull phi3:mini
docker compose exec ollama ollama pull nomic-embed-text

# Check logs
docker compose logs -f backend
```

Open **http://localhost:3000**

> **Mac note:** Ollama inside Docker cannot access Apple Silicon GPU.
> For M1/M2/M3, run Ollama natively and set `OLLAMA_URL=http://host.docker.internal:11434` in `.env`.

### Stop

```bash
docker compose down
```

---

## Option C — Cloud Deployment

### Prerequisites

- A VPS or cloud server (Ubuntu 22.04+)
- Docker + Docker Compose installed on the server
- A domain name pointing to the server IP
- Ports 80 and 443 open

### Deploy steps

```bash
# 1. Copy project to server
scp -r multi-agent-3d user@your-server:/app/multi-agent-3d

# 2. SSH into server
ssh user@your-server
cd /app/multi-agent-3d

# 3. Create cloud env file
cp .env.cloud.example .env.cloud
nano .env.cloud        # Fill in ALL values (domain, secrets, passwords)

# 4. Start cloud stack
docker compose -f docker-compose.yml -f docker-compose.cloud.yml \
  --env-file .env.cloud up -d --build

# 5. Pull models on server
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull nomic-embed-text

# 6. Verify
curl https://yourdomain.com/        # should return JSON health check
```

### Scale workers

```bash
docker compose -f docker-compose.yml -f docker-compose.cloud.yml \
  --env-file .env.cloud up -d --scale worker=3
```

---

## Configuration Quick Reference

All configuration is in `backend/settings.py`. The key things to change:

| What to change | Where |
|----------------|-------|
| Default LLM model | `settings.py` → `OLLAMA_MODEL` |
| Add a new model preset | `settings.py` → `MODEL_PRESETS` dict |
| Disable web search | `settings.py` → `SEARCH_ENABLED = False` |
| Disable RAG | `settings.py` → `RAG_ENABLED = False` |
| Enable Telegram | `settings.py` → `TELEGRAM_ENABLED = True` |
| Change agent goals | `backend/agents/definitions.py` |
| Change tool descriptions | `backend/tools/definitions.py` |
| Add CORS origin | `settings.py` → `ALLOWED_ORIGINS` |
| Enable API key auth | `settings.py` → `REQUIRE_API_KEY = True` |

---

## First Run Checklist

- [ ] Ollama is running (`ollama serve` or Docker)
- [ ] At least one model is pulled (`ollama pull phi3:mini`)
- [ ] Backend starts without errors (`python3.11 -c "import main"`)
- [ ] Frontend loads at http://localhost:5173
- [ ] Click **▶ Launch Agents** with topic "test" — should see activity
- [ ] Enable Web Search in ⚙️ Settings → 🌐 Web Search
- [ ] Test: query "what day is today"
- [ ] Upload a document to 📚 Knowledge Base and test search

---

## Troubleshooting

**`pip` not found:** `source venv/bin/activate` first

**`pkg_resources` error:** Run the `sed` patch command above

**Ollama connection refused:** Make sure `ollama serve` is running in a separate terminal

**Port 8000 in use:** `lsof -ti:8000 | xargs kill -9`

**Port 5173 in use:** `lsof -ti:5173 | xargs kill -9`

**Models not loading in Docker on Mac:** Run Ollama on host, set `OLLAMA_URL=http://host.docker.internal:11434`

See **README.md** for the full troubleshooting guide.
