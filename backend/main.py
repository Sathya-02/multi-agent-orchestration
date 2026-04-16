# ---------------------------------------------------------------------------
# Disable CrewAI / OpenTelemetry telemetry BEFORE any crewai import.
# ---------------------------------------------------------------------------
import os
os.environ.setdefault("OTEL_SDK_DISABLED", "true")
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")

import asyncio
import json
import logging
import re
import shutil
import subprocess
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
REPORT_DIR = BASE_DIR / "reports"
AGENT_DIR  = BASE_DIR / "agents_dir"
TOOL_DIR   = BASE_DIR / "tools_dir"
UPLOAD_DIR.mkdir(exist_ok=True)
REPORT_DIR.mkdir(exist_ok=True)
AGENT_DIR.mkdir(exist_ok=True)
TOOL_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# Optional RAG / KB
# ---------------------------------------------------------------------------
try:
    from rag_engine import (
        delete_entry,
        delete_source,
        get_all_entries,
        get_entry_count,
        list_sources,
        ingest_file,
        ingest_text,
        retrieve,
        load_kb_config,
        save_kb_config,
        clear_store,
        reindex_store,
        search as kb_search,
        KB_DIR,
    )
    RAG_ENABLED = True
except Exception as e:
    logger.warning(f"RAG engine not available: {e}")
    RAG_ENABLED = False

# ---------------------------------------------------------------------------
# Optional Filesystem config
# ---------------------------------------------------------------------------
try:
    import fs_config as _fs_mod
    from fs_config import (
        get_audit_log,
        get_output_dir,
        set_output_dir,
        get_access_list,
        add_access_entry,
        remove_access_entry,
        update_access_entry,
        can_read,
        can_write,
    )

    def get_fs_config() -> dict:
        return {"access_list": get_access_list(), "output_dir": get_output_dir()}

    def save_fs_config(cfg: dict) -> None:
        pass

    def update_access_flag(path: str, flag: str, value: bool) -> None:
        update_access_entry(path, **{flag: value})

    def check_access(path: str, agent: str = "agent") -> dict:
        ok, msg = can_read(path, agent)
        return {"allowed": ok, "reason": msg}

    FS_ENABLED = True
except Exception as e:
    logger.warning(f"FS config not available: {e}")
    FS_ENABLED = False

# ---------------------------------------------------------------------------
# Optional Tool registry
# ---------------------------------------------------------------------------
try:
    import tool_registry as _tr

    class _ToolRegistryAdapter:
        def list_tools(self):              return _tr.get_all_tools()
        def create_tool(self, d):          tool, created = _tr.add_tool(d); tool["duplicate"] = not created; return tool
        def update_tool(self, tid, upd):   return _tr.update_tool(tid, upd) or {}
        def delete_tool(self, tid):        _tr.remove_tool(tid)
        def set_active(self, tid, val):    _tr.set_tool_active(tid, val)
        def get_tool_md(self, tid):        return _tr.get_tool_md_text(tid)
        def save_tool_md(self, tid, text): _tr.save_tool_md_text(tid, text)

    tool_registry = _ToolRegistryAdapter()
    _tr.ensure_tool_files()
    TOOLS_ENABLED = True
except Exception as e:
    logger.warning(f"Tool registry not available: {e}")
    TOOLS_ENABLED = False
    tool_registry = None

# ---------------------------------------------------------------------------
# Optional Agent registry
# ---------------------------------------------------------------------------
try:
    import agent_registry as _ar

    class _AgentRegistryAdapter:
        def list_agents(self):               return _ar.get_all_agents()
        def create_agent(self, d):           agent, created = _ar.add_agent(d); agent["duplicate"] = not created; return agent
        def update_agent(self, aid, upd):    return _ar.update_agent(aid, upd) or {}
        def delete_agent(self, aid):         _ar.remove_agent(aid)
        def set_active(self, aid, val):      _ar.set_agent_active(aid, val)
        def get_skills(self, aid):           return _ar.get_skills_text(aid)
        def save_skills(self, aid, text):    _ar.save_skills_text(aid, text)

    agent_registry = _AgentRegistryAdapter()
    _ar.ensure_skills_files()
    AGENTS_ENABLED = True
except Exception as e:
    logger.warning(f"Agent registry not available: {e}")
    AGENTS_ENABLED = False
    agent_registry = None

# ---------------------------------------------------------------------------
# Optional Self-improver
# ---------------------------------------------------------------------------
try:
    import self_improver as _si

    class _SelfImproverAdapter:
        _BASE = Path(__file__).parent
        def get_config(self):          return _si.load_config()
        def save_config(self, cfg):    cur = _si.load_config(); cur.update(cfg); _si.save_config(cur)
        def run_cycle(self):           return _si.trigger_improvement_cycle()
        def get_best_practices(self):  p = self._BASE/"BEST_PRACTICES.md";      return p.read_text(encoding="utf-8") if p.exists() else ""
        def get_proposals(self):       p = self._BASE/"IMPROVEMENT_PROPOSALS.md"; return p.read_text(encoding="utf-8") if p.exists() else ""
        def get_log(self):             p = self._BASE/"IMPROVEMENT_LOG.md";     return p.read_text(encoding="utf-8") if p.exists() else ""

    self_improver = _SelfImproverAdapter()
    SI_ENABLED = True
except Exception as e:
    logger.warning(f"Self-improver not available: {e}")
    SI_ENABLED = False
    self_improver = None

# ---------------------------------------------------------------------------
# Optional Web Search
# ---------------------------------------------------------------------------
try:
    import web_search_tool as _wst

    class _WebSearchAdapter:
        def get_config(self):          return _wst.load_config()
        def save_config(self, cfg):    _wst.save_config(cfg)
        async def test_providers(self):
            try:    return _wst.test_search()
            except Exception as ex: return {"error": str(ex)}
        async def search(self, q):     return _wst.real_search(q)

    web_search = _WebSearchAdapter()
    WS_ENABLED = True
except Exception as e:
    logger.warning(f"Web search not available: {e}")
    WS_ENABLED = False
    web_search = None

# ---------------------------------------------------------------------------
# Optional Telegram
# ---------------------------------------------------------------------------
try:
    import telegram_bot as _tgb
    from telegram_bot import (
        save_config as _tg_save_config,
        is_enabled   as _tg_is_enabled,
        notify_message as _tg_notify,
    )

    class TelegramBot:
        _CFG_PATH = Path(__file__).parent / "data" / "telegram_config.json"

        @staticmethod
        def load_config(base_dir=None) -> dict:
            p = TelegramBot._CFG_PATH
            if p.exists():
                try:    return json.loads(p.read_text(encoding="utf-8"))
                except: pass
            return {"token": "", "allowed_chats": [], "notify_chat": "", "enabled": False}

        @staticmethod
        def save_config(base_dir, cfg: dict):
            p = TelegramBot._CFG_PATH
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

        def __init__(self, cfg: dict = None):
            self._cfg = cfg or {}

        async def send_message(self, text: str):
            _tg_notify(text)

    TELEGRAM_ENABLED = True
except Exception as e:
    logger.warning(f"Telegram bot not available: {e}")
    TELEGRAM_ENABLED = False

# ---------------------------------------------------------------------------
# Optional Model config
# ---------------------------------------------------------------------------
try:
    from model_config import get_active_model, set_active_model, get_llm_config
    MODEL_CONFIG_ENABLED = True
except Exception as e:
    logger.warning(f"Model config not available: {e}")
    MODEL_CONFIG_ENABLED = False
    def get_active_model() -> str:  return os.environ.get("DEFAULT_MODEL", "phi3:mini")
    def set_active_model(model: str) -> None: pass
    def get_llm_config() -> dict:   return {}

# ---------------------------------------------------------------------------
# Optional settings
# ---------------------------------------------------------------------------
try:
    import settings as _settings_mod
    from settings import (
        ensure_dirs,
        REPORTS_DIR as _SETTINGS_REPORTS_DIR,
        UPLOADS_DIR as _SETTINGS_UPLOADS_DIR,
        KB_DIR      as _SETTINGS_KB_DIR,
        OLLAMA_MODEL,
        OLLAMA_URL,
        SEARCH_ENABLED,
        RAG_ENABLED as _SETTINGS_RAG_ENABLED,
        TELEGRAM_ENABLED as _SETTINGS_TG_ENABLED,
        SELF_IMPROVER_ENABLED,
        FILESYSTEM_ENABLED,
        STATS_ENABLED,
        REQUIRE_API_KEY,
        JOB_TIMEOUT_SECONDS,
    )
    SETTINGS_ENABLED = True
except Exception as e:
    logger.warning(f"Settings not available: {e}")
    SETTINGS_ENABLED = False
    OLLAMA_MODEL = os.environ.get("DEFAULT_MODEL", "phi3:mini")
    OLLAMA_URL   = os.environ.get("OLLAMA_URL", "http://localhost:11434")

# ---------------------------------------------------------------------------
# Auth (legacy simple token)
# ---------------------------------------------------------------------------
AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")
security   = HTTPBearer(auto_error=False)

def verify_token(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not AUTH_TOKEN:
        return None
    if credentials is None or credentials.credentials != AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return credentials.credentials

_auth_dep = Depends(verify_token)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    topic: str
    mode: str = "research"
    uploaded_files: List[str] = []

class KBIngestText(BaseModel):
    text: str
    source_name: str = "paste"
    tags: List[str] = []

class KBConfigUpdate(BaseModel):
    enabled:          Optional[bool]  = None
    chunk_size:       Optional[int]   = None
    chunk_overlap:    Optional[int]   = None
    top_k:            Optional[int]   = None
    min_score:        Optional[float] = None
    embed_model:      Optional[str]   = None
    use_ollama_embed: Optional[bool]  = None

class AgentCreate(BaseModel):
    role:      str
    label:     str = ""
    goal:      str = ""
    backstory: str = ""
    icon:      str = "\U0001f916"
    color:     str = "#a78bfa"

class AgentUpdate(BaseModel):
    role:      Optional[str]  = None
    label:     Optional[str]  = None
    goal:      Optional[str]  = None
    backstory: Optional[str]  = None
    icon:      Optional[str]  = None
    color:     Optional[str]  = None
    active:    Optional[bool] = None

class SkillsUpdate(BaseModel):
    text: str

class ToolCreate(BaseModel):
    name:         str
    display_name: str = ""
    description:  str = ""
    tags:         List[str] = []
    code:         str = ""

class ToolUpdate(BaseModel):
    name:         Optional[str]       = None
    display_name: Optional[str]       = None
    description:  Optional[str]       = None
    tags:         Optional[List[str]] = None
    code:         Optional[str]       = None
    active:       Optional[bool]      = None

class ToolMdUpdate(BaseModel):
    text: str

class SpawnDecision(BaseModel):
    request_id: str
    approved:   bool

class ToolSpawnDecision(BaseModel):
    request_id: str
    approved:   bool

class ModelSelect(BaseModel):
    model: str

class TelegramConfigUpdate(BaseModel):
    bot_token:        Optional[str]       = None
    allowed_chat_ids: Optional[List[str]] = None
    notify_chat_id:   Optional[str]       = None
    enabled:          Optional[bool]      = None

class SIConfigUpdate(BaseModel):
    enabled:          Optional[bool]  = None
    interval_hours:   Optional[float] = None
    auto_apply_safe:  Optional[bool]  = None
    notify_telegram:  Optional[bool]  = None
    min_confidence:   Optional[float] = None
    model_override:   Optional[str]   = None

class WebSearchConfigUpdate(BaseModel):
    enabled:          Optional[bool] = None
    provider:         Optional[str]  = None
    max_results:      Optional[int]  = None
    timeout_seconds:  Optional[int]  = None
    safe_search:      Optional[bool] = None
    region:           Optional[str]  = None
    fallback_to_mock: Optional[bool] = None

class FSAccessEntry(BaseModel):
    path:  str
    read:  bool = True
    write: bool = False
    edit:  bool = False
    label: str  = ""

class FSFlagUpdate(BaseModel):
    path:  str
    flag:  str
    value: bool

class FSOutputDir(BaseModel):
    path: str

class SpawnSettings(BaseModel):
    enabled: bool

class RAGQuery(BaseModel):
    query: str
    top_k: int = 4

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------
active_jobs:        Dict[str, Any] = {}
connected_clients:  List[WebSocket] = []
spawn_requests:     List[Dict] = []
tool_spawn_requests:List[Dict] = []
spawn_enabled = True
tokens_in = 0
tokens_out = 0
tokens_last = 0
active_model = os.environ.get("DEFAULT_MODEL", "phi3:mini")
_start_time  = time.time()

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Multi-Agent Orchestration API starting up")
    yield
    logger.info("Shutting down")

app = FastAPI(title="Multi-Agent Orchestration", lifespan=lifespan)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# IMPORTANT: When allow_credentials=True, browsers reject allow_origins=["*"].
# List all origins that the frontend runs on (dev + prod).
_CORS_ORIGINS = [
    "http://localhost:5173",   # Vite dev server
    "http://localhost:3000",   # CRA / Next dev
    "http://localhost:4173",   # Vite preview
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
# Allow additional origins from env var (comma-separated), e.g. in production:
#   CORS_ORIGINS=https://app.yourdomain.com
_extra = os.environ.get("CORS_ORIGINS", "")
if _extra:
    _CORS_ORIGINS += [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Auth router  — /auth/*
# ---------------------------------------------------------------------------
try:
    from routers.auth_router import router as auth_router
    app.include_router(auth_router)
    logger.info("Auth router registered at /auth")
except Exception as _auth_import_err:
    logger.warning(f"Auth router not available: {_auth_import_err}")

# ---------------------------------------------------------------------------
# Broadcast helpers
# ---------------------------------------------------------------------------
async def broadcast(msg: dict):
    dead = []
    for ws in connected_clients:
        try:    await ws.send_json(msg)
        except: dead.append(ws)
    for ws in dead:
        try:    connected_clients.remove(ws)
        except ValueError: pass

def sync_broadcast(msg: dict) -> None:
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(broadcast(msg), loop)
        else:
            loop.run_until_complete(broadcast(msg))
    except Exception as exc:
        logger.debug("sync_broadcast error (ignored): %s", exc)

# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.append(ws)
    try:
        while True:
            data = await ws.receive_text()
            msg  = json.loads(data)
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        try: connected_clients.remove(ws)
        except ValueError: pass

# ---------------------------------------------------------------------------
# System stats
# ---------------------------------------------------------------------------
@app.get("/stats")
def get_stats(current_user=_auth_dep):
    try:
        import psutil
        cpu_pct      = psutil.cpu_percent(interval=0.1)
        ram          = psutil.virtual_memory()
        disk         = psutil.disk_usage("/")
        ram_used_gb  = round(ram.used      / 1e9, 1)
        ram_total_gb = round(ram.total     / 1e9, 1)
        ram_free_gb  = round(ram.available / 1e9, 1)
        ram_pct      = round(ram.percent, 1)
        disk_used_gb = round(disk.used     / 1e9, 1)
        disk_total_gb= round(disk.total    / 1e9, 1)
        disk_pct     = round(disk.percent, 1)
    except ImportError:
        cpu_pct = ram_used_gb = ram_total_gb = ram_free_gb = ram_pct = 0
        disk_used_gb = disk_total_gb = disk_pct = 0

    ollama_info: Dict = {}
    try:
        import httpx
        r = httpx.get("http://localhost:11434/api/tags", timeout=2)
        if r.status_code == 200:
            models = r.json().get("models", [])
            ollama_info["model_count"]   = len(models)
            ollama_info["model_current"] = active_model
    except Exception:
        pass

    uptime_seconds = int(time.time() - _start_time)
    return {
        "cpu_percent":    cpu_pct,
        "ram_pct":        ram_pct,
        "ram_used_gb":    ram_used_gb,
        "ram_total_gb":   ram_total_gb,
        "ram_free_gb":    ram_free_gb,
        "disk_pct":       disk_pct,
        "disk_used_gb":   disk_used_gb,
        "disk_total_gb":  disk_total_gb,
        "active_jobs":    len([j for j in active_jobs.values() if j.get("status") == "running"]),
        "total_jobs":     len(active_jobs),
        "tokens_in":      tokens_in,
        "tokens_out":     tokens_out,
        "tokens_last":    tokens_last,
        "uptime_seconds": uptime_seconds,
        "ollama":         ollama_info,
    }

# ---------------------------------------------------------------------------
# File upload / management
# ---------------------------------------------------------------------------
@app.get("/uploads")
def list_uploads(current_user=_auth_dep):
    files = []
    for f in UPLOAD_DIR.iterdir():
        if f.is_file():
            files.append({"filename": f.name, "size": f.stat().st_size})
    return files

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user=_auth_dep):
    dest = UPLOAD_DIR / file.filename
    with open(dest, "wb") as fh:
        shutil.copyfileobj(file.file, fh)
    return {"filename": file.filename, "size": dest.stat().st_size}

@app.delete("/uploads/{filename}")
def delete_upload(filename: str, current_user=_auth_dep):
    path = UPLOAD_DIR / filename
    if path.exists():
        path.unlink()
    return {"deleted": filename}

@app.get("/reports/{filename}")
def download_report(filename: str, current_user=_auth_dep):
    path = REPORT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path, filename=filename)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
@app.get("/models")
def list_models(current_user=_auth_dep):
    try:
        import httpx
        r = httpx.get("http://localhost:11434/api/tags", timeout=5)
        if r.status_code == 200:
            raw    = r.json().get("models", [])
            models = [{"name": m["name"], "id": m["name"], "pulled": True} for m in raw]
            return {"models": models, "installed": [m["name"] for m in models], "active_model": active_model}
    except Exception:
        pass
    return {"models": [], "installed": [], "active_model": active_model}

@app.post("/models/select")
async def select_model(body: ModelSelect, current_user=_auth_dep):
    global active_model
    active_model = body.model
    await broadcast({"type": "model_changed", "active_model": active_model})
    return {"active_model": active_model}

# ---------------------------------------------------------------------------
# Run job
# ---------------------------------------------------------------------------
@app.post("/run")
async def run_job(body: RunRequest, background_tasks: BackgroundTasks, current_user=_auth_dep):
    global tokens_in, tokens_out, tokens_last
    job_id = str(uuid.uuid4())[:8]
    active_jobs[job_id] = {"status": "running", "started": time.time()}

    await broadcast({"type": "job_status", "status": "running", "job_id": job_id,
                     "model": active_model, "mode": body.mode})

    _loop = asyncio.get_event_loop()

    async def _run():
        global tokens_in, tokens_out, tokens_last
        try:
            from agents_crew import run_crew
            result, report_file, fmt, t_in, t_out = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: run_crew(
                    topic=body.topic, mode=body.mode, model=active_model,
                    uploaded_files=body.uploaded_files, upload_dir=UPLOAD_DIR,
                    report_dir=REPORT_DIR, agent_dir=AGENT_DIR, tool_dir=TOOL_DIR,
                    broadcast_fn=lambda msg: asyncio.run_coroutine_threadsafe(broadcast(msg), _loop),
                    spawn_requests=spawn_requests, spawn_enabled=spawn_enabled,
                ),
            )
            
            tokens_in  += t_in
            tokens_out += t_out
            tokens_last = t_in + t_out
            await broadcast({
                "type":         "token_update",
                "tokens_in":    tokens_in,
                "tokens_out":   tokens_out,
                "tokens_last":  tokens_last,
            })
            active_jobs[job_id]["status"] = "done"
            await broadcast({"type": "job_done", "job_id": job_id, "result": result,
                             "filename": report_file, "format": fmt})
        except Exception as e:
            logger.exception("Job failed")
            active_jobs[job_id]["status"] = "failed"
            await broadcast({"type": "job_failed", "job_id": job_id, "reason": str(e)})

    background_tasks.add_task(_run)
    return {"job_id": job_id}

# ---------------------------------------------------------------------------
# Agents  /agents/*
# ---------------------------------------------------------------------------
@app.get("/agents")
def list_agents(current_user=_auth_dep):
    if not AGENTS_ENABLED: return []
    return agent_registry.list_agents()

@app.post("/agents")
async def create_agent(body: AgentCreate, current_user=_auth_dep):
    if not AGENTS_ENABLED:
        raise HTTPException(status_code=404, detail="Agent registry disabled")
    result = agent_registry.create_agent(body.dict())
    if result.get("duplicate"): return JSONResponse(status_code=409, content=result)
    await broadcast({"type": "agents_updated"})
    return result

@app.put("/agents/{agent_id}")
async def update_agent(agent_id: str, body: AgentUpdate, current_user=_auth_dep):
    if not AGENTS_ENABLED:
        raise HTTPException(status_code=404, detail="Agent registry disabled")
    result = agent_registry.update_agent(agent_id, body.dict(exclude_none=True))
    await broadcast({"type": "agents_updated"})
    return result

@app.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, current_user=_auth_dep):
    if not AGENTS_ENABLED:
        raise HTTPException(status_code=404, detail="Agent registry disabled")
    agent_registry.delete_agent(agent_id)
    await broadcast({"type": "agents_updated"})
    return {"deleted": agent_id}

@app.post("/agents/{agent_id}/activate")
async def activate_agent(agent_id: str, current_user=_auth_dep):
    if not AGENTS_ENABLED:
        raise HTTPException(status_code=404, detail="Agent registry disabled")
    agent_registry.set_active(agent_id, True)
    await broadcast({"type": "agents_updated"})
    return {"active": True}

@app.post("/agents/{agent_id}/deactivate")
async def deactivate_agent(agent_id: str, current_user=_auth_dep):
    if not AGENTS_ENABLED:
        raise HTTPException(status_code=404, detail="Agent registry disabled")
    agent_registry.set_active(agent_id, False)
    await broadcast({"type": "agents_updated"})
    return {"active": False}

@app.get("/agents/{agent_id}/skills")
def get_agent_skills(agent_id: str, current_user=_auth_dep):
    if not AGENTS_ENABLED:
        raise HTTPException(status_code=404, detail="Agent registry disabled")
    return {"content": agent_registry.get_skills(agent_id)}

@app.put("/agents/{agent_id}/skills")
async def update_agent_skills(agent_id: str, body: SkillsUpdate, current_user=_auth_dep):
    if not AGENTS_ENABLED:
        raise HTTPException(status_code=404, detail="Agent registry disabled")
    agent_registry.save_skills(agent_id, body.text)
    await broadcast({"type": "agents_updated"})
    return {"saved": True}

# ---------------------------------------------------------------------------
# Spawn  /spawns/*
# ---------------------------------------------------------------------------
@app.get("/spawn-settings")
def get_spawn_settings(current_user=_auth_dep):
    return {"spawn_enabled": spawn_enabled}

@app.post("/spawn-settings")
async def set_spawn_settings(body: SpawnSettings, current_user=_auth_dep):
    global spawn_enabled
    spawn_enabled = body.enabled
    await broadcast({"type": "spawn_settings", "spawn_enabled": spawn_enabled})
    return {"spawn_enabled": spawn_enabled}

@app.post("/spawns/decide")
async def decide_spawn(body: SpawnDecision, current_user=_auth_dep):
    global spawn_requests
    req = next((r for r in spawn_requests if r["request_id"] == body.request_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req["resolved"] = True
    req["approved"] = body.approved
    if body.approved and AGENTS_ENABLED:
        suggestion = req.get("suggestion", {})
        agent_registry.create_agent(suggestion)
        await broadcast({"type": "agent_created", "agent": suggestion})
    await broadcast({"type": "agents_updated"})
    spawn_requests = [r for r in spawn_requests if not r.get("resolved")]
    return {"decided": body.request_id, "approved": body.approved}

# ---------------------------------------------------------------------------
# Tools  /tools/*
# ---------------------------------------------------------------------------
@app.get("/tools")
def list_tools(current_user=_auth_dep):
    if not TOOLS_ENABLED: return []
    return tool_registry.list_tools()

@app.post("/tools")
async def create_tool(body: ToolCreate, current_user=_auth_dep):
    if not TOOLS_ENABLED:
        raise HTTPException(status_code=404, detail="Tool registry disabled")
    result = tool_registry.create_tool(body.dict())
    if result.get("duplicate"): return JSONResponse(status_code=409, content=result)
    await broadcast({"type": "tools_updated"})
    return result

@app.put("/tools/{tool_id}")
async def update_tool(tool_id: str, body: ToolUpdate, current_user=_auth_dep):
    if not TOOLS_ENABLED:
        raise HTTPException(status_code=404, detail="Tool registry disabled")
    result = tool_registry.update_tool(tool_id, body.dict(exclude_none=True))
    await broadcast({"type": "tools_updated"})
    return result

@app.delete("/tools/{tool_id}")
async def delete_tool(tool_id: str, current_user=_auth_dep):
    if not TOOLS_ENABLED:
        raise HTTPException(status_code=404, detail="Tool registry disabled")
    tool_registry.delete_tool(tool_id)
    await broadcast({"type": "tools_updated"})
    return {"deleted": tool_id}

@app.post("/tools/{tool_id}/activate")
async def activate_tool(tool_id: str, current_user=_auth_dep):
    if not TOOLS_ENABLED:
        raise HTTPException(status_code=404, detail="Tool registry disabled")
    tool_registry.set_active(tool_id, True)
    await broadcast({"type": "tools_updated"})
    return {"active": True}

@app.post("/tools/{tool_id}/deactivate")
async def deactivate_tool(tool_id: str, current_user=_auth_dep):
    if not TOOLS_ENABLED:
        raise HTTPException(status_code=404, detail="Tool registry disabled")
    tool_registry.set_active(tool_id, False)
    await broadcast({"type": "tools_updated"})
    return {"active": False}

@app.get("/tools/{tool_id}/toolmd")
def get_tool_md(tool_id: str, current_user=_auth_dep):
    if not TOOLS_ENABLED:
        raise HTTPException(status_code=404, detail="Tool registry disabled")
    return {"content": tool_registry.get_tool_md(tool_id)}

@app.put("/tools/{tool_id}/toolmd")
async def update_tool_md(tool_id: str, body: ToolMdUpdate, current_user=_auth_dep):
    if not TOOLS_ENABLED:
        raise HTTPException(status_code=404, detail="Tool registry disabled")
    tool_registry.save_tool_md(tool_id, body.text)
    await broadcast({"type": "tools_updated"})
    return {"saved": True}

@app.get("/tool-spawns")
def get_tool_spawns(current_user=_auth_dep):
    return {"pending": [r for r in tool_spawn_requests if not r.get("resolved")]}

@app.post("/tool-spawns/decide")
async def decide_tool_spawn(body: ToolSpawnDecision, current_user=_auth_dep):
    global tool_spawn_requests
    req = next((r for r in tool_spawn_requests if r["request_id"] == body.request_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req["resolved"] = True
    req["approved"] = body.approved
    if body.approved and TOOLS_ENABLED:
        suggestion = req.get("suggestion", {})
        tool_registry.create_tool(suggestion)
        await broadcast({"type": "tool_created", "tool": suggestion})
    await broadcast({"type": "tools_updated"})
    tool_spawn_requests = [r for r in tool_spawn_requests if not r.get("resolved")]
    return {"decided": body.request_id, "approved": body.approved}

# ---------------------------------------------------------------------------
# KNOWLEDGE BASE  /kb/*
# ---------------------------------------------------------------------------

@app.get("/kb/entries")
def kb_list_entries(current_user=_auth_dep):
    if not RAG_ENABLED:
        return {"entries": [], "sources": [], "count": 0}
    entries = get_all_entries()
    sources = list_sources()
    return {"entries": entries, "sources": sources, "count": len(entries)}

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
    if body.enabled          is not None: cfg["enabled"]          = body.enabled
    if body.chunk_size       is not None: cfg["chunk_size"]       = body.chunk_size
    if body.chunk_overlap    is not None: cfg["chunk_overlap"]    = body.chunk_overlap
    if body.top_k            is not None: cfg["top_k"]            = body.top_k
    if body.min_score        is not None: cfg["min_score"]        = body.min_score
    if body.embed_model      is not None: cfg["embed_model"]      = body.embed_model
    if body.use_ollama_embed is not None: cfg["use_ollama_embed"] = body.use_ollama_embed
    save_kb_config(cfg)
    return cfg

@app.post("/kb/ingest-text")
def kb_ingest_text_endpoint(body: KBIngestText, current_user=_auth_dep):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    result = ingest_text(body.text, body.source_name, tags=body.tags)
    return result

@app.post("/kb/ingest-file")
async def kb_ingest_file(
    file: UploadFile = File(...),
    tags: str        = Form(''),
    current_user=_auth_dep,
):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    safe_name = file.filename or f"upload_{uuid.uuid4().hex[:8]}"
    dest = KB_DIR / safe_name
    with open(dest, "wb") as fh:
        shutil.copyfileobj(file.file, fh)
    tag_list = [t.strip() for t in tags.split(',') if t.strip()] if tags else []
    try:
        result = ingest_file(dest, tags=tag_list)
    finally:
        try:
            dest.unlink(missing_ok=True)
        except Exception:
            pass
    return result

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
    removed = delete_source(source)
    return {"deleted": source, "chunks_removed": removed}

@app.delete("/kb/sources/{source}")
def kb_delete_source_alias(source: str, current_user=_auth_dep):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    removed = delete_source(source)
    return {"deleted": source, "chunks_removed": removed}

@app.post("/kb/clear")
def kb_clear(current_user=_auth_dep):
    if not RAG_ENABLED:
        return {"cleared": False, "reason": "RAG disabled"}
    clear_store()
    return {"cleared": True}

@app.get("/kb/search")
def kb_search_endpoint(q: str = Query(...), current_user=_auth_dep):
    if not RAG_ENABLED:
        return {"results": [], "error": "RAG disabled"}
    try:
        results = retrieve(q)
        return {"results": results}
    except Exception as e:
        logger.exception("KB search error")
        return {"results": [], "error": str(e)}

@app.post("/kb/query")
def kb_rag_query(body: RAGQuery, current_user=_auth_dep):
    if not RAG_ENABLED:
        return {"chunks": [], "error": "RAG disabled"}
    try:
        chunks = retrieve(body.query, top_k=body.top_k)
        return {"chunks": chunks, "query": body.query}
    except Exception as e:
        logger.exception("RAG query error")
        return {"chunks": [], "error": str(e)}

@app.post("/kb/reindex")
def kb_reindex(current_user=_auth_dep):
    if not RAG_ENABLED:
        raise HTTPException(status_code=404, detail="RAG disabled")
    return reindex_store()

# ---------------------------------------------------------------------------
# Filesystem config  /fs-config/*
# ---------------------------------------------------------------------------
@app.get("/fs-config")
def get_fs_config_endpoint(current_user=_auth_dep):
    if not FS_ENABLED: return {"access_list": [], "output_dir": None}
    return get_fs_config()

@app.get("/fs-config/audit")
def get_fs_audit(current_user=_auth_dep):
    if not FS_ENABLED: return {"audit": []}
    return {"audit": get_audit_log()}

@app.post("/fs-config/access")
async def add_fs_access(body: FSAccessEntry, current_user=_auth_dep):
    if not FS_ENABLED:
        raise HTTPException(status_code=404, detail="FS config disabled")
    result = add_access_entry(body.path, read=body.read, write=body.write)
    await broadcast({"type": "fs_config_updated", "config": get_fs_config()})
    return result

@app.delete("/fs-config/access")
async def remove_fs_access(path: str = Query(...), current_user=_auth_dep):
    if not FS_ENABLED:
        raise HTTPException(status_code=404, detail="FS config disabled")
    remove_access_entry(path)
    await broadcast({"type": "fs_config_updated", "config": get_fs_config()})
    return {"removed": path}

@app.put("/fs-config/access")
async def update_fs_flag(body: FSFlagUpdate, current_user=_auth_dep):
    if not FS_ENABLED:
        raise HTTPException(status_code=404, detail="FS config disabled")
    update_access_flag(body.path, body.flag, body.value)
    await broadcast({"type": "fs_config_updated", "config": get_fs_config()})
    return {"updated": True}

@app.post("/fs-config/output-dir")
async def set_output_dir_endpoint(body: FSOutputDir, current_user=_auth_dep):
    if not FS_ENABLED:
        raise HTTPException(status_code=404, detail="FS config disabled")
    set_output_dir(body.path)
    await broadcast({"type": "fs_config_updated", "config": get_fs_config()})
    return {"output_dir": body.path}

# ---------------------------------------------------------------------------
# Telegram  /telegram/*
# ---------------------------------------------------------------------------
@app.get("/telegram/config")
def get_telegram_config(current_user=_auth_dep):
    if not TELEGRAM_ENABLED:
        return JSONResponse(status_code=404, content={"note": "Telegram disabled"})
    try:    return TelegramBot.load_config(BASE_DIR)
    except Exception as e: return {"error": str(e)}

@app.post("/telegram/config")
def save_telegram_config(body: TelegramConfigUpdate, current_user=_auth_dep):
    if not TELEGRAM_ENABLED:
        return JSONResponse(status_code=404, content={"note": "Telegram disabled"})
    try:    TelegramBot.save_config(BASE_DIR, body.dict(exclude_none=True)); return {"saved": True}
    except Exception as e: return {"error": str(e)}

@app.post("/telegram/test")
async def test_telegram(current_user=_auth_dep):
    if not TELEGRAM_ENABLED: return {"error": "Telegram disabled"}
    try:
        cfg = TelegramBot.load_config(BASE_DIR)
        bot = TelegramBot(cfg)
        await bot.send_message("Test from Multi-Agent Orchestration")
        return {"sent": True}
    except Exception as e: return {"error": str(e)}

# ---------------------------------------------------------------------------
# Self-improver  /self-improver/*
# ---------------------------------------------------------------------------
@app.get("/self-improver/config")
def get_si_config(current_user=_auth_dep):
    if not SI_ENABLED: return {"enabled": False}
    return self_improver.get_config()

@app.post("/self-improver/config")
def save_si_config(body: SIConfigUpdate, current_user=_auth_dep):
    if not SI_ENABLED: return {"error": "Self-improver disabled"}
    self_improver.save_config(body.dict(exclude_none=True))
    return {"saved": True}

@app.post("/self-improver/run-now")
async def run_si_now(background_tasks: BackgroundTasks, current_user=_auth_dep):
    if not SI_ENABLED: return {"error": "Self-improver disabled"}
    background_tasks.add_task(self_improver.run_cycle)
    return {"triggered": True}

@app.get("/self-improver/best-practices")
def get_best_practices(current_user=_auth_dep):
    if not SI_ENABLED: return {"content": ""}
    return {"content": self_improver.get_best_practices()}

@app.get("/self-improver/proposals")
def get_proposals(current_user=_auth_dep):
    if not SI_ENABLED: return {"content": ""}
    return {"content": self_improver.get_proposals()}

@app.get("/self-improver/log")
def get_si_log(current_user=_auth_dep):
    if not SI_ENABLED: return {"content": ""}
    return {"content": self_improver.get_log()}

# ---------------------------------------------------------------------------
# Web Search  /web-search/*
# ---------------------------------------------------------------------------
@app.get("/web-search/config")
def get_ws_config(current_user=_auth_dep):
    if not WS_ENABLED: return {"enabled": False}
    return web_search.get_config()

@app.post("/web-search/config")
def save_ws_config(body: WebSearchConfigUpdate, current_user=_auth_dep):
    if not WS_ENABLED: return {"error": "Web search disabled"}
    web_search.save_config(body.dict(exclude_none=True))
    return {"saved": True}

@app.post("/web-search/test")
async def test_ws_providers(current_user=_auth_dep):
    if not WS_ENABLED: return {"error": "Web search disabled"}
    results = await web_search.test_providers()
    return {"providers": results}

@app.get("/web-search/query")
async def run_ws_query(q: str = Query(...), current_user=_auth_dep):
    if not WS_ENABLED: return {"error": "Web search disabled"}
    result = await web_search.search(q)
    return {"query": q, "result": result}
