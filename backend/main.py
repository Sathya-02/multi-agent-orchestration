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
from typing import Optional
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
    # Very short, tool-friendly expression only
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

    # Mimic normal job events so the UI stays in sync
    sync_broadcast({
        "type": "job_status",
        "job_id": job_id,
        "status": "running",
        "topic": topic,
        "mode": mode,
        "model": get_active_model(),
    })
    sync_broadcast({
        "type": "agent_activity",
        "agent": "coordinator",
        "label": _label("coordinator"),
        "message": f"Direct calculator answer: {result[:120]}",
        "ts": time.time(),
    })
    sync_broadcast({
        "type": "job_done",
        "job_id": job_id,
        "result": result,
        "filename": "",
        "format": "txt",
    })
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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Depends, HTTPException
from starlette.websockets import WebSocketDisconnect as StarletteWSDC
try:
    from uvicorn.protocols.utils import ClientDisconnected
except ImportError:
    ClientDisconnected = ConnectionError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from crewai import Crew, Process

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

if REQUIRE_API_KEY:
    from infra.auth import require_auth, User
    _auth_dep = Depends(require_auth)
else:
    # No-op dependency when auth is disabled
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
        for ws in list(self.active):   # copy list — may mutate during iteration
            try:
                await ws.send_json(msg)
            except Exception:          # catches ClientDisconnected, WS errors, etc.
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

manager   = ConnectionManager()
_loop: asyncio.AbstractEventLoop | None = None

# ── Message buffer: stores last 200 events so reconnecting clients can catch up
import collections
_msg_buffer: collections.deque = collections.deque(maxlen=200)
_msg_buffer_lock = threading.Lock()


def sync_broadcast(msg: dict):
    """Broadcast to all connected WebSocket clients and buffer the message."""
    # Add timestamp if missing
    if "ts" not in msg:
        msg = {"ts": time.time(), **msg}
    # Buffer every event (except pong/stats)
    if msg.get("type") not in ("pong", "stats"):
        with _msg_buffer_lock:
            _msg_buffer.append(msg)
    if _loop and not _loop.is_closed():
        asyncio.run_coroutine_threadsafe(manager.broadcast(msg), _loop)


# ── Token counter ─────────────────────────────────────────────────────────
_token_stats = {"total_in": 0, "total_out": 0, "last_job": 0}

# ͒͒ Database helpers for admin/user APIs ͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒
_DATABASE_URL = os.getenv("DATABASE_URL", "")


def _get_db_conn():
    if not _DATABASE_URL:
        raise RuntimeError("DATABASE_URL not configured for admin APIs")
    return psycopg2.connect(_DATABASE_URL)


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
# (rest of file unchanged down to WebSocket endpoint, then admin block appended)

# ͒͒ Admin: users & roles (API-key only) ͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒͒
class AdminUserUpdate(BaseModel):
    plan: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


@app.get("/admin/users")
def list_users_admin(limit: int = 100, offset: int = 0, current_user=_auth_dep):
    # List all registered users with plan, role, and active flag.
    # When REQUIRE_API_KEY=true, this endpoint requires an admin API key.
    if REQUIRE_API_KEY and (current_user is None or not getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=403, detail="Admin API key required")

    conn = _get_db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, email, name, plan,
               COALESCE(role, 'user') AS role,
               active, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
        """,
        (max(1, min(limit, 500)), max(0, offset)),
    )
    rows = cur.fetchall()
    cur.close(); conn.close()

    return [
        {
            "id": str(r[0]),
            "email": r[1],
            "name": r[2],
            "plan": r[3],
            "role": r[4],
            "active": r[5],
            "created_at": r[6],
            "updated_at": r[7],
        }
        for r in rows
    ]


@app.patch("/admin/users/{user_id}")
def update_user_admin(user_id: str, body: AdminUserUpdate, current_user=_auth_dep):
    # Update a user's plan, role, or active flag. Admin API key required when REQUIRE_API_KEY=true.
    if REQUIRE_API_KEY and (current_user is None or not getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=403, detail="Admin API key required")

    fields: dict[str, object] = {}
    if body.plan is not None:
        fields["plan"] = body.plan
    if body.role is not None:
        fields["role"] = body.role
    if body.active is not None:
        fields["active"] = body.active

    if not fields:
        return {"updated": False, "reason": "No changes provided"}

    sets = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values())
    values.append(user_id)

    conn = _get_db_conn()
    cur = conn.cursor()
    cur.execute(f"UPDATE users SET {sets}, updated_at = NOW() WHERE id = %s", values)
    updated = cur.rowcount
    conn.commit()
    cur.close(); conn.close()

    if not updated:
        raise HTTPException(status_code=404, detail="User not found")

    return {"updated": True}
