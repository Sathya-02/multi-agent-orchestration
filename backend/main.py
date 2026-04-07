"""
main.py — Multi Agent Orchestration v7.0.0
==========================================
Entry point for the FastAPI server.

All configuration is in settings.py.
All subsystems are in their own module:
  agents/     — agent definitions, registry, crew building, tasks
  tools/      — tool definitions, registry, built-in implementations
  rag/        — knowledge base, embeddings, retrieval
  config/     — model config, LLM preset management
  spawner/    — agent and tool spawn request queues
  filesystem/ — ACL, audit log, file operation tools
  telegram/   — bot config, commands, push notifications
  infra/      — auth (API keys), billing (Stripe), DB helpers

To change system behaviour, edit settings.py or the relevant module's
definitions.py file. You should rarely need to touch this file.
"""
import asyncio, json, logging, io, threading, time, uuid, re, shutil
import os, psutil, requests, psycopg2
from contextlib import redirect_stdout
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from tools import MathTool  # re-use your existing calculator tool
from settings import (
    RAG_ENABLED, RAG_EMBED_MODEL, RAG_CHUNK_SIZE,
    RAG_CHUNK_OVERLAP, RAG_TOP_K, RAG_MIN_SCORE, RAG_USE_OLLAMA_EMBED,
)

_SIMPLE_EXPR_RE = re.compile(
    r"^[0-9\s\+\-\*/\.\(\)^%sqrtlogpiecosintanabsround,]+$", re.IGNORECASE
)

def _maybe_handle_simple_math(topic: str, mode: str, job_id: str) -> bool:
    """
    If this is a very simple math query in quick-query mode, answer it
    synchronously using MathTool instead of running a full Crew.
    Returns True if handled.
    """
    if mode != "query":
        return False
    expr = topic.strip()
    if len(expr) > 64:
        return False
    if not _SIMPLE_EXPR_RE.match(expr):
        return False

    tool = MathTool()
    result = tool._run(expression=expr)

    jobs[job_id]["status"] = "done"
    jobs[job_id]["result"] = result
    jobs[job_id]["filename"] = ""
    jobs[job_id]["format"] = "text/plain"

    sync_broadcast({"type": "job_status", "job_id": job_id, "status": "running",
                    "topic": topic, "mode": mode, "model": get_active_model()})
    sync_broadcast({"type": "agent_activity", "agent": "coordinator",
                    "label": _label("coordinator"),
                    "message": f"Direct calculator answer: {result[:120]}",
                    "ts": time.time()})
    sync_broadcast({"type": "job_done", "job_id": job_id, "result": result,
                    "filename": "", "format": "txt"})
    return True

# ── Settings — must be imported before any subsystem ──────────────────────
from settings import (
    ensure_dirs,
    BASE_DIR, REPORTS_DIR, UPLOADS_DIR,
    API_TITLE, API_VERSION,
    ALLOWED_ORIGINS,
    SUPPORTED_FORMATS, DEFAULT_REPORT_FORMAT,
    REQUIRE_API_KEY,
    JOB_TIMEOUT_SECONDS,
    SEARCH_ENABLED, RAG_ENABLED, TELEGRAM_ENABLED,
    SELF_IMPROVER_ENABLED, STATS_ENABLED, FILESYSTEM_ENABLED,
)
ensure_dirs()

# ── Logging setup ─────────────────────────────────────────────────────────
from settings import LOG_LEVEL
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("main")

# ── FastAPI ───────────────────────────────────────────────────────────────
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Depends, HTTPException, Request, Query
from starlette.websockets import WebSocketDisconnect as StarletteWSDC
from starlette.websockets import WebSocketState
try:
    from uvicorn.protocols.utils import ClientDisconnected
except ImportError:
    ClientDisconnected = ConnectionError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel
from crewai import Crew, Process
import collections

# ── Sub-system imports ────────────────────────────────────────────────────
from config.model import get_active_model, set_active_model, get_llm_config, list_presets
from agents.registry import (
    get_all_agents, get_active_agents, get_agent, find_agent_by_role,
    role_exists, add_agent, update_agent, remove_agent, set_agent_active,
    get_skills_text, save_skills_text, ensure_skills_files, read_skills_file,
)
from agents.crew  import build_agents
from agents.tasks import build_tasks
from tools.registry import (
    get_all_tools, get_active_tools, get_tool, find_tool_by_name, name_exists,
    add_tool, update_tool, remove_tool, set_tool_active,
    get_tool_md_text, save_tool_md_text, ensure_tool_files,
)
from spawner.config import (
    is_agent_spawn_enabled, set_agent_spawn_enabled,
    is_tool_spawn_enabled,  set_tool_spawn_enabled, get_spawn_status,
)
from spawner.agents import request_spawn, get_pending_spawns, resolve_spawn
from spawner.tools  import request_tool_spawn, get_pending_tool_spawns, resolve_tool_spawn

if RAG_ENABLED:
    from rag.engine import (
        load_kb_config, save_kb_config, get_all_entries, get_entry_count,
        delete_entry, delete_source, clear_store, list_sources,
        ingest_file, ingest_text, search as kb_search, _load_store, KB_DIR,
        query_rag,
    )

if FILESYSTEM_ENABLED:
    from filesystem.config import (
        get_output_dir, set_output_dir, get_access_list,
        add_access_entry, remove_access_entry, update_access_entry, get_audit_log,
    )

# ── Auth dependency — honours REQUIRE_API_KEY env var ─────────────────────
# When REQUIRE_API_KEY=false (default for local), all endpoints are open.
# When true (cloud/prod), API key OR session cookie is required.
from infra.auth import require_auth, optional_auth, User

if REQUIRE_API_KEY:
    _auth_dep = Depends(require_auth)
else:
    async def _no_auth(): return None
    _auth_dep = Depends(_no_auth)

# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(title=API_TITLE, version=API_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WebSocket manager ──────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, msg: dict):
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

manager   = ConnectionManager()
_loop: asyncio.AbstractEventLoop | None = None

# ── Message buffer ─────────────────────────────────────────────────────────
_msg_buffer: collections.deque = collections.deque(maxlen=200)
_msg_buffer_lock = threading.Lock()


def sync_broadcast(msg: dict):
    """Broadcast to all connected WebSocket clients and buffer the message."""
    if "ts" not in msg:
        msg = {"ts": time.time(), **msg}
    if msg.get("type") not in ("pong", "stats"):
        with _msg_buffer_lock:
            _msg_buffer.append(msg)
    if _loop and not _loop.is_closed():
        asyncio.run_coroutine_threadsafe(manager.broadcast(msg), _loop)


# ── Token counter ─────────────────────────────────────────────────────────
_token_stats = {"total_in": 0, "total_out": 0, "last_job": 0}

# ── DB helper ─────────────────────────────────────────────────────────────
_DATABASE_URL = os.getenv("DATABASE_URL", "")

def _get_db_conn():
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL not configured for admin APIs")
    return psycopg2.connect(_DATABASE_URL)


# ── Token counter utility ─────────────────────────────────────────────────
def count_tokens(text: str) -> int:
    return max(1, len(text) // 4)


# ── CrewAI stdout capture ─────────────────────────────────────────────────
NOISE_RE = re.compile(
    r"entering new.*chain|pydantic|deprecat|warning:|^\[1m|^\[32m|^\[91m",
    re.IGNORECASE,
)

class StreamCapture(io.StringIO):
    def __init__(self, agent_id: str = "system"):
        super().__init__()
        self._aid = agent_id

    def write(self, text: str) -> int:
        if text and text.strip() and not NOISE_RE.search(text):
            clean = text.strip()[:400]
            _token_stats["total_out"] += count_tokens(clean)
            sync_broadcast({
                "type": "agent_activity", "agent": self._aid,
                "label": _label(self._aid), "message": clean, "ts": time.time(),
            })
        return super().write(text)


def _label(agent_id: str) -> str:
    a = get_agent(agent_id)
    if a:
        return f"{a.get('icon','🤖')} {a.get('label', agent_id.title())}"
    fallback = {
        "coordinator": "🎯 Coordinator", "researcher": "🔍 Researcher",
        "analyst": "📊 Analyst",         "writer": "✍️  Writer",
        "system": "⚙️  System",
    }
    return fallback.get(agent_id, f"🤖 {agent_id.title()}")


# ── Report format detection ────────────────────────────────────────────────
def detect_format(raw: str) -> str:
    raw_lower = raw.lower()
    for fmt in SUPPORTED_FORMATS:
        if fmt in raw_lower:
            return fmt
    return DEFAULT_REPORT_FORMAT


# ── In-memory job store ────────────────────────────────────────────────────
jobs: dict[str, dict] = {}


# ── Pydantic models ────────────────────────────────────────────────────────
class JobRequest(BaseModel):
    topic: str
    mode: str = "research"   # research | query | code | analysis
    format: Optional[str] = None
    use_rag: bool = False

class ModelSelect(BaseModel):
    model: str

class SpawnResolve(BaseModel):
    action: str  # approve | reject
    data: Optional[dict] = None

class KBIngestText(BaseModel):
    text: str
    source: str = "manual"
    tags: List[str] = []

class KBConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    top_k: Optional[int] = None
    min_score: Optional[float] = None
    embed_model: Optional[str] = None

class FsConfigUpdate(BaseModel):
    output_dir: Optional[str] = None
    access: Optional[list] = None

class AdminUserUpdate(BaseModel):
    plan: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


# ══════════════════════════════════════════════════════════════════════════
# STARTUP
# ══════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup_event():
    global _loop
    _loop = asyncio.get_event_loop()
    logger.info(f"MAO v{API_VERSION} started | REQUIRE_API_KEY={REQUIRE_API_KEY}")


# ══════════════════════════════════════════════════════════════════════════
# WEBSOCKET  /ws
# Fix: honours REQUIRE_API_KEY=false so local dev never gets 403
# When auth is ON, accepts ?key= query param OR mao_session cookie
# ══════════════════════════════════════════════════════════════════════════

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, key: Optional[str] = Query(default=None)):
    # ── Auth check ────────────────────────────────────────────────────────
    if REQUIRE_API_KEY:
        # Try API key from query param first, then session cookie
        authed = False
        if key:
            from infra.auth import _verify_master_key, _verify_db_key
            authed = bool(_verify_master_key(key) or _verify_db_key(key))
        if not authed:
            # Try session cookie (Google OAuth login)
            try:
                from infra.oauth import get_user_from_request
                user = get_user_from_request(websocket)
                authed = user is not None
            except ImportError:
                pass
        if not authed:
            await websocket.close(code=4001)
            return
    # ── Accept + replay buffer ────────────────────────────────────────────
    await manager.connect(websocket)
    logger.info(f"WS connected from {websocket.client}")
    # Replay last 200 buffered messages so reconnecting clients catch up
    with _msg_buffer_lock:
        buffered = list(_msg_buffer)
    for msg in buffered:
        try:
            await websocket.send_json(msg)
        except Exception:
            break
    # ── Message loop ──────────────────────────────────────────────────────
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong", "ts": time.time()})
    except (WebSocketDisconnect, StarletteWSDC, Exception):
        pass
    finally:
        manager.disconnect(websocket)
        logger.info(f"WS disconnected from {websocket.client}")


# ══════════════════════════════════════════════════════════════════════════
# HEALTH  /health
# ══════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "version": API_VERSION}


# ══════════════════════════════════════════════════════════════════════════
# STATS  /stats
# ══════════════════════════════════════════════════════════════════════════

@app.get("/stats")
def get_stats(current_user=_auth_dep):
    if not STATS_ENABLED:
        raise HTTPException(status_code=404, detail="Stats disabled")
    try:
        cpu    = psutil.cpu_percent(interval=0.1)
        mem    = psutil.virtual_memory()
        disk   = psutil.disk_usage("/")
    except Exception:
        cpu, mem, disk = 0, None, None

    running = sum(1 for j in jobs.values() if j.get("status") == "running")
    done    = sum(1 for j in jobs.values() if j.get("status") == "done")
    failed  = sum(1 for j in jobs.values() if j.get("status") == "failed")

    ram_used_gb  = round(mem.used     / 1_073_741_824, 1) if mem else 0
    ram_total_gb = round(mem.total    / 1_073_741_824, 1) if mem else 0
    ram_free_gb  = round(mem.available/ 1_073_741_824, 1) if mem else 0
    ram_pct      = round(mem.percent, 1)                   if mem else 0
    disk_used_gb = round(disk.used    / 1_073_741_824, 1) if disk else 0
    disk_total_gb= round(disk.total   / 1_073_741_824, 1) if disk else 0
    disk_pct     = round(disk.percent, 1)                  if disk else 0
    ollama_info  = {"model": get_active_model(), "vram_mb": 0}
    try:
        import requests as _req
        ps = _req.get("http://localhost:11434/api/ps", timeout=1).json()
        if ps.get("models"):
            m = ps["models"][0]
            ollama_info = {"model": m.get("name", get_active_model()), "vram_mb": round(m.get("size_vram", 0) / 1_048_576)}
    except Exception:
        pass
    return {
        "cpu_pct": cpu, "ram_used_gb": ram_used_gb, "ram_total_gb": ram_total_gb,
        "ram_free_gb": ram_free_gb, "ram_pct": ram_pct,
        "disk_used_gb": disk_used_gb, "disk_total_gb": disk_total_gb, "disk_pct": disk_pct,
        "active_jobs": running, "total_jobs": running + done + failed,
        "tokens_in": _token_stats["total_in"], "tokens_out": _token_stats["total_out"],
        "tokens_last": _token_stats.get("last_out", 0), "ollama": ollama_info,
        "ws_clients": len(manager.active), "mem_used_mb": round(mem.used / 1_048_576) if mem else 0,
        "mem_total_mb": round(mem.total / 1_048_576) if mem else 0,
        "jobs_running": running, "jobs_done": done, "jobs_failed": failed,
        "uptime_s": round(time.time() - _start_time),
    }

_start_time = time.time()


# ══════════════════════════════════════════════════════════════════════════
# MODELS  /models  /models/select  /models/presets
# ══════════════════════════════════════════════════════════════════════════

@app.get("/models")
def list_models(current_user=_auth_dep):
    return {
        "active":  get_active_model(),
        "presets": list_presets(),
    }

@app.post("/models/select")
def select_model(body: ModelSelect, current_user=_auth_dep):
    set_active_model(body.model)
    sync_broadcast({"type": "model_changed", "model": body.model})
    return {"active": body.model}

@app.get("/models/presets")
def get_presets(current_user=_auth_dep):
    return list_presets()


# ══════════════════════════════════════════════════════════════════════════
# AGENTS  /agents
# ══════════════════════════════════════════════════════════════════════════

@app.get("/agents")
def list_agents(current_user=_auth_dep):
    return get_all_agents()

@app.post("/agents")
def create_agent(body: dict, current_user=_auth_dep):
    agent = add_agent(body)
    sync_broadcast({"type": "agents_updated"})
    return agent

@app.put("/agents/{agent_id}")
def update_agent_endpoint(agent_id: str, body: dict, current_user=_auth_dep):
    agent = update_agent(agent_id, body)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    sync_broadcast({"type": "agents_updated"})
    return agent

@app.delete("/agents/{agent_id}")
def delete_agent(agent_id: str, current_user=_auth_dep):
    ok = remove_agent(agent_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Agent not found")
    sync_broadcast({"type": "agents_updated"})
    return {"deleted": agent_id}

@app.patch("/agents/{agent_id}/active")
def toggle_agent(agent_id: str, body: dict, current_user=_auth_dep):
    set_agent_active(agent_id, body.get("active", True))
    sync_broadcast({"type": "agents_updated"})
    return {"ok": True}

@app.get("/agents/{agent_id}/skills")
def get_agent_skills(agent_id: str, current_user=_auth_dep):
    return {"text": get_skills_text(agent_id)}

@app.put("/agents/{agent_id}/skills")
def save_agent_skills(agent_id: str, body: dict, current_user=_auth_dep):
    save_skills_text(agent_id, body.get("text", ""))
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# TOOLS  /tools
# ══════════════════════════════════════════════════════════════════════════

@app.get("/tools")
def list_tools(current_user=_auth_dep):
    return get_all_tools()

@app.post("/tools")
def create_tool(body: dict, current_user=_auth_dep):
    tool = add_tool(body)
    sync_broadcast({"type": "tools_updated"})
    return tool

@app.put("/tools/{tool_id}")
def update_tool_endpoint(tool_id: str, body: dict, current_user=_auth_dep):
    tool = update_tool(tool_id, body)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    sync_broadcast({"type": "tools_updated"})
    return tool

@app.delete("/tools/{tool_id}")
def delete_tool(tool_id: str, current_user=_auth_dep):
    ok = remove_tool(tool_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Tool not found")
    sync_broadcast({"type": "tools_updated"})
    return {"deleted": tool_id}

@app.patch("/tools/{tool_id}/active")
def toggle_tool(tool_id: str, body: dict, current_user=_auth_dep):
    set_tool_active(tool_id, body.get("active", True))
    sync_broadcast({"type": "tools_updated"})
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# UPLOADS  /uploads  /upload
# ══════════════════════════════════════════════════════════════════════════

@app.get("/uploads")
def list_uploads(current_user=_auth_dep):
    files = []
    for f in sorted(UPLOADS_DIR.glob("*")):
        if f.is_file():
            stat = f.stat()
            files.append({
                "name": f.name,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    return files

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user=_auth_dep):
    dest = UPLOADS_DIR / file.filename
    with open(dest, "wb") as fh:
        shutil.copyfileobj(file.file, fh)
    sync_broadcast({"type": "upload_done", "name": file.filename})
    return {"filename": file.filename, "size": dest.stat().st_size}

@app.delete("/uploads/{filename}")
def delete_upload(filename: str, current_user=_auth_dep):
    target = UPLOADS_DIR / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    target.unlink()
    return {"deleted": filename}


# ══════════════════════════════════════════════════════════════════════════
# SPAWN SETTINGS  /spawn-settings  /tool-spawns
# ══════════════════════════════════════════════════════════════════════════

@app.get("/spawn-settings")
def spawn_settings(current_user=_auth_dep):
    return get_spawn_status()

@app.put("/spawn-settings")
def update_spawn_settings(body: dict, current_user=_auth_dep):
    if "agent_spawn_enabled" in body:
        set_agent_spawn_enabled(bool(body["agent_spawn_enabled"]))
    if "tool_spawn_enabled" in body:
        set_tool_spawn_enabled(bool(body["tool_spawn_enabled"]))
    return get_spawn_status()

@app.get("/tool-spawns")
def list_tool_spawns(current_user=_auth_dep):
    return get_pending_tool_spawns()

@app.post("/tool-spawns/{spawn_id}/resolve")
def resolve_tool_spawn_endpoint(spawn_id: str, body: SpawnResolve, current_user=_auth_dep):
    resolve_tool_spawn(spawn_id, body.action, body.data or {})
    sync_broadcast({"type": "tool_spawns_updated"})
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# FILESYSTEM CONFIG  /fs-config
# ══════════════════════════════════════════════════════════════════════════

@app.get("/fs-config")
def get_fs_config(current_user=_auth_dep):
    if not FILESYSTEM_ENABLED:
        raise HTTPException(status_code=404, detail="Filesystem feature disabled")
    return {
        "output_dir": str(get_output_dir()),
        "access":     get_access_list(),
    }

@app.put("/fs-config")
def update_fs_config(body: FsConfigUpdate, current_user=_auth_dep):
    if not FILESYSTEM_ENABLED:
        raise HTTPException(status_code=404, detail="Filesystem feature disabled")
    if body.output_dir is not None:
        set_output_dir(body.output_dir)
    if body.access is not None:
        for entry in body.access:
            add_access_entry(entry)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# KNOWLEDGE BASE  /kb/*
# ══════════════════════════════════════════════════════════════════════════

@app.get("/kb/entries")
def kb_list_entries(current_user=_auth_dep):
    if not RAG_ENABLED:
        return []
    return get_all_entries()

@app.get("/kb/config")
def kb_get_config(current_user=_auth_dep):
    if not RAG_ENABLED:
        return {"enabled": False}
    return load_kb_config()

@app.put("/kb/config")
def kb_update_config(body: KBConfigUpdate, current_user=_auth_dep):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    cfg = load_kb_config()
    if body.enabled  is not None: cfg["enabled"]     = body.enabled
    if body.top_k    is not None: cfg["top_k"]       = body.top_k
    if body.min_score is not None: cfg["min_score"]  = body.min_score
    if body.embed_model is not None: cfg["embed_model"] = body.embed_model
    save_kb_config(cfg)
    return cfg

@app.post("/kb/ingest/text")
def kb_ingest_text_endpoint(body: KBIngestText, current_user=_auth_dep):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    count = ingest_text(body.text, source=body.source, tags=body.tags)
    return {"chunks_added": count}

@app.post("/kb/ingest/file")
async def kb_ingest_file(file: UploadFile = File(...), current_user=_auth_dep):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    dest = KB_DIR / file.filename
    with open(dest, "wb") as fh:
        shutil.copyfileobj(file.file, fh)
    count = ingest_file(dest)
    return {"filename": file.filename, "chunks_added": count}

@app.delete("/kb/entries/{entry_id}")
def kb_delete_entry(entry_id: str, current_user=_auth_dep):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    delete_entry(entry_id)
    return {"deleted": entry_id}

@app.delete("/kb/source/{source}")
def kb_delete_source(source: str, current_user=_auth_dep):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    delete_source(source)
    return {"deleted_source": source}

@app.post("/kb/clear")
def kb_clear(current_user=_auth_dep):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    clear_store()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# TELEGRAM CONFIG  /telegram/config
# ══════════════════════════════════════════════════════════════════════════

@app.get("/telegram/config")
def get_telegram_config(current_user=_auth_dep):
    if not TELEGRAM_ENABLED:
        return {"enabled": False}
    from telegram.config import load_telegram_config
    return load_telegram_config()

@app.put("/telegram/config")
def update_telegram_config(body: dict, current_user=_auth_dep):
    if not TELEGRAM_ENABLED:
        raise HTTPException(status_code=404, detail="Telegram disabled")
    from telegram.config import save_telegram_config
    save_telegram_config(body)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# SELF-IMPROVER CONFIG  /self-improver/config
# ══════════════════════════════════════════════════════════════════════════

@app.get("/self-improver/config")
def get_self_improver_config(current_user=_auth_dep):
    if not SELF_IMPROVER_ENABLED:
        return {"enabled": False}
    try:
        from settings import SELF_IMPROVER_CFG_FILE
        if SELF_IMPROVER_CFG_FILE.exists():
            return json.loads(SELF_IMPROVER_CFG_FILE.read_text())
    except Exception:
        pass
    return {"enabled": True, "interval_hours": 6, "auto_apply": True}

@app.put("/self-improver/config")
def update_self_improver_config(body: dict, current_user=_auth_dep):
    if not SELF_IMPROVER_ENABLED:
        raise HTTPException(status_code=404, detail="Self-improver disabled")
    from settings import SELF_IMPROVER_CFG_FILE
    SELF_IMPROVER_CFG_FILE.write_text(json.dumps(body, indent=2))
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# WEB SEARCH CONFIG  /web-search/config
# ══════════════════════════════════════════════════════════════════════════

@app.get("/web-search/config")
def get_web_search_config(current_user=_auth_dep):
    if not SEARCH_ENABLED:
        return {"enabled": False}
    from settings import WEB_SEARCH_CFG_FILE
    if WEB_SEARCH_CFG_FILE.exists():
        return json.loads(WEB_SEARCH_CFG_FILE.read_text())
    return {"enabled": True, "provider": "auto", "max_results": 5}

@app.put("/web-search/config")
def update_web_search_config(body: dict, current_user=_auth_dep):
    from settings import WEB_SEARCH_CFG_FILE
    WEB_SEARCH_CFG_FILE.write_text(json.dumps(body, indent=2))
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# JOB EXECUTION  /run  /job/{id}  /download/{filename}
# ══════════════════════════════════════════════════════════════════════════

# Models known to be too small for multi-agent pipelines (< 1B params or
# very low num_predict).  These trigger a clearer error hint.
_SMALL_MODELS = {"phi3:mini", "phi3", "tinyllama", "tinyllama:latest",
                 "qwen:0.5b", "qwen2:0.5b"}


def _classify_job_error(exc: Exception, model: str, mode: str) -> str:
    """Return a human-readable error string, including upgrade hints."""
    msg = str(exc)
    low = msg.lower()

    # TypeError from calling build_agents with wrong arity (legacy guard)
    if isinstance(exc, TypeError) and "argument" in low:
        return (
            f"Internal error: {msg}  "
            "(Hint: build_agents() signature mismatch — check agents_crew.py)"
        )

    # Model context / token overflow
    if any(kw in low for kw in ("context", "token", "num_predict", "length",
                                  "exceed", "too long", "max_tokens")):
        hint = (f" Switch from '{model}' to llama3.2:3b or larger for '{mode}' mode."
                if model in _SMALL_MODELS else " Try a larger model.")
        return f"Model capacity exceeded.{hint}  ({msg[:200]})"

    # Small model used for a heavy pipeline
    if model in _SMALL_MODELS and mode in ("research", "analysis", "code"):
        return (
            f"'{model}' is too small for '{mode}' mode (context limit ~512 tokens). "
            f"Switch to llama3.2:3b or larger.  Original error: {msg[:200]}"
        )

    return msg


@app.post("/run")
def create_job(req: JobRequest, current_user=_auth_dep):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "queued", "result": None, "filename": "",
                    "format": "text/plain", "topic": req.topic}

    if _maybe_handle_simple_math(req.topic, req.mode, job_id):
        return {"job_id": job_id}

    def run_crew():
        jobs[job_id]["status"] = "running"
        model = get_active_model()
        sync_broadcast({"type": "job_status", "job_id": job_id, "status": "running",
                        "topic": req.topic, "mode": req.mode, "model": model})
        try:
            # FIX: build_agents now accepts an optional mode param — no TypeError
            agents   = build_agents(req.mode)
            tasks    = build_tasks(req.topic, agents, req.mode, req.use_rag)
            crew     = Crew(agents=list(agents.values()), tasks=tasks,
                            process=Process.sequential, verbose=False)
            cap = StreamCapture("coordinator")
            with redirect_stdout(cap):
                raw_result = crew.kickoff()
            result = str(raw_result)

            fmt = req.format or detect_format(result)
            ext = SUPPORTED_FORMATS.get(fmt, ("text/plain", ".txt"))[1]
            ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
            slug = re.sub(r"[^\w]", "_", req.topic[:40])
            fname = f"report_{ts}_{slug}{ext}"
            fpath = REPORTS_DIR / fname
            fpath.write_text(result, encoding="utf-8")

            jobs[job_id].update({"status": "done", "result": result,
                                  "filename": fname, "format": fmt})
            sync_broadcast({"type": "job_done", "job_id": job_id,
                            "result": result, "filename": fname, "format": fmt})
        except Exception as exc:
            logger.exception(f"Job {job_id} failed")
            err_msg = _classify_job_error(exc, model, req.mode)
            jobs[job_id].update({"status": "failed", "result": err_msg})
            sync_broadcast({"type": "job_failed", "job_id": job_id, "error": err_msg})

    t = threading.Thread(target=run_crew, daemon=True)
    t.start()
    return {"job_id": job_id}


@app.get("/job/{job_id}")
def get_job(job_id: str, current_user=_auth_dep):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/download/{filename}")
def download_report(filename: str, current_user=_auth_dep):
    # Prevent path traversal
    safe = Path(filename).name
    fpath = REPORTS_DIR / safe
    if not fpath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    mime = SUPPORTED_FORMATS.get(fpath.suffix.lstrip("."), ("text/plain", ""))[0]
    return FileResponse(str(fpath), media_type=mime, filename=safe)


# ══════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS  /auth/*
# These are no-ops when Google OAuth env vars are not configured.
# When GOOGLE_CLIENT_ID is set, they enable full OAuth2 login flow.
# ══════════════════════════════════════════════════════════════════════════

_OAUTH_AVAILABLE = bool(os.getenv("GOOGLE_CLIENT_ID"))

if _OAUTH_AVAILABLE:
    try:
        from infra.oauth import (
            build_google_auth_url, exchange_code_for_tokens,
            get_id_token_info, _find_or_create_user,
            _create_session_token, set_session_cookie,
            clear_session_cookie, get_user_from_request,
        )

        @app.get("/auth/login/google")
        def auth_login_google():
            url = build_google_auth_url(state="mao")
            return RedirectResponse(url)

        @app.get("/auth/callback/google")
        def auth_callback_google(code: str = "", state: str = ""):
            if not code:
                raise HTTPException(status_code=400, detail="Missing code")
            tokens   = exchange_code_for_tokens(code)
            id_token = tokens.get("id_token")
            if not id_token:
                raise HTTPException(status_code=400, detail="No ID token")
            info  = get_id_token_info(id_token)
            email = info.get("email")
            name  = info.get("name")
            if not email:
                raise HTTPException(status_code=400, detail="No email from Google")
            user  = _find_or_create_user(email=email, name=name)
            token = _create_session_token(user)
            resp  = RedirectResponse(url="/")
            set_session_cookie(resp, token)
            return resp

        @app.get("/auth/me")
        def auth_me(request: Request):
            user = get_user_from_request(request)
            if not user:
                raise HTTPException(status_code=401, detail="Not authenticated")
            return user.dict()

        @app.post("/auth/logout")
        def auth_logout():
            resp = JSONResponse({"status": "ok"})
            clear_session_cookie(resp)
            return resp

        logger.info("Google OAuth routes registered (/auth/login/google, /auth/callback/google)")

    except ImportError as e:
        logger.warning(f"OAuth module not available: {e}. Run: pip install PyJWT requests")
else:
    # Stub /auth/me so the frontend always gets a valid response in local mode
    @app.get("/auth/me")
    def auth_me_local():
        return {"id": "local", "email": "local@localhost", "plan": "enterprise",
                "is_admin": True, "name": "Local Dev"}

    @app.post("/auth/logout")
    def auth_logout_local():
        return {"status": "ok"}


# ══════════════════════════════════════════════════════════════════════════
# ADMIN  /admin/users
# ══════════════════════════════════════════════════════════════════════════

@app.get("/admin/users")
def list_users_admin(limit: int = 100, offset: int = 0, current_user=_auth_dep):
    if REQUIRE_API_KEY and (current_user is None or not getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=403, detail="Admin API key required")
    conn = _get_db_conn()
    cur  = conn.cursor()
    cur.execute(
        """
        SELECT id, email, name, plan,
               COALESCE(role, 'user') AS role,
               active, created_at, updated_at
        FROM users ORDER BY created_at DESC
        LIMIT %s OFFSET %s
        """,
        (max(1, min(limit, 500)), max(0, offset)),
    )
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {"id": str(r[0]), "email": r[1], "name": r[2], "plan": r[3],
         "role": r[4], "active": r[5], "created_at": r[6], "updated_at": r[7]}
        for r in rows
    ]

@app.patch("/admin/users/{user_id}")
def update_user_admin(user_id: str, body: AdminUserUpdate, current_user=_auth_dep):
    if REQUIRE_API_KEY and (current_user is None or not getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=403, detail="Admin API key required")
    fields: dict = {}
    if body.plan   is not None: fields["plan"]   = body.plan
    if body.role   is not None: fields["role"]   = body.role
    if body.active is not None: fields["active"] = body.active
    if not fields:
        return {"updated": False, "reason": "No changes"}
    sets   = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values()) + [user_id]
    conn = _get_db_conn()
    cur  = conn.cursor()
    cur.execute(f"UPDATE users SET {sets}, updated_at = NOW() WHERE id = %s", values)
    updated = cur.rowcount
    conn.commit(); cur.close(); conn.close()
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {"updated": True}
