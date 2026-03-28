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
import os, psutil, requests
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
        msg = {**msg, "ts": time.time()}
    # Buffer every event (except pong/stats)
    if msg.get("type") not in ("pong", "stats"):
        with _msg_buffer_lock:
            _msg_buffer.append(msg)
    if _loop and not _loop.is_closed():
        asyncio.run_coroutine_threadsafe(manager.broadcast(msg), _loop)


# ── Token counter ─────────────────────────────────────────────────────────
_token_stats = {"total_in": 0, "total_out": 0, "last_job": 0}

def count_tokens(text: str) -> int:
    return max(1, len(text.split()) * 4 // 3)


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
def detect_format(result: str) -> tuple[str, str]:
    for line in result.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        m = re.match(r"^FORMAT:\s*([a-zA-Z]{2,6})", stripped, re.IGNORECASE)
        if m:
            fmt = m.group(1).lower()
            if fmt in SUPPORTED_FORMATS:
                mime, ext = SUPPORTED_FORMATS[fmt]
                return ext, mime
        if len([l for l in result.splitlines()[:10] if l.strip()]) >= 10:
            break
    # Default — use setting
    mime, ext = SUPPORTED_FORMATS.get(DEFAULT_REPORT_FORMAT, ("text/plain", ".txt"))
    return ext, mime


def strip_format_declaration(result: str) -> str:
    lines = result.splitlines()
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        if re.match(r"^FORMAT:\s*\S+", line.strip(), re.IGNORECASE):
            remaining = lines[i + 1:]
            while remaining and not remaining[0].strip():
                remaining = remaining[1:]
            return "\n".join(remaining).strip()
        break
    return result


def save_report(job_id: str, topic: str, result: str, model: str) -> tuple[str, str]:
    """Detect format, build metadata footer, save report file."""
    ext, media_type = detect_format(result)
    clean           = strip_format_declaration(result)

    ts     = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug   = re.sub(r'[^\w]+', '_', topic.strip())[:40].strip('_')
    fname  = f"report_{ts}_{slug}{ext}"
    path   = REPORTS_DIR / fname

    # Extract confidence score from analyst output
    conf_m  = re.search(r"[Cc]onfidence[:\s]+(\d+)%", clean)
    conf    = conf_m.group(1) + "%" if conf_m else "N/A"
    ts_str  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    preset  = get_llm_config()
    agents  = [a["role"] for a in get_active_agents()]

    def _meta(cs: str = "") -> str:
        return "\n".join([
            f"{cs}", f"{cs}--- Report Metadata ---",
            f"{cs}Topic:              {topic}",
            f"{cs}Job ID:             {job_id}",
            f"{cs}Generated:          {ts_str}",
            f"{cs}Model:              {model}",
            f"{cs}Temperature:        {preset.get('temperature','?')}",
            f"{cs}Top-K:              {preset.get('top_k','default')}",
            f"{cs}Top-P:              {preset.get('top_p','default')}",
            f"{cs}Context Window:     {preset.get('num_ctx','?')}",
            f"{cs}Repeat Penalty:     {preset.get('repeat_penalty','default')}",
            f"{cs}Confidence Score:   {conf}",
            f"{cs}Active Agents:      {', '.join(agents)}",
            f"{cs}",
        ])

    if ext == ".txt":
        content = (
            f"RESEARCH REPORT\n{'='*60}\n"
            f"Topic:     {topic}\nJob ID:    {job_id}\n"
            f"Generated: {ts_str}\n{'='*60}\n\n"
            f"{clean}\n\n{_meta()}"
        )
    elif ext == ".md":
        content = (
            f"# Research Report\n**Topic:** {topic}  \n"
            f"**Job:** {job_id} | **Model:** {model} | **Generated:** {ts_str}\n"
            f"**Confidence:** {conf} | **Temperature:** {preset.get('temperature','?')}\n\n"
            f"---\n\n{clean}\n\n---\n{_meta('> ')}"
        )
    elif ext == ".csv":
        content = (
            f"# Topic,{topic}\n# Job ID,{job_id}\n# Model,{model}\n"
            f"# Generated,{ts_str}\n# Confidence,{conf}\n#\n{clean}"
        )
    elif ext == ".log":
        content = (
            f"[{ts_str}] JOB_START topic={topic!r} job={job_id} model={model}\n"
            f"[{ts_str}] CONFIDENCE={conf}\n"
            f"{clean}\n[{ts_str}] JOB_END\n"
        )
    elif ext == ".json":
        import json as _j
        try:
            parsed = _j.loads(clean)
        except Exception:
            parsed = {"report": clean}
        parsed["_metadata"] = {
            "topic": topic, "job_id": job_id, "model": model,
            "generated": ts_str, "confidence": conf,
            "temperature": preset.get("temperature"),
            "agents": agents,
        }
        content = _j.dumps(parsed, indent=2, ensure_ascii=False)
    elif ext == ".html":
        content = (
            f"<!-- Report: job={job_id} model={model} conf={conf} -->\n"
            f"{clean}\n<footer><small>Generated: {ts_str} | Model: {model} | "
            f"Confidence: {conf}</small></footer>"
        )
    else:
        content = clean

    path.write_text(content, encoding="utf-8")

    # Copy to user-configured output directory if set
    if FILESYSTEM_ENABLED:
        out_dir = get_output_dir()
        if out_dir:
            try:
                dest = Path(out_dir) / fname
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(str(path), str(dest))
            except Exception as e:
                logger.warning(f"Output dir copy failed: {e}")

    return fname, media_type


# ── Job store (in-memory; replace with Redis/DB for multi-user) ────────────
jobs: dict[str, dict] = {}


# ── Background job runner ──────────────────────────────────────────────────
def run_crew_sync(job_id: str, topic: str, mode: str = "research",
                  uploaded_files: list[str] | None = None):
    jobs[job_id]["status"] = "running"
    # Small delay so the WS reconnect (from model switch etc.) finishes first
    time.sleep(0.5)
    sync_broadcast({
        "type": "job_status", "job_id": job_id,
        "status": "running", "topic": topic, "mode": mode,
        "model": get_active_model(),
    })
    # Announce each active agent so the 3D scene lights up
    for ag in get_active_agents():
        sync_broadcast({
            "type": "agent_activity",
            "agent": ag["id"], "label": f"{ag.get('icon','🤖')} {ag.get('label',ag['id'])}",
            "message": f"Preparing for job: {topic[:60]}",
            "phase": False, "task_result": False, "ts": time.time(),
        })

    try:
        agents = build_agents()
        tasks  = build_tasks(topic, agents, mode=mode, uploaded_files=uploaded_files)

        # Tag each pipeline stage with the correct agent ID so the frontend
        # can show which avatar is currently speaking.
        def _agent_id_for(agent_obj) -> str:
            for aid, a in agents.items():
                if a is agent_obj:
                    return aid
            return "system"

        stage_labels = {
            "coordinator": "Planning research questions…",
            "researcher":  "Gathering evidence from tools & web…",
            "analyst":     "Analysing findings and risks…",
            "writer":      "Drafting final report…",
        }

        for idx, task in enumerate(tasks, start=1):
            aid = _agent_id_for(task.agent)
            # Short, readable message for the activity feed
            msg = stage_labels.get(
                aid,
                f"Running task {idx}: {str(task.description)[:120]}…",
            )
            sync_broadcast({
                "type": "agent_activity",
                "agent": aid,
                "label": _label(aid),
                "message": msg,
                "phase": aid in ("coordinator", "researcher", "analyst", "writer"),
                "task_result": False,
                "ts": time.time(),
            })

        capture = StreamCapture("system")
        crew    = Crew(
            agents  = list(agents.values()),
            tasks   = tasks,
            process = Process.sequential,
            verbose = True,
        )

        with redirect_stdout(capture):
            result = crew.kickoff()

        result_str = str(result)
        fname, mime = save_report(job_id, topic, result_str, get_active_model())

        jobs[job_id].update({"status": "done", "result": result_str,
                             "filename": fname, "format": mime})
        sync_broadcast({
            "type": "job_done", "job_id": job_id,
            "result": result_str[:3000],
            "filename": fname, "format": mime,
        })

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
        jobs[job_id].update({"status": "failed", "error": str(e)})
        sync_broadcast({
            "type": "job_failed", "job_id": job_id, "reason": str(e),
        })


# ── Startup ────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def _startup():
    global _loop
    _loop = asyncio.get_event_loop()

    ensure_skills_files()
    ensure_tool_files()

    if RAG_ENABLED:
        _load_store()

    if TELEGRAM_ENABLED:
        try:
            from telegram.bot import start_bot
            if start_bot():
                logger.info("Telegram bot started.")
        except Exception as e:
            logger.warning(f"Telegram bot startup failed: {e}")

    if SELF_IMPROVER_ENABLED:
        try:
            from self_improver import start as start_improver
            start_improver()
            logger.info("Self-improver started.")
        except Exception as e:
            logger.warning(f"Self-improver startup failed: {e}")

    logger.info(f"Multi Agent Orchestration v{API_VERSION} ready — model: {get_active_model()}")


# ════════════════════════════════════════════════════════════════════════════
# REST API endpoints
# ════════════════════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {
        "status": "ok", "service": API_TITLE, "version": API_VERSION,
        "model": get_active_model(),
        "features": {
            "web_search":   SEARCH_ENABLED,
            "rag":          RAG_ENABLED,
            "telegram":     TELEGRAM_ENABLED,
            "self_improver":SELF_IMPROVER_ENABLED,
            "filesystem":   FILESYSTEM_ENABLED,
            "auth":         REQUIRE_API_KEY,
        },
    }


# ── Stats ─────────────────────────────────────────────────────────────────
@app.get("/stats")
def get_stats():
    if not STATS_ENABLED:
        raise HTTPException(status_code=404, detail="Stats endpoint disabled")
    mem  = psutil.virtual_memory()
    cpu  = psutil.cpu_percent(interval=0.2)
    disk = psutil.disk_usage("/")
    ollama_info = {}
    try:
        from settings import OLLAMA_URL
        r = requests.get(f"{OLLAMA_URL}/api/ps", timeout=2)
        data = r.json()
        if data.get("models"):
            m = data["models"][0]
            ollama_info = {"model": m.get("name"), "vram_mb": round(m.get("size", 0) / 1_048_576)}
    except Exception:
        ollama_info = {"model": get_active_model(), "vram_mb": 0}
    return {
        "ram_total_gb":  round(mem.total / 1_073_741_824, 2),
        "ram_used_gb":   round(mem.used  / 1_073_741_824, 2),
        "ram_free_gb":   round(mem.available / 1_073_741_824, 2),
        "ram_pct":       mem.percent,
        "cpu_pct":       cpu,
        "disk_total_gb": round(disk.total / 1_073_741_824, 1),
        "disk_used_gb":  round(disk.used  / 1_073_741_824, 1),
        "disk_pct":      disk.percent,
        "tokens_in":     _token_stats["total_in"],
        "tokens_out":    _token_stats["total_out"],
        "ollama":        ollama_info,
        "active_jobs":   sum(1 for j in jobs.values() if j.get("status") == "running"),
    }


# ── Models ────────────────────────────────────────────────────────────────
class ModelSwitch(BaseModel):
    model: str

@app.get("/models")
def list_models():
    from settings import OLLAMA_URL
    try:
        r   = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        installed = [m["name"] for m in r.json().get("models", [])]
    except Exception:
        installed = []
    return {
        "active":       get_active_model(),
        "active_model": get_active_model(),   # alias for frontend compatibility
        "installed":    installed,
        "models":       installed,            # alias for frontend compatibility
        "presets":      list_presets(),
    }

@app.post("/model")
def switch_model(req: ModelSwitch):
    set_active_model(req.model)
    sync_broadcast({"type": "model_changed", "model": req.model, "active_model": req.model})
    return {"status": "ok", "model": req.model, "active_model": req.model}


# ── Jobs ──────────────────────────────────────────────────────────────────
class JobRequest(BaseModel):
    topic:          str
    mode:           str = "research"
    uploaded_files: list[str] = []

@app.post("/run")
def create_job(req: JobRequest):
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {"status": "queued", "topic": req.topic, "result": None}
    # Fast path: simple maths in quick-query mode
    if _maybe_handle_simple_math(req.topic, req.mode, job_id):
        return {"job_id": job_id, "status": "done", "fast_path": "math"}
        
    t = threading.Thread(
        target=run_crew_sync,
        args=(job_id, req.topic, req.mode, req.uploaded_files),
        daemon=True,
    )
    t.start()
    return {"job_id": job_id, "status": "queued"}

@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    return jobs.get(job_id) or {"error": "not found"}


# ── File uploads ──────────────────────────────────────────────────────────
@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    safe = re.sub(r'[^a-zA-Z0-9._\- ]', '_', file.filename or "upload")
    dest = UPLOADS_DIR / safe
    dest.write_bytes(await file.read())
    return {"filename": safe, "size": dest.stat().st_size}

@app.get("/uploads")
def list_uploads():
    return [{"name": f.name, "size": f.stat().st_size} for f in UPLOADS_DIR.glob("*") if f.is_file()]

@app.delete("/uploads/{filename}")
def delete_upload(filename: str):
    p = UPLOADS_DIR / re.sub(r'[^a-zA-Z0-9._\- ]', '_', filename)
    if p.exists():
        p.unlink()
        return {"deleted": True}
    raise HTTPException(status_code=404, detail="File not found")


# ── Reports ────────────────────────────────────────────────────────────────
@app.get("/reports")
def list_reports():
    files = sorted(REPORTS_DIR.glob("*"), key=lambda f: f.stat().st_mtime, reverse=True)
    return [{"name": f.name, "size": f.stat().st_size,
             "format": f.suffix.lstrip(".")} for f in files if f.is_file()]

@app.get("/reports/{filename}")
def download_report(filename: str):
    path = REPORTS_DIR / re.sub(r'[^a-zA-Z0-9._\-]', '_', filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    ext  = path.suffix.lstrip(".")
    mime = SUPPORTED_FORMATS.get(ext, ("text/plain", f".{ext}"))[0]
    return FileResponse(str(path), media_type=mime, filename=path.name)


# ── Agents ────────────────────────────────────────────────────────────────
class AgentCreate(BaseModel):
    label: str; role: str; goal: str; backstory: str
    icon: str = "🤖"; color: str = "#6366f1"
    allow_delegation: bool = False; max_iter: int = 10
    tools: list[str] = []

class AgentUpdate(BaseModel):
    role: Optional[str] = None; goal: Optional[str] = None
    backstory: Optional[str] = None; icon: Optional[str] = None
    color: Optional[str] = None; label: Optional[str] = None
    allow_delegation: Optional[bool] = None; max_iter: Optional[int] = None

@app.get("/agents")
def list_agents():
    agents = get_all_agents()
    return {"agents": agents, "count": len(agents)}

@app.post("/agents")
def create_agent(req: AgentCreate):
    if role_exists(req.role):
        existing = find_agent_by_role(req.role)
        return {"duplicate": True, "agent": existing}
    agent = add_agent(req.dict())
    sync_broadcast({"type": "agent_created", "agent": agent})
    return agent

@app.put("/agents/{agent_id}")
def update_agent_ep(agent_id: str, req: AgentUpdate):
    updated = update_agent(agent_id, {k: v for k, v in req.dict().items() if v is not None})
    sync_broadcast({"type": "agent_updated", "agent": updated})
    return updated

@app.delete("/agents/{agent_id}")
def delete_agent(agent_id: str):
    ok = remove_agent(agent_id)
    if ok:
        sync_broadcast({"type": "agent_deleted", "agent_id": agent_id})
    return {"deleted": ok}

@app.post("/agents/{agent_id}/activate")
def activate_agent(agent_id: str):
    set_agent_active(agent_id, True)
    sync_broadcast({"type": "agents_updated"})
    return {"active": True}

@app.post("/agents/{agent_id}/deactivate")
def deactivate_agent(agent_id: str):
    set_agent_active(agent_id, False)
    sync_broadcast({"type": "agents_updated"})
    return {"active": False}

@app.get("/agents/{agent_id}/skills")
def get_skills(agent_id: str):
    return {"text": get_skills_text(agent_id)}

@app.put("/agents/{agent_id}/skills")
def save_skills(agent_id: str, body: dict):
    save_skills_text(agent_id, body.get("text", ""))
    sync_broadcast({"type": "agents_updated"})
    return {"saved": True}


# ── Tools ─────────────────────────────────────────────────────────────────
class ToolCreate(BaseModel):
    name: str; display_name: str; description: str
    tags: str = ""; code: str = "    return str(input_data)"

class ToolUpdate(BaseModel):
    display_name: Optional[str] = None; description: Optional[str] = None
    tags: Optional[str] = None; code: Optional[str] = None

@app.get("/tools")
def list_tools():
    return get_all_tools()

@app.post("/tools")
def create_tool(req: ToolCreate):
    if name_exists(req.name):
        return {"duplicate": True, "tool": find_tool_by_name(req.name)}
    tool = add_tool(req.dict())
    sync_broadcast({"type": "tool_created", "tool": tool})
    return tool

@app.put("/tools/{tool_id}")
def update_tool_ep(tool_id: str, req: ToolUpdate):
    updated = update_tool(tool_id, {k: v for k, v in req.dict().items() if v is not None})
    sync_broadcast({"type": "tool_updated", "tool": updated})
    return updated

@app.delete("/tools/{tool_id}")
def delete_tool(tool_id: str):
    ok = remove_tool(tool_id)
    if ok:
        sync_broadcast({"type": "tool_deleted", "tool_id": tool_id})
    return {"deleted": ok}

@app.post("/tools/{tool_id}/activate")
def activate_tool(tool_id: str):
    set_tool_active(tool_id, True)
    sync_broadcast({"type": "tools_updated"})
    return {"active": True}

@app.post("/tools/{tool_id}/deactivate")
def deactivate_tool(tool_id: str):
    set_tool_active(tool_id, False)
    sync_broadcast({"type": "tools_updated"})
    return {"active": False}

@app.get("/tools/{tool_id}/toolmd")
def get_toolmd(tool_id: str):
    return {"text": get_tool_md_text(tool_id)}

@app.put("/tools/{tool_id}/toolmd")
def save_toolmd(tool_id: str, body: dict):
    save_tool_md_text(tool_id, body.get("text", ""))
    sync_broadcast({"type": "tools_updated"})
    return {"saved": True}


# ── Spawn requests ────────────────────────────────────────────────────────
class SpawnDecision(BaseModel):
    request_id: str; approved: bool

@app.get("/spawns")
def list_spawns():
    return {
        "pending":             get_pending_spawns(),
        "agent_spawn_enabled": is_agent_spawn_enabled(),
    }

@app.post("/spawns/decide")
def decide_spawn(req: SpawnDecision):
    result = resolve_spawn(req.request_id, req.approved)
    if req.approved and result.get("agent"):
        sync_broadcast({"type": "agent_created", "agent": result["agent"]})
    return result

@app.get("/spawn-settings")
def get_spawn_settings():
    return get_spawn_status()

@app.post("/spawn-settings")
def set_spawn_settings(body: dict):
    if "enabled" in body:
        set_agent_spawn_enabled(bool(body["enabled"]))
    sync_broadcast({"type": "spawn_settings", **get_spawn_status()})
    return get_spawn_status()

@app.get("/tool-spawns")
def list_tool_spawns():
    return {"pending": get_pending_tool_spawns()}

@app.post("/tool-spawns/decide")
def decide_tool_spawn(req: SpawnDecision):
    result = resolve_tool_spawn(req.request_id, req.approved)
    if req.approved and result.get("tool"):
        sync_broadcast({"type": "tool_created", "tool": result["tool"]})
    return result


# ── RAG / Knowledge Base ──────────────────────────────────────────────────
if RAG_ENABLED:
    class KBIngestText(BaseModel):
        text: str; source_name: str; tags: list[str] = []

    class KBConfig(BaseModel):
        enabled: bool          = RAG_ENABLED
        embed_model: str       = RAG_EMBED_MODEL
        chunk_size: int        = RAG_CHUNK_SIZE
        chunk_overlap: int     = RAG_CHUNK_OVERLAP
        top_k: int             = RAG_TOP_K
        min_score: float       = RAG_MIN_SCORE
        use_ollama_embed: bool = RAG_USE_OLLAMA_EMBED

    @app.get("/kb/config")
    def get_kb_config(): return load_kb_config()

    @app.post("/kb/config")
    def set_kb_config(req: KBConfig):
        save_kb_config(req.dict()); return {"status": "saved", **req.dict()}

    @app.get("/kb/entries")
    def list_kb():
        return {"entries": get_all_entries(), "count": get_entry_count(), "sources": list_sources()}

    @app.post("/kb/ingest-text")
    def kb_ingest_text(req: KBIngestText):
        result = ingest_text(req.text, req.source_name, req.tags)
        sync_broadcast({"type": "agent_activity", "agent": "system",
                        "label": "📚 KB", "message": f"📚 {result['message']}", "ts": time.time()})
        return result

    @app.post("/kb/ingest-file")
    async def kb_ingest_file(file: UploadFile = File(...), tags: str = ""):
        safe = re.sub(r'[^a-zA-Z0-9._\- ]', '_', file.filename or "kb_doc")
        dest = KB_DIR / safe
        dest.write_bytes(await file.read())
        result = ingest_file(dest, tags=[t.strip() for t in tags.split(",") if t.strip()])
        sync_broadcast({"type": "agent_activity", "agent": "system",
                        "label": "📚 KB", "message": f"📚 {result['message']}", "ts": time.time()})
        return result

    @app.delete("/kb/entries/{entry_id}")
    def remove_kb_entry(entry_id: str):
        return {"deleted": delete_entry(entry_id), "id": entry_id}

    @app.delete("/kb/sources/{source}")
    def remove_kb_source(source: str):
        removed = delete_source(source)
        return {"removed_chunks": removed, "source": source}

    @app.post("/kb/clear")
    def clear_kb():
        clear_store()
        return {"status": "cleared"}

    @app.get("/kb/search")
    def kb_search_query(q: str = ""):
        if not q: raise HTTPException(status_code=400, detail="Provide ?q=")
        return {"query": q, "result": kb_search(q)}

    class KBQueryRequest(BaseModel):
        query: str
        top_k: int = None   # None = use config default

    @app.post("/kb/query")
    def kb_query(req: KBQueryRequest):
        if not req.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        result = query_rag(req.query, top_k=req.top_k)
        return result


# ── Web Search ────────────────────────────────────────────────────────────
if SEARCH_ENABLED:
    class WebSearchConfig(BaseModel):
        enabled: bool = False; provider: str = "auto"
        max_results: int = 5; timeout_seconds: int = 10
        safe_search: bool = True; region: str = "wt-wt"
        fallback_to_mock: bool = True

    @app.get("/web-search/config")
    def get_ws_config():
        from web_search_tool import load_config; return load_config()

    @app.post("/web-search/config")
    def set_ws_config(req: WebSearchConfig):
        from web_search_tool import save_config; save_config(req.dict())
        return {"status": "saved", **req.dict()}

    @app.post("/web-search/test")
    def test_ws():
        from web_search_tool import test_search; return {"providers": test_search()}

    @app.get("/web-search/query")
    def run_ws_query(q: str = ""):
        if not q: raise HTTPException(status_code=400, detail="Provide ?q=")
        from web_search_tool import real_search, load_config
        if not load_config().get("enabled"):
            raise HTTPException(status_code=400, detail="Web search is disabled")
        return {"query": q, "result": real_search(q)}


# ── Telegram ──────────────────────────────────────────────────────────────
# /telegram/config is ALWAYS registered so the frontend never gets a 404
class TelegramConfig(BaseModel):
    bot_token: str = ""; allowed_chat_ids: list[str] = []
    notify_chat_id: str = ""; enabled: bool = False

@app.get("/telegram/config")
def get_tg_config():
    """Always available — returns disabled stub when Telegram is not configured."""
    if not TELEGRAM_ENABLED:
        return {"enabled": False, "bot_token_set": False,
                "allowed_chat_ids": [], "notify_chat_id": "",
                "_note": "Telegram disabled. Set TELEGRAM_ENABLED=true to enable."}
    from telegram.config import load_config as lc
    cfg = lc(); cfg["bot_token_set"] = bool(cfg.get("bot_token")); cfg.pop("bot_token", None)
    return cfg

    @app.post("/telegram/config")
    def set_tg_config(req: TelegramConfig):
        from telegram.config import load_config as lc, save_config as sc
        from telegram.bot import stop_bot, start_bot
        cfg = lc()
        if req.bot_token: cfg["bot_token"] = req.bot_token
        cfg.update({"allowed_chat_ids": req.allowed_chat_ids,
                    "notify_chat_id": req.notify_chat_id, "enabled": req.enabled})
        sc(cfg)
        if req.enabled and req.bot_token:
            stop_bot(); time.sleep(1); start_bot()
        return {"status": "saved"}

    @app.post("/telegram/test")
    def test_telegram():
        from telegram.bot import notify_message, is_enabled as tg_enabled
        if not tg_enabled(): raise HTTPException(status_code=400, detail="Telegram not enabled")
        notify_message("✅ Test message from Multi Agent Orchestration")
        return {"status": "sent"}


# ── Self-Improver ─────────────────────────────────────────────────────────
if SELF_IMPROVER_ENABLED:
    @app.get("/self-improver/config")
    def get_si_config():
        from self_improver import load_config; return load_config()

    @app.post("/self-improver/config")
    def set_si_config(body: dict):
        from self_improver import save_config; save_config(body); return {"status": "saved"}

    @app.post("/self-improver/run-now")
    def run_si_now():
        from self_improver import run_now
        threading.Thread(target=run_now, daemon=True).start()
        return {"status": "started"}

    @app.get("/self-improver/best-practices")
    def get_bp():
        p = BASE_DIR / "BEST_PRACTICES.md"
        return {"content": p.read_text() if p.exists() else "No best practices file yet."}

    @app.get("/self-improver/proposals")
    def get_proposals():
        p = BASE_DIR / "IMPROVEMENT_PROPOSALS.md"
        return {"content": p.read_text() if p.exists() else ""}

    @app.get("/self-improver/log")
    def get_si_log():
        p = BASE_DIR / "IMPROVEMENT_LOG.md"
        return {"content": p.read_text() if p.exists() else ""}


# ── Filesystem ────────────────────────────────────────────────────────────
if FILESYSTEM_ENABLED:
    class FsAccessEntry(BaseModel):
        path: str; read: bool = True; write: bool = False; edit: bool = False; label: str = ""

    @app.get("/fs-config")
    def get_fs_config():
        return {"access_list": get_access_list(), "output_dir": get_output_dir()}

    @app.post("/fs-config/access")
    def add_fs_access(req: FsAccessEntry):
        add_access_entry(req.path, req.read, req.write, req.edit, req.label)
        return {"status": "added"}

    @app.put("/fs-config/access")
    def update_fs_access(req: FsAccessEntry):
        update_access_entry(req.path, req.read, req.write, req.edit)
        return {"status": "updated"}

    @app.delete("/fs-config/access")
    def remove_fs_access(path: str):
        remove_access_entry(path); return {"status": "removed"}

    @app.post("/fs-config/output-dir")
    def set_fs_output(body: dict):
        set_output_dir(body.get("path", "")); return {"status": "saved"}

    @app.get("/fs-config/audit")
    def get_audit():
        return {"log": get_audit_log(200)}


# ── WebSocket ─────────────────────────────────────────────────────────────
_WS_DISCONNECT_TYPES = (
    WebSocketDisconnect,
    StarletteWSDC,
    ClientDisconnected,
    ConnectionResetError,
    RuntimeError,        # "WebSocket is not connected" from starlette
)

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await manager.connect(ws)

    # Send the initial "connected" message — client may already be gone
    try:
        await ws.send_json({
            "type": "connected",
            "model": get_active_model(),
            "message": f"Multi Agent Orchestration v{API_VERSION} ready",
        })
        # Replay recent buffered events so reconnecting clients catch up
        with _msg_buffer_lock:
            recent = list(_msg_buffer)
        for buffered_msg in recent:
            try:
                await ws.send_json(buffered_msg)
            except Exception:
                break
    except _WS_DISCONNECT_TYPES:
        manager.disconnect(ws)
        return
    except Exception:
        manager.disconnect(ws)
        return

    # Main receive loop
    try:
        while True:
            try:
                data = await ws.receive_text()
            except _WS_DISCONNECT_TYPES:
                break
            except Exception:
                break

            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    try:
                        await ws.send_json({"type": "pong"})
                    except Exception:
                        break
            except json.JSONDecodeError:
                pass
    finally:
        manager.disconnect(ws)
