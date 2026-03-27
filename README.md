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

```
┌──────────────────────────────────────────────────────────────────────┐
│                          MacBook Air M1                               │
│                                                                       │
│  ┌──────────────┐      ┌─────────────────────────────────────────┐   │
│  │  Ollama LLM  │◄─────│          CrewAI Agent Runtime            │   │
│  │  (any model) │      │  Coordinator  Researcher  Analyst        │   │
│  │  port 11434  │      │  Writer       FS Agent    Custom Agents  │   │
│  └──────────────┘      └────────────────────┬────────────────────┘   │
│                                             │                         │
│  ┌──────────────┐      ┌────────────────────▼────────────────────┐   │
│  │  Web Search  │◄─────│          FastAPI  port 8000              │   │
│  │  DuckDuckGo  │      │  Agents · Tools · Jobs · RAG             │   │
│  │  Yahoo Fin.  │      │  Web Search · Telegram · Self-Improver   │   │
│  │  wttr.in     │      └──────┬────────────────────┬─────────────┘   │
│  │  WorldTime   │             │                    │                  │
│  └──────────────┘   ┌─────────▼──────┐  ┌─────────▼──────────────┐  │
│                     │ React+Three.js │  │  Telegram App (phone)  │  │
│  ┌──────────────┐   │ 3D Boardroom   │  │  /run /query /report   │  │
│  │  RAG Store   │   │ port 5173      │  └────────────────────────┘  │
│  │  rag_store   │   └────────────────┘                              │
│  │  .json       │                                                    │
│  └──────────────┘                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Features

### 3D Visualization
| Feature | Description |
|---------|-------------|
| **Executive Boardroom** | White-toned 3D office — polished floor, server racks, ceiling lights, holographic meeting table |
| **4 Unique Robot Avatars** | Silver humanoid (Coordinator), rust industrial (Researcher), teal armoured (Analyst), white/yellow friendly (Writer) |
| **Dynamic Custom Agent Desks** | New agents instantly get their own desk and one of 4 robot variant designs in the 3D scene |
| **Animated Communication Arcs** | Travelling dot pulses along arcs between agents, showing live data-flow direction |
| **Active Agent HUD** | Floating "NOW ACTIVE" panel with pulsing ring — always shows which agent is currently working |
| **Table Activity Panel** | Floating panel above the meeting table: seated agents, current phase, last message |
| **Walk-to-Communicate** | Agents walk to their seat at the meeting table during collaboration, return when done |

### Jobs & Output
| Feature | Description |
|---------|-------------|
| **Three Job Modes** | Research pipeline · Quick query · File analysis |
| **Real-time Activity Feed** | Phase banners + per-agent RESULT blocks (green badge, scrollable body) |
| **Smart Output Format** | Writer chooses the best format per content type — TXT (default), CSV, JSON, HTML, LOG, MD |
| **Format-Aware Metadata Footer** | Every report includes Confidence Score, Temperature, Top-K, Top-P, Repeat Penalty, Model, Agents |
| **Report Download** | Every job saved to `backend/reports/` with ⬇ Download button |
| **File Upload** | PDF, DOCX, TXT, CSV, XLSX, JSON — agents read and analyse them directly |

### Real-Time Web Search
| Feature | Description |
|---------|-------------|
| **Intent Auto-Detection** | Query is classified as stock/weather/time/currency/news/wiki/general before any network call |
| **Live Stock Prices** | Yahoo Finance API + optional `yfinance` library — Infosys, TCS, Apple, Nifty, S&P 500, and 30+ mapped tickers |
| **Live Weather** | wttr.in JSON API — current conditions + 3-day forecast for any city worldwide |
| **Current Date & Time** | WorldTimeAPI + system clock fast-path — never returns a placeholder |
| **Exchange Rates** | ExchangeRate-API — 150+ currencies, no API key |
| **News Search** | DuckDuckGo news endpoint — latest headlines on any topic |
| **General Web Search** | DuckDuckGo text search — `pip install duckduckgo-search` |
| **Wikipedia Lookup** | Wikipedia REST API — factual definitions, biographies |
| **Honest Mock Fallback** | When real search is disabled, returns an explicit message rather than plausible fake data |
| **Per-Provider Testing** | Settings panel shows live status for every provider independently |

### RAG / Knowledge Base
| Feature | Description |
|---------|-------------|
| **Document Ingestion** | Upload PDF, DOCX, TXT, MD, CSV, JSON, HTML, LOG — automatically chunked and indexed |
| **Semantic Embeddings** | Uses Ollama `nomic-embed-text` (274 MB) — semantic similarity search |
| **Keyword Fallback** | TF-based embedding if Ollama embedding model is unavailable |
| **Vector Store** | In-memory cosine similarity search, persisted to `rag_store.json` |
| **Auto-Retrieval** | Researcher and Analyst agents call `knowledge_base_search` automatically on every job |
| **Test Search Tab** | See exactly what chunks agents will find for any query before running a job |
| **Paste Text Directly** | Index any raw text without a file — useful for policies, notes, API docs |
| **Source Management** | Browse all indexed sources, view chunk counts, remove individual sources or clear all |

### Agents & Tools
| Feature | Description |
|---------|-------------|
| **Agent Manager** | Create, edit, deactivate, delete agents with role/goal/backstory/icon/colour |
| **SKILLS.md per Agent** | `backend/agents/<id>/SKILLS.md` — edit role, goal, backstory, tools, config directly |
| **Persistent Custom Agents** | Saved to `custom_agents.json`, reloaded on every restart |
| **Tool Manager** | Create custom tools with a Python code editor, TOOL.md per tool |
| **TOOL.md per Tool** | `backend/tools/<id>/TOOL.md` — name, description, tags, code |
| **Persistent Custom Tools** | Saved to `custom_tools.json`, reloaded on every restart |
| **Dynamic Tool Classes** | Custom tool code is compiled at runtime using `exec()` — changes take effect on next job |
| **Activate / Deactivate** | Soft-toggle any agent or tool (including built-ins) without deleting it |
| **Role Deduplication** | No two agents can share the same role at any level |
| **Agent Spawn Requests** | Agents request new specialists mid-job; human approves; spawned agents persist |
| **Tool Spawn Requests** | Agents request new tools mid-job; human approves; tool is active immediately |
| **Spawn Toggle** | Globally enable/disable all agent-initiated spawning with one switch |

### Infrastructure
| Feature | Description |
|---------|-------------|
| **📱 Telegram Bot** | Full bot control — run jobs, check status, switch model, receive reports as files |
| **Telegram Push Notifications** | Job completion text + report file auto-sent to your chat |
| **🔄 Self-Improver** | Scheduled LLM analysis loop: rewrites BEST_PRACTICES.md, auto-improves agent/tool descriptions |
| **Live Dashboard** | RAM, CPU, disk, model VRAM, session tokens, active jobs — refreshes every 3 s |
| **Model Switcher** | Switch Ollama models at runtime, no restart needed |
| **Filesystem Access** | File System Agent reads/writes/edits local files in operator-configured folders |
| **FS Config Persists** | Folder permissions and output directory survive restarts via `fs_config.json` |
| **Audit Log** | Every filesystem operation logged with timestamp, path, allow/deny |
| **100% Offline Core** | No cloud API keys for AI pipeline — web search, Telegram, self-improver are opt-in |

---

## Project Structure

```
multi-agent-3d/
├── backend/
│   ├── main.py                    # FastAPI server — all endpoints + WebSocket broadcast
│   ├── agent_registry.py          # Agent store, custom_agents.json persistence, SKILLS.md helpers
│   ├── agents_crew.py             # Builds CrewAI Agent objects, merges SKILLS.md + custom tools
│   ├── tasks_crew.py              # Task pipeline — real-time detection, datetime injection, FORMAT routing
│   ├── tools.py                   # All built-in tools incl. real web search + RAG search
│   ├── tool_registry.py           # Tool store, custom_tools.json, TOOL.md helpers, dynamic class builder
│   ├── web_search_tool.py         # Real-time search — DuckDuckGo, Yahoo Finance, wttr.in, WorldTimeAPI
│   ├── rag_engine.py              # RAG vector store — chunking, Ollama embeddings, cosine retrieval
│   ├── fs_config.py               # Filesystem ACL — persisted to fs_config.json
│   ├── fs_tools.py                # FSReadTool, FSListTool, FSWriteTool, FSEditTool
│   ├── model_config.py            # Active model singleton + per-model LLM presets
│   ├── telegram_bot.py            # Telegram bot — all commands, push notifications, lifecycle
│   ├── self_improver.py           # Autonomous improvement scheduler + LLM analysis loop
│   ├── requirements.txt           # Pinned Python dependencies
│   │
│   ├── custom_agents.json         # Auto-created — persisted custom agent definitions
│   ├── custom_tools.json          # Auto-created — persisted custom tool definitions
│   ├── fs_config.json             # Auto-created — persisted filesystem folder permissions
│   ├── telegram_config.json       # Auto-created — Telegram token + chat IDs
│   ├── self_improver_config.json  # Auto-created — schedule, thresholds, model override
│   ├── web_search_config.json     # Auto-created — provider, timeout, max results, enabled flag
│   ├── rag_config.json            # Auto-created — embed model, chunk size, top-k, min score
│   ├── rag_store.json             # Auto-created — persisted vector store (all ingested chunks)
│   │
│   ├── BEST_PRACTICES.md          # Auto-maintained — rewritten by self-improver after every cycle
│   ├── IMPROVEMENT_PROPOSALS.md   # Auto-created — structural suggestions awaiting human review
│   ├── IMPROVEMENT_LOG.md         # Auto-created — append-only log of every improvement cycle
│   ├── activity_log.jsonl         # Auto-created — rolling 500-entry job log fed to the LLM
│   │
│   ├── agents/                    # One sub-folder per agent
│   │   ├── coordinator/SKILLS.md
│   │   ├── researcher/SKILLS.md
│   │   ├── analyst/SKILLS.md
│   │   ├── writer/SKILLS.md
│   │   ├── fs_agent/SKILLS.md
│   │   └── <custom_id>/SKILLS.md
│   ├── tools/                     # One sub-folder per custom tool
│   │   └── <tool_id>/TOOL.md
│   ├── knowledge_base/            # Source files ingested into the RAG store
│   ├── reports/                   # Saved reports in agent-chosen format
│   └── uploads/                   # Uploaded files for agent file-analysis mode
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx                      # Main app — all panels, state, WebSocket
        ├── components/
        │   ├── AgentScene3D.jsx         # 3D boardroom, robot avatars, custom desks, HUD
        │   ├── ActivityFeed.jsx         # Feed with RESULT blocks and per-agent colours
        │   └── AgentCard.jsx            # Agent status cards with inactive badge
        └── styles/
            └── App.css                  # Complete stylesheet
```

---

## Requirements

| Item | Value |
|------|-------|
| Hardware | MacBook Air M1 8 GB RAM (or any Apple Silicon) |
| OS | macOS 12 Monterey or later |
| Python | 3.11 |
| Node.js | 20 LTS |
| LLM Backend | Ollama (local, no API key) |
| Default LLM | `phi3:mini` — 3.8B params, ~2.3 GB |
| Embedding Model | `nomic-embed-text` — 274 MB, optional for RAG |
| Disk Space | ~5 GB (LLM + dependencies) |
| Setup Time | ~25 min first time |
| Web Search (optional) | `duckduckgo-search` + `yfinance` (pip) |
| Telegram (optional) | `python-telegram-bot==20.7` + BotFather token |

---

## Quick Start

> **Before starting:** plug your Mac in — sustained inference drains battery fast. Ensure 5 GB free disk space.

### 1. Install prerequisites

```bash
# Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# Python 3.11
brew install python@3.11
echo 'export PATH="/opt/homebrew/opt/python@3.11/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile

# Node.js 20
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

> **Tip:** If your shell sources `~/.zshrc` instead of `~/.zprofile`, replace all occurrences above.

### 2. Install Ollama and pull models

Install Ollama from [ollama.com/download/mac](https://ollama.com/download/mac) — drag to Applications and launch once. Then:

```bash
# Required — main LLM (choose one)
ollama pull phi3:mini          # 2.3 GB — default, fast
ollama pull llama3.2:3b        # 2.0 GB — recommended for better quality

# Optional — semantic embeddings for RAG
ollama pull nomic-embed-text   # 274 MB — needed for Knowledge Base

# Verify the main LLM works
ollama run phi3:mini "Hello"   # Ctrl+D to exit
```

### 3. Set up the backend

```bash
cd ~/multi-agent-3d/backend
python3.11 -m venv venv
source venv/bin/activate

pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
pip install requests psutil pypdf python-docx openpyxl

# Optional packages — install as needed
pip install duckduckgo-search          # general web search + news
pip install yfinance                   # live stock prices (Yahoo Finance)
pip install "python-telegram-bot==20.7" # Telegram bot

# Fix CrewAI telemetry compatibility (pkg_resources on Python 3.11)
sed -i '' 's/import pkg_resources/import importlib.metadata as pkg_resources/' \
  venv/lib/python3.11/site-packages/crewai/telemetry/telemetry.py

python3.11 -c "import main" && echo "✅ Backend OK"
```

> **Always activate the venv first.** On macOS, `pip` is not on PATH globally. Run `source venv/bin/activate` before every `pip install`, or use `python3.11 -m pip install …` explicitly.

### 4. Set up the frontend

```bash
cd ~/multi-agent-3d/frontend
npm create vite@latest . -- --template react
npm install
npm install three @react-three/fiber @react-three/drei
```

### 5. Run everything

Open **3 separate terminal tabs**:

```bash
# Terminal 1 — Ollama (leave running)
ollama serve

# Terminal 2 — Backend
cd ~/multi-agent-3d/backend
source venv/bin/activate
PYTHONWARNINGS=ignore uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3 — Frontend
cd ~/multi-agent-3d/frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Using the App

### Job Modes

| Mode | Best for | Pipeline |
|------|----------|----------|
| **🔬 Research** | Deep-dive on any topic | Coordinator → Researcher → Analyst → Writer → Custom agents |
| **💬 Quick Query** | Direct questions, real-time data, maths | Single agent — direct answer using tools |
| **📎 File Analysis** | Analyse uploaded documents | Researcher → Analyst → Writer |

### Running a Research Job

1. Select **🔬 Research** mode
2. Type a research topic (e.g. `Impact of AI on software development`)
3. Click **▶ Launch Agents**
4. Watch the 3D boardroom — agents light up, walk to the table, communicate via animated arcs
5. The **"NOW ACTIVE"** panel in the top-left of the 3D scene shows which agent is working
6. The **activity feed** shows phase banners when each agent starts, and a green **RESULT** block when each task completes
7. Custom agents run after the Writer and receive the full report as context
8. The final report appears at the bottom with a format badge and **⬇ Download** button

> **Timing on M1 8 GB:** expect 30–90 seconds per agent task, 3–8 minutes total. The model cold-starts on first inference — subsequent runs in the same Ollama session are faster.

### Quick Query Mode — Real-Time Data

`💬 Quick Query` mode routes to a single agent that calls tools directly. Queries containing real-time keywords are automatically detected and the agent is instructed to call `web_search` before answering.

**Examples that trigger live data fetch:**
```
Infosys stock price today          → Yahoo Finance API → live INR price
weather in Mumbai                  → wttr.in → current conditions + 3-day forecast
what day is today                  → WorldTimeAPI → exact date (system clock fallback)
USD to INR exchange rate           → ExchangeRate-API → live rate
latest news about OpenAI           → DuckDuckGo news → today's headlines
who is Sundar Pichai               → Wikipedia REST → biography summary
sqrt(2401)                         → calculator tool → 49.0
```

**What "intent detection" means:** before any network call, the query text is matched against regex patterns. `_STOCK_PATTERNS` is checked first (before time) so `"Infosys stock price today"` routes to Yahoo Finance rather than the time provider despite containing the word "today". The priority order is: stock → weather → currency → news → time → wiki → general.

**If real search is disabled:** the tool returns an explicit `[MOCK — Real-time web search is not enabled]` message with instructions to enable it — not fake plausible data that the LLM might report as real.

### Reading the Activity Feed

| Entry type | Appearance | What it means |
|-----------|-----------|---------------|
| **Phase banner** | Coloured left border, bold agent name | Agent has started its task |
| **Regular log** | Thin colour bar, small grey text | Intermediate thought, tool call result, or system message |
| **RESULT block** | Green border, green RESULT badge, scrollable body | Agent's complete task output — the final answer for that step |

Custom agents appear in their own colour. Tool call results (e.g. stock prices, weather data) appear as regular logs before the RESULT block.

### Report Formats and Metadata

Every saved report includes a metadata section automatically appended in the appropriate style for its format:

| Format | When chosen | Metadata style |
|--------|-------------|----------------|
| `.txt` | **Default** — plain prose, general research | `=== Report Metadata ===` block at bottom |
| `.csv` | Data tables, comparisons, rankings | `# comment rows` at top |
| `.json` | Structured / API-style output | `_metadata` key in JSON object |
| `.html` | Rich multi-section output with tables | `<footer>` tag + `<!-- comment -->` header |
| `.log` | Timelines, event logs | `[timestamp] KEY=value` header lines |
| `.md` | When markdown headings/bullets add value | Blockquote footer with bold fields |

**Metadata fields included in every report:**
- Job ID and timestamp
- Model name
- Temperature, Top-K, Top-P, Context Window
- Repeat Penalty, Presence Penalty
- **Confidence Score** (extracted from Analyst output — e.g. "Confidence: 84%")
- Active agent list

### The 3D Boardroom

| Element | What it shows |
|---------|--------------|
| **Robot avatars** | Built-in agents have unique robot designs; custom agents get 1 of 4 variant robots |
| **Glowing nameplates** | Desk edge glows in agent colour; brightens when active |
| **Monitor screen** | Pulses in agent colour when actively working |
| **Walking to table** | Agent physically walks to their named seat when collaborating |
| **Communication arcs** | Curved beam with a travelling dot showing data direction |
| **Table activity panel** | Floating panel — who is seated, current phase, last message |
| **NOW ACTIVE HUD** | Top-left overlay — agent label, role, pulsing colour ring |

Drag to orbit, scroll to zoom, auto-rotates when idle. Custom agent desks appear along the room perimeter at 7 predefined slot positions.

### Creating Custom Agents

1. Click **🤖 Agents** in the header → **+ New Agent** tab
2. Fill in Display Label, Role (must be unique), Goal, Backstory, Icon, Colour
3. Click **＋ Create Agent**

The agent is immediately:
- Saved to `custom_agents.json` (survives restarts)
- Given a slug-based ID (e.g. `critics_agent`, not a UUID)
- Given its own `backend/agents/<id>/SKILLS.md`
- Rendered as a new desk + robot avatar in the 3D scene
- Added to every subsequent Research and File Analysis job after the Writer

### Agent Folders and SKILLS.md

Every agent — built-in and custom — has `backend/agents/<agent_id>/SKILLS.md`:

```markdown
# Agent Skills

## Role
Critical Reviewer

## Goal
Critique the report for logical errors, unsupported claims, and missing perspectives.
Verify all statistics and flag any that appear outdated or unverified.

## Backstory
You are a rigorous academic reviewer with 20 years of peer-review experience.
You are known for identifying weak arguments while remaining constructive.

## Tools
web_search, knowledge_base_search, summariser, calculator

## Config
max_iter: 10
allow_delegation: false
```

**Priority order:** SKILLS.md values override `custom_agents.json`. If SKILLS.md defines a goal, that is what the agent uses — regardless of what the UI shows.

**Editing:** click the **📄** button in Agent Manager → edit in the textarea → **💾 Save SKILLS.md**. Changes take effect on the next job without a backend restart. Or edit the file directly and restart.

### Creating Custom Tools

1. Click **🔧 Tools** in the header → **+ New Tool** tab
2. Enter a `snake_case` tool name (e.g. `sentiment_analyser`), display name, description, optional tags
3. Write the function body in the code editor — this is the Python body of `_run(self, input_data: str) → str`
4. Click **＋ Create Tool**

```python
# Example: a word counter tool
def _run(self, input_data):
    words = input_data.split()
    unique = len(set(w.lower() for w in words))
    return f"Total words: {len(words)} | Unique words: {unique}"
```

The tool is saved to `custom_tools.json`, its `backend/tools/<id>/TOOL.md` is created, and it is automatically available to all active agents on the next job. No restart needed.

**If the code has a syntax error:** the tool returns an error string rather than crashing the job. Fix it via the **📄** TOOL.md editor and rerun.

### Tool Folders and TOOL.md

```markdown
# Tool Definition

## Name
sentiment_analyser

## Description
Analyse text sentiment and return a score. Input: any text string.
Returns: Positive/Negative/Neutral with a numeric score.

## Tags
analysis, nlp

## Code
```python
def _run(self, input_data):
    words = input_data.lower().split()
    pos = sum(1 for w in words if w in ['good','great','excellent','amazing'])
    neg = sum(1 for w in words if w in ['bad','poor','terrible','awful'])
    if pos > neg:   return f"Positive (score: +{pos - neg})"
    if neg > pos:   return f"Negative (score: -{neg - pos})"
    return "Neutral (score: 0)"
```
```

### Agent and Tool Spawn Requests

**Agent spawning** — the Coordinator can call `request_new_agent` during a job when it determines the team needs a specialist. Two checks run first: the spawn toggle must be on, and the requested role must not already exist. A pulsing amber **"🤖 N spawn requests"** badge appears. Open Agent Manager → **✓ Approve** or **✕ Reject**. Approved agents are saved to `custom_agents.json` and join the next job.

**Tool spawning** — any agent can call `request_new_tool` when a needed capability is missing. A green **"🔧 N tool requests"** badge appears. Open Tool Manager to approve. The tool is compiled and active immediately on the next job.

### Filesystem Access (File System Agent)

Click **📁 Filesystem** in the header to configure which local folders agents can access.

**Output directory** — an absolute path where reports are also copied after every job (in addition to `backend/reports/`). Created automatically if it doesn't exist. Persists across restarts.

**Folder permissions:**

| Permission | Default | What it allows |
|-----------|---------|----------------|
| **Read** | ON when added | Agents can read files in this folder |
| **Write** | OFF | Agents can create new files |
| **Edit** | OFF | Agents can overwrite or append to existing files |

Config is saved to `fs_config.json` and reloaded on every backend restart. macOS `/home/username` ↔ `/Users/username` symlinks are handled automatically — both path forms are stored and checked.

**Audit log** — every filesystem operation is logged with timestamp, operation type, path, and allow/deny. View in the **📋 Audit Log** tab.

**Example queries:**
```
"Read all .py files in /Users/me/project and summarise each module"
"List all CSV files in /Users/me/Documents/data"
"Write a summary to /Users/me/Desktop/output.md"
```

---

## 🌐 Real-Time Web Search

### Setup

```bash
# Inside the backend venv
source ~/multi-agent-3d/backend/venv/bin/activate

pip install duckduckgo-search   # general search + news
pip install yfinance             # live stock prices
```

Enable in the UI: **⚙️ Settings → 🌐 Web Search → toggle ON → 💾 Save Config**.

### How Intent Detection Works

Every query passed to `web_search` is classified before any network call using regex patterns. The priority order matters:

```
1. Stock      — "Infosys stock price", "INFY share", "Nifty 50 value", "Apple NASDAQ"
2. Weather    — "weather in", "forecast", "temperature", "rain"
3. Currency   — "exchange rate", "USD to INR", "forex"
4. News       — "latest news", "breaking news", "headlines"
5. Time/Date  — "today", "current date", "what day", "current time"
6. Wiki       — "who is", "what is", "history of", "define"
7. General    — everything else → DuckDuckGo text search
```

Stock is checked **before** time to prevent `"Infosys stock price today"` from routing to the time provider.

### Providers

| Provider | Handles | Requires | Notes |
|----------|---------|----------|-------|
| **Yahoo Finance API** | Stock prices, market cap, day high/low | Nothing (REST) | Used automatically for stocks |
| **yfinance library** | Same, richer data | `pip install yfinance` | Tried first if installed |
| **wttr.in** | Weather for any city | Nothing (REST) | 3-day forecast included |
| **WorldTimeAPI** | Current date/time/timezone | Nothing (REST) | Falls back to system clock |
| **ExchangeRate-API** | 150+ currency pairs | Nothing (REST) | Updated every 24h |
| **DuckDuckGo** | General search, news | `pip install duckduckgo-search` | Main workhorse |
| **Wikipedia REST** | Factual lookups | Nothing (REST) | For "who is / what is" queries |

### Known Stock Tickers

The following company names are automatically mapped to their tickers without the LLM needing to know them:

Indian: Infosys (INFY), TCS (TCS.NS), Wipro (WIPRO.NS), Reliance (RELIANCE.NS), HDFC Bank (HDFCBANK.NS), ICICI Bank (ICICIBANK.NS), SBI (SBIN.NS), HCL (HCLTECH.NS), Bajaj Finance (BAJFINANCE.NS), Kotak (KOTAKBANK.NS), Axis Bank (AXISBANK.NS)

Global: Apple (AAPL), Google/Alphabet (GOOGL), Microsoft (MSFT), Amazon (AMZN), Tesla (TSLA), Nvidia (NVDA), Meta (META), Netflix (NFLX)

Indices: Nifty 50 (^NSEI), Sensex (^BSESN), S&P 500 (^GSPC), Dow Jones (^DJI), Nasdaq (^IXIC)

You can also use any ticker symbol directly: `"INFY stock price"`, `"TCS.NS current value"`.

### Date/Time Fast Path

For date/time queries, the system **always** returns the correct answer — even if the network is down. The fast path checks the system clock immediately and returns `"Monday, 23 March 2026"` before any API call. WorldTimeAPI is then tried with a 4-second timeout for timezone and additional info. This guarantees agents never write `[Insert current date here]` regardless of connectivity.

### Enabling/Disabling

Config is saved to `backend/web_search_config.json`. When disabled, the tool returns an honest error message telling agents and users to enable it — not plausible mock data that looks like real search results.

---

## 📚 RAG / Knowledge Base

### What It Does

RAG (Retrieval-Augmented Generation) lets agents answer questions grounded in your own documents rather than just training data. Upload your company policies, technical docs, research papers, or any text — agents will find the most relevant passages and cite them in their answers.

### Architecture

```
Your document (PDF/DOCX/TXT/…)
        ↓  _extract_text()
    Raw text
        ↓  _chunk_text()  (400 char chunks, 80 char overlap)
    Chunks [chunk_0, chunk_1, chunk_2, …]
        ↓  _get_embedding()
    Vectors via Ollama nomic-embed-text
    (fallback: keyword TF pseudo-vectors)
        ↓  stored in _store[]
    rag_store.json  ←─────────────── persists across restarts

At query time:
    Agent calls knowledge_base_search("your question")
        ↓  _get_embedding(query)
        ↓  _cosine(query_vec, each_chunk_vec)
    Top-K chunks by cosine similarity (default: 4)
        ↓  formatted as source + relevance % + text
    Injected into agent context
```

### Setup

1. Pull the embedding model: `ollama pull nomic-embed-text`
2. Click **📚 Knowledge Base** in the header → **➕ Add Documents**
3. Click the upload zone and select files, or paste text directly
4. Agents automatically use the KB on every subsequent job

Without `nomic-embed-text`, the system falls back to keyword-frequency pseudo-embeddings — still useful for exact-phrase matching, just not semantically aware.

### Supported File Types

| Format | How extracted |
|--------|--------------|
| `.txt`, `.md`, `.log`, `.csv` | Read directly as UTF-8 text |
| `.json` | Formatted and indexed as text |
| `.html` | HTML tags stripped, text indexed |
| `.pdf` | Text layer extracted via `pypdf` |
| `.docx` | Paragraph text extracted via `python-docx` |
| `.yaml`, `.yml` | Read as text |

### Chunking Strategy

Documents are split on natural boundaries: paragraph breaks (`\n\n`), sentence ends (`. `, `? `, `! `). The default chunk size is 400 characters with 80 characters of overlap so context isn't lost at chunk boundaries. Both values are configurable in the Config tab.

### Configuration (📚 KB → ⚙️ Config)

| Setting | Default | Effect |
|---------|---------|--------|
| Embedding Model | `nomic-embed-text` | Ollama model used for vectorising text |
| Chunk size | 400 chars | Larger = more context per chunk, fewer results |
| Chunk overlap | 80 chars | Prevents losing context at chunk boundaries |
| Top-K results | 4 | How many chunks agents receive per query |
| Min relevance | 0.25 | Chunks below this cosine similarity are excluded |
| Use Ollama embed | true | Uncheck to use keyword fallback |

### Testing Before Running Jobs

The **🔍 Test Search** tab lets you run any query and see exactly what the agents will receive — source file, chunk index, relevance score, and the actual text. Use this to tune your chunk size and min-score settings.

---

## 📱 Telegram Bot

### Setup (3 minutes)

1. Open Telegram → search **@BotFather** → send `/newbot` → copy the token
2. Message **@userinfobot** → copy your numeric Chat ID
3. In the backend venv: `pip install "python-telegram-bot==20.7"`
4. In the browser: **⚙️ Settings** → **📱 Telegram** tab
5. Paste Bot Token + Chat ID → check **Enable** → **💾 Save & Apply** → **📱 Test**

Or via environment variables:
```bash
export TELEGRAM_BOT_TOKEN="1234567890:AAFxxxxxx"
export TELEGRAM_ALLOWED_CHAT_IDS="123456789"
export TELEGRAM_NOTIFY_CHAT_ID="123456789"
```

### Bot Commands

| Command | What happens |
|---------|-------------|
| `/run <topic>` | Full research pipeline — sends result text + report file on completion |
| `/query <question>` | Quick query with real-time data support — try `/query Infosys stock price` |
| `/file <filename> <question>` | File analysis on an already-uploaded file |
| `/status` | Current job ID, status, topic, model, filename |
| `/agents` | Lists all agents with active/inactive status |
| `/tools` | Lists all tools with active/inactive status |
| `/model` | Shows the current active model |
| `/model llama3.2:3b` | Switches the active model (must be installed) |
| `/report` | Re-sends the last completed report as a file attachment |
| `/help` | Shows all commands |

### How Push Notifications Work

When any job completes — whether triggered from the browser UI or Telegram — the backend calls `notify_job_done()`. This function runs in a background thread using `asyncio.run_coroutine_threadsafe()` to schedule sends on the bot's dedicated asyncio event loop (completely separate from the uvicorn event loop). First it sends a text preview of the report, then sends the full report file as a document attachment. This never blocks API responses.

---

## 🔄 Self-Improver

### What Happens Each Cycle

1. Reads all `backend/agents/*/SKILLS.md` and `backend/tools/*/TOOL.md` files
2. Reads the last 50 job events from `activity_log.jsonl`
3. Reads the current `BEST_PRACTICES.md`
4. Makes three sequential LLM calls:

**Call 1 — Best Practices Rewrite**
Prompt includes recent activity summary, all agent/tool definitions, and the current best practices. Output rewrites `BEST_PRACTICES.md` entirely with specific, actionable guidance based on observed patterns (e.g. "use llama3.2:3b for topics requiring multi-step reasoning", "keep research topics under 10 words for phi3:mini").

**Call 2 — Agent Improvement Suggestions**
Returns a JSON array of `{ agent_id, field, current, suggested, reason, confidence, safe_to_auto_apply }`. If `confidence ≥ threshold` and `safe_to_auto_apply: true` and the field is `goal`, `backstory`, or `description`, the change is applied immediately via `update_agent()`. Structural changes (role renames, tool reassignments) go to `IMPROVEMENT_PROPOSALS.md` for human review.

**Call 3 — Tool Description Improvements**
Returns a JSON array of `{ tool_id, current_description, suggested_description, confidence }`. Applied automatically for custom tools at confidence ≥ 0.85.

5. Appends cycle summary to `IMPROVEMENT_LOG.md`
6. Broadcasts the result to the UI activity feed
7. Optionally sends a Telegram notification

### Configuration — ⚙️ Settings → 🔄 Self-Improver

| Setting | Default | Description |
|---------|---------|-------------|
| Enabled | true | Whether the scheduler runs |
| Run every (hours) | 6 | Cycle interval (1–168h) |
| Min confidence | 0.7 | Only apply at or above this score (0–1) |
| Auto-apply safe changes | true | Apply goal/description improvements automatically |
| Notify Telegram | true | Send Telegram message after each cycle |
| Model override | (blank) | Force a specific model for analysis — recommended: `llama3.2:3b` |

Use **🔄 Run Now** in Settings to trigger immediately. View output in the **📋 Best Practices** tab.

---

## Built-in Agents

| Agent | Role | Avatar | Tools | Responsibility |
|-------|------|--------|-------|----------------|
| 🎯 Coordinator | Research Coordinator | Silver humanoid, cyan visor | `web_search`, `request_new_agent` | Scopes problem into 3 research questions, can spawn new agents |
| 🔍 Researcher | Data Researcher | Heavy rust industrial robot | `web_search`, `knowledge_base_search`, `summariser`, `read_uploaded_file`, `calculator` | Gathers live data, searches KB, reads files, handles maths |
| 📊 Analyst | Data Analyst | Teal armoured robot | `data_analyser`, `knowledge_base_search`, `summariser`, `read_uploaded_file`, `calculator` | Identifies top 3 insights, flags risks, scores confidence |
| ✍️ Writer | Report Writer | Friendly white/yellow robot | `summariser` | Produces final structured report in chosen format with metadata footer |
| 🗂️ File System | File System Agent | (no desk) | `fs_read_file`, `fs_list_dir`, `fs_write_file`, `fs_edit_file` | Reads, writes, edits files within permitted folders |

Custom agents receive one of four robot variants (chrome slim, orange industrial, green compact, purple orb-head) assigned by creation order.

---

## Built-in Tools

| Tool | ID | Provider / Library | Description |
|------|----|--------------------|-------------|
| WebSearchTool | `web_search` | DuckDuckGo / Yahoo Finance / wttr.in / WorldTimeAPI / ExchangeRate-API | **Smart routing** — auto-detects query intent and picks the right provider. Live stock prices, weather, date/time, FX rates, news, general search |
| KnowledgeBaseSearchTool | `knowledge_base_search` | `rag_engine.py` / Ollama `nomic-embed-text` | Semantic search over ingested documents — returns top-K chunks with relevance scores |
| DataAnalysisTool | `data_analyser` | Built-in | Extracts themes, sentiment, confidence score from text |
| SummaryTool | `summariser` | Built-in | Condenses long content into key bullet points |
| FileReadTool | `read_uploaded_file` | pypdf / python-docx / openpyxl | Reads PDF, DOCX, TXT, CSV, XLSX, JSON from `uploads/` folder |
| MathTool | `calculator` | Built-in `math` module | Evaluates arithmetic expressions, `sqrt()`, percentages, power |
| SpawnAgentTool | `request_new_agent` | `agent_registry.py` | Submits agent spawn request — checks toggle + deduplication first |
| SpawnToolTool | `request_new_tool` | `tool_registry.py` | Submits tool spawn request — checks deduplication first |
| FSReadTool | `fs_read_file` | `fs_tools.py` | Reads any file in an ACL-approved folder |
| FSListTool | `fs_list_dir` | `fs_tools.py` | Lists files and directories in an approved folder |
| FSWriteTool | `fs_write_file` | `fs_tools.py` | Creates a new file (write permission required) |
| FSEditTool | `fs_edit_file` | `fs_tools.py` | Overwrites or appends to an existing file (edit permission required) |

---

## API Reference

All endpoints on `http://localhost:8000`:

### Core

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check — service name, version, active model |
| `GET` | `/stats` | Live system stats (RAM, CPU, disk, tokens, Ollama VRAM) |
| `WS` | `/ws` | WebSocket — all real-time events |

### Models & Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/models` | Installed Ollama models + active model |
| `POST` | `/model` | `{"model": "llama3.2:3b"}` — switch active model |
| `POST` | `/upload` | Upload file via `multipart/form-data` |
| `GET` | `/uploads` | List uploaded files |
| `DELETE` | `/uploads/{filename}` | Delete an uploaded file |
| `POST` | `/run` | `{"topic":"…","mode":"research\|query\|file","uploaded_files":[…]}` |
| `GET` | `/jobs/{job_id}` | Poll job status and result |
| `GET` | `/reports` | List all saved reports |
| `GET` | `/reports/{filename}` | Download report with correct MIME type |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/agents` | List all agents (built-in + custom, including inactive) |
| `POST` | `/agents` | Create custom agent |
| `PUT` | `/agents/{id}` | Update role/goal/backstory/icon/colour |
| `DELETE` | `/agents/{id}` | Hard-delete custom agent (built-ins protected) |
| `POST` | `/agents/{id}/activate` | Re-activate a deactivated agent |
| `POST` | `/agents/{id}/deactivate` | Soft-deactivate — removed from jobs, definition kept |
| `GET` | `/agents/{id}/skills` | Get raw SKILLS.md text |
| `PUT` | `/agents/{id}/skills` | `{"text":"…"}` — overwrite SKILLS.md and reload fields |

### Tools

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tools` | List all tools (built-in + custom, including inactive) |
| `POST` | `/tools` | Create custom tool |
| `PUT` | `/tools/{id}` | Update display_name/description/tags/code |
| `DELETE` | `/tools/{id}` | Hard-delete custom tool (built-ins protected) |
| `POST` | `/tools/{id}/activate` | Re-activate tool |
| `POST` | `/tools/{id}/deactivate` | Soft-deactivate tool |
| `GET` | `/tools/{id}/toolmd` | Get raw TOOL.md text |
| `PUT` | `/tools/{id}/toolmd` | `{"text":"…"}` — overwrite TOOL.md and reload |

### Spawn Requests

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/spawns` | List pending agent spawn requests |
| `POST` | `/spawns/decide` | `{"request_id":"…","approved":true\|false}` |
| `GET` | `/spawn-settings` | Get spawn toggle state |
| `POST` | `/spawn-settings` | `{"enabled":true\|false}` |
| `GET` | `/tool-spawns` | List pending tool spawn requests |
| `POST` | `/tool-spawns/decide` | `{"request_id":"…","approved":true\|false}` |

### Web Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/web-search/config` | Get current web search configuration |
| `POST` | `/web-search/config` | `{"enabled":true,"provider":"auto","max_results":5,…}` |
| `POST` | `/web-search/test` | Health-check all providers — returns per-provider status |
| `GET` | `/web-search/query?q=…` | Run a test search directly |

### Knowledge Base (RAG)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/kb/config` | Get KB configuration |
| `POST` | `/kb/config` | `{"enabled":true,"embed_model":"nomic-embed-text","chunk_size":400,…}` |
| `GET` | `/kb/entries` | List all entries + sources + total count |
| `POST` | `/kb/ingest-text` | `{"text":"…","source_name":"…","tags":["…"]}` |
| `POST` | `/kb/ingest-file` | Upload + ingest file via `multipart/form-data` |
| `DELETE` | `/kb/entries/{entry_id}` | Delete a single chunk by ID |
| `DELETE` | `/kb/sources/{source}` | Delete all chunks from a source file |
| `POST` | `/kb/clear` | Clear the entire knowledge base |
| `GET` | `/kb/search?q=…` | Test a search query directly |

### Telegram & Self-Improver

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/telegram/config` | Get Telegram config (token masked) |
| `POST` | `/telegram/config` | Set token, chat IDs, enable/disable |
| `POST` | `/telegram/test` | Send a test message to notify chat |
| `GET` | `/self-improver/config` | Get self-improver configuration |
| `POST` | `/self-improver/config` | Update schedule, thresholds, model override |
| `POST` | `/self-improver/run-now` | Trigger immediate improvement cycle |
| `GET` | `/self-improver/best-practices` | Contents of BEST_PRACTICES.md |
| `GET` | `/self-improver/proposals` | Contents of IMPROVEMENT_PROPOSALS.md |
| `GET` | `/self-improver/log` | Contents of IMPROVEMENT_LOG.md |

### Filesystem Config

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/fs-config` | Access list + output directory |
| `POST` | `/fs-config/access` | Add folder `{"path":"…","read":true,"write":false,"edit":false}` |
| `PUT` | `/fs-config/access` | Update permission flags |
| `DELETE` | `/fs-config/access?path=…` | Remove a folder |
| `POST` | `/fs-config/output-dir` | `{"path":"…"}` — set or clear output directory |
| `GET` | `/fs-config/audit` | Last 200 filesystem operations |

### WebSocket Events

```json
{ "type": "agent_activity",    "agent": "researcher", "label": "🔍 Researcher",
  "message": "…", "ts": 0, "phase": true, "task_result": false }
{ "type": "agent_working",     "agent": "analyst", "icon": "📊",
  "color": "#FF6584", "role": "Data Analyst", "ts": 0 }
{ "type": "job_done",          "job_id": "abc123", "result": "…",
  "filename": "report_20260323_….txt", "format": "txt" }
{ "type": "job_failed",        "job_id": "abc123", "reason": "…" }
{ "type": "spawn_request",     "request_id": "…", "suggestion": { "role": "…" } }
{ "type": "tool_spawn_request","request_id": "…", "suggestion": { "name": "…" } }
{ "type": "tool_created",      "tool": { "id": "…", "name": "…" } }
{ "type": "tool_updated",      "tool": { … } }
{ "type": "agent_created",     "agent": { "id": "…", "role": "…" } }
{ "type": "agent_updated",     "agent": { … } }
{ "type": "agents_updated" }
{ "type": "tools_updated" }
{ "type": "spawn_settings",    "spawn_enabled": true }
{ "type": "fs_config_updated", "config": { … } }
```

---

## Troubleshooting

### `pip` not found — command not found

Always activate the virtual environment first. On macOS, `pip` is not on PATH globally:
```bash
cd ~/multi-agent-3d/backend
source venv/bin/activate
pip install duckduckgo-search yfinance
```
Or explicitly: `python3.11 -m pip install duckduckgo-search`

### `pkg_resources` import error on uvicorn start
```bash
sed -i '' 's/import pkg_resources/import importlib.metadata as pkg_resources/' \
  venv/lib/python3.11/site-packages/crewai/telemetry/telemetry.py
```

### Ollama not responding
```bash
curl http://localhost:11434/api/tags         # check health
pkill ollama && sleep 2 && ollama serve &    # restart
```

### Port already in use
```bash
lsof -ti:8000 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

### Agent returns "as of my last update" for stock prices

Three causes and fixes:
1. **Web search is disabled** — enable it in ⚙️ Settings → 🌐 Web Search
2. **duckduckgo-search not installed** — `pip install duckduckgo-search yfinance`
3. **`phi3:mini` too small** — switch to `llama3.2:3b` via the model badge. The forcing instruction in `tasks_crew.py` uses `*** MANDATORY ***` step-by-step instructions, but very small models can still ignore tool calls

### Stock price not found for a company

Check if the company name is in the built-in `KNOWN_TICKERS` map in `web_search_tool.py`. If not, add it:
```python
"your company": "TICKER.NS",   # Indian stocks
"your company": "TICKER",      # US stocks
```
Or pass the ticker directly in the query: `"INFY.NS current price"`.

### Knowledge Base search returns no results

- Check `GET /kb/entries` to confirm documents are indexed
- Lower `min_score` from 0.25 to 0.1 in KB Config tab
- Use the **🔍 Test Search** tab to debug what the query finds
- If using Ollama embeddings, confirm `nomic-embed-text` is pulled: `ollama list`
- Without the embedding model, keyword fallback is used — try a more specific query

### RAG store lost after restart

Stored in `backend/rag_store.json`. If deleted, re-ingest documents via the KB panel. The store is reloaded from disk on every backend startup.

### Report format not changing from .txt

`txt` is now the default. The writer agent is prompted to choose CSV for tabular data, JSON for structured data, HTML for rich multi-section output, LOG for timelines. If the model produces the wrong format, use `llama3.2:3b` or larger — `phi3:mini` often ignores FORMAT instructions.

### Confidence score shows "N/A" in report metadata

The confidence is extracted from the Analyst agent's output using the pattern `Confidence: XX%`. If the Analyst doesn't include this phrase, the score won't be found. The Analyst task description asks for a confidence score but small models may not include it. Use `llama3.2:3b` for consistent structured output from agents.

### Telegram bot not connecting
- Confirm the token is correct — use `/token` in BotFather to regenerate
- Ensure `python-telegram-bot==20.7` is installed **inside the venv**
- Check the backend console for `Telegram bot polling active.`
- If a previous instance is stuck: `pkill -f telegram_bot`
- Use the **📱 Test** button in Settings → Telegram to verify

### Self-improver makes no changes
- Lower `min_confidence` to `0.5`
- Set `model_override` to `llama3.2:3b` — `phi3:mini` produces weak analysis JSON
- Ensure `auto_apply_safe: true` in Settings
- Use **🔄 Run Now** and check the activity feed for the 🔄 result message

### Custom agent idle / not invoked in jobs
Custom agents run **after** the core Writer task. Confirm `active: true` at `GET /agents`. The RESULT block appears near the end of the job. If the pipeline times out before reaching the custom agent's turn, increase `max_iter` in SKILLS.md or use a faster model.

### Custom agents or tools disappear after restart
Saved to `custom_agents.json` and `custom_tools.json` on every create/edit/delete. If these files are deleted, recreate via the UI.

### Filesystem access denied despite folder being added
Open the **📋 Audit Log** tab — it shows the exact path the agent requested. On macOS try re-adding the folder using the full `/Users/...` form. Both forms are stored internally but the audit log shows which one failed.

### 8 GB RAM pressure
```bash
ollama pull gemma2:2b    # 1.6 GB — lightest capable option
# Switch via the model badge in the header
```

### Three.js canvas blank
```bash
cd ~/multi-agent-3d/frontend
rm -rf node_modules/.vite && npm run dev
```

---

## Quick-Reference Cheat Sheet

```bash
# ── Start all services ────────────────────────────────────────────

# Terminal 1
ollama serve

# Terminal 2
cd ~/multi-agent-3d/backend
source venv/bin/activate
PYTHONWARNINGS=ignore uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3
cd ~/multi-agent-3d/frontend
npm run dev

# ── Stop all ──────────────────────────────────────────────────────
pkill uvicorn ; pkill ollama
# Ctrl+C in the frontend terminal

# ── Install all optional dependencies ─────────────────────────────
cd ~/multi-agent-3d/backend && source venv/bin/activate
pip install duckduckgo-search          # web search + news
pip install yfinance                   # live stock prices
pip install "python-telegram-bot==20.7" # Telegram bot
pip install psutil pypdf python-docx openpyxl  # file handling

# ── Model management ──────────────────────────────────────────────
ollama list                          # installed models
ollama pull llama3.2:3b              # recommended for quality
ollama pull nomic-embed-text         # required for semantic RAG
ollama ps                            # current memory usage

# ── Test live search ──────────────────────────────────────────────
curl "http://localhost:8000/web-search/query?q=Infosys+stock+price+today"
curl "http://localhost:8000/web-search/query?q=weather+in+Chennai"
curl "http://localhost:8000/web-search/query?q=USD+to+INR"
curl "http://localhost:8000/web-search/query?q=what+day+is+today"
curl -X POST http://localhost:8000/web-search/test    # provider health check

# ── Knowledge Base ────────────────────────────────────────────────
curl http://localhost:8000/kb/entries                              # list sources
curl "http://localhost:8000/kb/search?q=your+query"               # test search
curl -X POST http://localhost:8000/kb/clear                       # clear all
curl -X POST http://localhost:8000/kb/ingest-text \
  -H "Content-Type: application/json" \
  -d '{"text":"Your text here","source_name":"my-doc","tags":["internal"]}'
curl -X POST http://localhost:8000/kb/ingest-file -F "file=@report.pdf"

# ── Core API shortcuts ─────────────────────────────────────────────
curl http://localhost:8000/                          # health check
curl http://localhost:8000/stats                    # live system stats
curl http://localhost:8000/agents                   # list agents
curl http://localhost:8000/tools                    # list tools
curl http://localhost:8000/telegram/config          # Telegram config
curl http://localhost:8000/self-improver/config     # self-improver config
curl http://localhost:8000/self-improver/best-practices  # BEST_PRACTICES.md

# Switch model
curl -X POST http://localhost:8000/model \
  -H "Content-Type: application/json" \
  -d '{"model": "llama3.2:3b"}'

# Research job
curl -X POST http://localhost:8000/run \
  -H "Content-Type: application/json" \
  -d '{"topic": "Future of renewable energy", "mode": "research", "uploaded_files": []}'

# Quick query with real-time data
curl -X POST http://localhost:8000/run \
  -H "Content-Type: application/json" \
  -d '{"topic": "Infosys stock price today", "mode": "query", "uploaded_files": []}'

# Create a custom agent
curl -X POST http://localhost:8000/agents \
  -H "Content-Type: application/json" \
  -d '{"label":"CRITIC","role":"Critical Reviewer","goal":"Critique the report","backstory":"Rigorous reviewer…","icon":"🔎","color":"#f472b6"}'

# Create a custom tool
curl -X POST http://localhost:8000/tools \
  -H "Content-Type: application/json" \
  -d '{"name":"word_counter","display_name":"Word Counter","description":"Count words","code":"    return f\"Words: {len(input_data.split())}\""}'

# Trigger self-improvement now
curl -X POST http://localhost:8000/self-improver/run-now

# Enable web search
curl -X POST http://localhost:8000/web-search/config \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"provider":"auto","max_results":5,"timeout_seconds":10}'

# Configure Telegram
curl -X POST http://localhost:8000/telegram/config \
  -H "Content-Type: application/json" \
  -d '{"bot_token":"TOKEN","allowed_chat_ids":["CHAT_ID"],"notify_chat_id":"CHAT_ID","enabled":true}'
```

---

## Extending the System

| Enhancement | How |
|-------------|-----|
| **More stock tickers** | Add to `KNOWN_TICKERS` dict in `web_search_tool.py` |
| **Real-time crypto prices** | Add `_search_crypto()` using CoinGecko REST API (no key) to `web_search_tool.py` |
| **Telegram file upload** | Accept documents sent to the bot, save to `uploads/`, auto-trigger file analysis |
| **Telegram webhook mode** | Replace polling with a webhook in `telegram_bot.py` — for production behind a domain |
| **Persist jobs to SQLite** | Replace in-memory `jobs` dict with `aiosqlite` — enables job history across restarts |
| **Concurrent jobs** | Replace `jobs` dict with Celery + Redis task queue |
| **Image OCR in RAG** | Add `pytesseract` to `_extract_text()` in `rag_engine.py` for scanned PDFs |
| **Remote vector store** | Replace `rag_store.json` with ChromaDB or Qdrant for millions of documents |
| **Docker deployment** | Containerise backend; use `host.docker.internal` for Ollama; mount `agents/`, `tools/`, `reports/`, `knowledge_base/` as volumes |
| **Custom agent 3D avatars** | Add entry to `AGENT_META` in `AgentScene3D.jsx` with `deskPos` and `seatAtTable` |

---

## Known Issues & Workarounds

| Issue | Cause | Fix |
|-------|-------|-----|
| `pip` not on PATH | macOS doesn't expose pip globally | `source venv/bin/activate` first |
| `pkg_resources` import error | CrewAI 0.51 uses old setuptools API | Patch with `sed` (see Quick Start §3) |
| Pydantic deprecation warnings | CrewAI written for Pydantic v1, v2 installed | Suppress with `PYTHONWARNINGS=ignore` |
| Agent returns training-data answer for stocks | web_search disabled OR `phi3:mini` ignoring tool call | Enable web search; switch to `llama3.2:3b` |
| Stock ticker not recognised | Company name not in `KNOWN_TICKERS` | Add to dict in `web_search_tool.py` or use ticker directly |
| KB search returns nothing | `min_score` too high or no documents indexed | Lower to 0.1; check `GET /kb/entries` |
| RAG store lost on restart | `rag_store.json` deleted | Re-ingest documents via KB panel |
| Report format always `.txt` | Expected — `.txt` is now the default | Choose a specific format or use a larger model |
| Confidence score shows N/A | Analyst didn't output `Confidence: XX%` | Use `llama3.2:3b`; check Analyst SKILLS.md |
| Report fails on `phi3:mini` | 3.8B too small for multi-step tasks | Switch to `llama3.2:3b` via model picker |
| Custom agent idle in research | Agent runs after Writer — appears late | Normal — check feed for green RESULT block |
| Custom agents lost on restart | `custom_agents.json` deleted | Written on every mutation — recreate if missing |
| Telegram bot not starting | Library not installed or token wrong | `pip install "python-telegram-bot==20.7"` inside venv |
| Self-improver makes no changes | `phi3:mini` too weak for analysis JSON | Set `model_override` to `llama3.2:3b` |
| Filesystem denied on macOS | `/home` vs `/Users` symlink | Re-add folder using `/Users/...` path |
| Custom tool code error | Syntax error in TOOL.md | Fix via **📄** editor — error reported in feed |

---

*Core AI pipeline runs 100% offline — no cloud API keys required.*  
*Web search, Telegram, RAG, and self-improver are opt-in — the system works fully without them.*  
*Runs entirely on MacBook Air M1 8 GB.*

---

> **Tested stack:** CrewAI 0.51.0 · FastAPI 0.111.0 · Uvicorn 0.30.1 · Ollama latest · python-telegram-bot 20.7 · duckduckgo-search · yfinance · React 18 · Three.js r167 · Vite 5 · Python 3.11 · Node 20 LTS  
> Last updated: March 2026 · **v7.0.0**
