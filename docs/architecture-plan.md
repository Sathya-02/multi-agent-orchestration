# Architecture Plan

## Overview
This repository implements a local-first multi-agent orchestration platform with a React + Three.js frontend, a FastAPI backend, CrewAI-based orchestration, Ollama-hosted models, WebSocket-driven runtime updates, optional real-time web search, a RAG knowledge base, Telegram bot control, and an autonomous self-improvement loop.

## System goals
- Run multi-agent workflows fully locally through Ollama for the core pipeline.
- Expose transparent execution through a 3D boardroom scene, activity feed, and real-time job events.
- Support extensibility through custom agents, custom tools, editable `SKILLS.md` and `TOOL.md` files, and spawn-request approval workflows.
- Persist operational state in JSON files, uploaded files, reports, and the knowledge-base store.

## Logical layers

### 1. Experience layer
The frontend is described as a Vite + React 18 application with a 3D boardroom scene, agent cards, activity feed, and app-wide styling. The README identifies `frontend/src/App.jsx`, `AgentScene3D.jsx`, `ActivityFeed.jsx`, `AgentCard.jsx`, and `App.css` as the key UI files.

### 2. API and transport layer
FastAPI in `backend/main.py` exposes REST endpoints for jobs, reports, uploads, models, agents, tools, filesystem config, RAG, spawn requests, and web-search configuration, alongside a WebSocket endpoint for live runtime events.

### 3. Orchestration layer
`agentscrew.py`, `taskscrew.py`, `agentregistry.py`, `toolregistry.py`, and `modelconfig.py` form the orchestration core that builds CrewAI agents, composes task pipelines, merges custom tool capability, and manages the active Ollama model.

### 4. Capability layer
The capability layer includes built-in tools, real-time web search, RAG retrieval, filesystem tools, Telegram bot integration, and the self-improver. The README names `tools.py`, `websearchtool.py`, `ragengine.py`, `fstools.py`, `telegrambot.py`, and `selfimprover.py` as the principal modules.

### 5. Persistence layer
Operational state is persisted through `customagents.json`, `customtools.json`, `fsconfig.json`, `telegramconfig.json`, `selfimproverconfig.json`, `websearchconfig.json`, `ragconfig.json`, `ragstore.json`, `BESTPRACTICES.md`, `IMPROVEMENTPROPOSALS.md`, `IMPROVEMENTLOG.md`, `activitylog.jsonl`, plus report, upload, and knowledge-base directories.

## Proposed component map

```text
Browser UI
  ├─ React App Shell
  ├─ 3D Boardroom Scene
  ├─ Activity Feed
  ├─ Managers / Settings / KB / FS
  └─ WebSocket Event Store
          │
          ▼
FastAPI Backend
  ├─ REST Endpoints
  ├─ WebSocket Broadcaster
  ├─ Job Lifecycle Controller
  └─ Config / Registry Services
          │
          ▼
Orchestration Runtime
  ├─ Crew Builder
  ├─ Intent Detection
  ├─ Task Pipeline
  ├─ Model Selection
  └─ Custom Agent / Tool Injection
          │
          ▼
Capability Services
  ├─ Web Search Providers
  ├─ RAG Engine
  ├─ File Upload Readers
  ├─ Filesystem Tools
  ├─ Telegram Notifier
  └─ Self-Improver Scheduler
          │
          ▼
Persistent Storage
```

## Runtime sequences

### Research job
1. The user launches a research job from the frontend.
2. FastAPI receives the job request and pushes WebSocket activity messages during execution.
3. The coordinator scopes the problem, researcher gathers data, analyst extracts insights and confidence, and writer formats the final report, after which custom agents may run with the full report as context.
4. The final report is saved to `backend/reports` in a format selected by the writer, with metadata appended.

### Quick query
1. The system classifies query intent before external retrieval.
2. It routes stock, weather, currency, news, time, wiki, or general queries to the correct provider with a fixed priority order.
3. The result is returned through a single-agent direct-answer path rather than the full research pipeline.

### File analysis
1. The user uploads one or more files.
2. Agents read uploaded content through file tools and may combine that with knowledge-base search and analysis.
3. The writer produces the final structured output and persists the report.

## Data contracts to formalize
The repo should standardize these internal contracts:
- `JobRequest`: `job_id`, `mode`, `topic`, `uploaded_files`, `requested_format`, `operator_flags`.
- `AgentRuntimeEvent`: `type`, `agent`, `label`, `role`, `message`, `ts`, `phase`, `taskresult`, `color`.
- `ToolResultEnvelope`: `status`, `source`, `provider`, `payload`, `error`, `confidence`, `latency_ms`.
- `PersistedDefinition`: shared schema for custom agents and tools with `id`, `name`, `description`, `active`, `version`, `updated_at`.
These contracts are consistent with the documented WebSocket events, registry behavior, and metadata-aware outputs.

## Architecture recommendations

### Separate domains
Use explicit package boundaries for `orchestration`, `capabilities`, `governance`, `transport`, and `persistence` to make the backend easier to evolve while preserving the current feature set. This matches the repo's already distinct modules for crews, registries, web search, RAG, filesystem control, and self-improvement.

### Centralize policy checks
Spawn approval, filesystem ACLs, and external web access are all governed by toggles or approvals in the current design. A shared policy service would make those checks consistent across UI actions, agent tool calls, and background automations.

### Normalize events
The frontend should consume a typed event stream where all WebSocket messages are normalized into one schema and routed through a central state reducer. The README already defines concrete event kinds such as `agentactivity`, `agentworking`, `jobdone`, `jobfailed`, `spawnrequest`, `toolspawnrequest`, and config update messages.

## Deployment view
The documented default deployment is local development with Ollama on port 11434, FastAPI on port 8000, and Vite on port 5173. The platform is optimized for Apple Silicon and is designed to work offline for the core LLM pipeline, with optional provider-based live search and Telegram integration.
