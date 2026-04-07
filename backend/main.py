import asyncio
import base64
import importlib
import inspect
import io
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

import psutil
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
from pydantic import BaseModel

# ── local imports ────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))
from model_config import get_active_model, list_presets, set_active_model
from rag_engine import RAGEngine
from settings import SettingsManager
from tool_registry import ToolRegistry
from agent_registry import AgentRegistry
from fs_config import FSConfig

# ── optional deps ────────────────────────────────────────────────────────────
try:
    from database import Database, get_db
    DB_ENABLED = True
except ImportError:
    DB_ENABLED = False
    Database = None

try:
    import boto3
    S3_ENABLED = True
except ImportError:
    S3_ENABLED = False

STATS_ENABLED = True

# ── logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

# ── token stats ──────────────────────────────────────────────────────────────
_token_stats: Dict[str, int] = {"total_in": 0, "total_out": 0, "last_out": 0}

def _record_tokens(inp: int, out: int) -> None:
    _token_stats["total_in"]  += inp
    _token_stats["total_out"] += out
    _token_stats["last_out"]   = out

# ── auth ─────────────────────────────────────────────────────────────────────
REQUIRE_API_KEY = os.getenv("REQUIRE_API_KEY", "false").lower() == "true"
API_KEY         = os.getenv("API_KEY", "")

def _verify_key(request: Request):
    if not REQUIRE_API_KEY:
        return None
    key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
    if key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return key

_auth_dep = Depends(_verify_key)

# ── paths ─────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
UPLOADS_DIR = BASE_DIR / "uploads"
KB_DIR      = BASE_DIR / "knowledge_base"
REPORTS_DIR = BASE_DIR / "reports"
for _d in (UPLOADS_DIR, KB_DIR, REPORTS_DIR):
    _d.mkdir(exist_ok=True)

# ── singletons ───────────────────────────────────────────────────────────────
rag     = RAGEngine(str(KB_DIR))
settings_mgr = SettingsManager(str(BASE_DIR / "config"))
tool_reg     = ToolRegistry(str(BASE_DIR / "tools_dir"))
agent_reg    = AgentRegistry(str(BASE_DIR / "agents_dir"))
fs_cfg       = FSConfig(str(BASE_DIR / "fs_config.json"))

# ── in-memory job store ───────────────────────────────────────────────────────
jobs: Dict[str, Dict] = {}

# ── WebSocket manager ─────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active = [x for x in self.active if x is not ws]

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

def sync_broadcast(data: dict):
    """Fire-and-forget broadcast from sync context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(manager.broadcast(data))
        else:
            loop.run_until_complete(manager.broadcast(data))
    except Exception:
        pass

manager = ConnectionManager()

# ── lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting up MAO backend")
    yield
    log.info("Shutting down MAO backend")

# ── app ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Multi-Agent Orchestration", version="7.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════════════
# WEBSOCKET
# ══════════════════════════════════════════════════════════════════════════

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            data = await ws.receive_json()
            if data.get("type") == "run_task":
                task  = data.get("task", "")
                model = data.get("model") or get_active_model()
                job_id = str(uuid.uuid4())
                jobs[job_id] = {"status": "running", "task": task}
                threading.Thread(
                    target=_run_crew_task,
                    args=(job_id, task, model),
                    daemon=True,
                ).start()
                await ws.send_json({"type": "job_started", "job_id": job_id})
            elif data.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception as e:
        log.error(f"WS error: {e}")
        manager.disconnect(ws)

# ══════════════════════════════════════════════════════════════════════════
# HEALTH
# ══════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "version": "7.0.0"}

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

    ram_used_gb  = round(mem.used  / 1_073_741_824, 1) if mem else 0
    ram_total_gb = round(mem.total / 1_073_741_824, 1) if mem else 0
    ram_free_gb  = round(mem.available / 1_073_741_824, 1) if mem else 0
    ram_pct      = round(mem.percent, 1) if mem else 0
    disk_used_gb = round(disk.used  / 1_073_741_824, 1) if disk else 0
    disk_total_gb= round(disk.total / 1_073_741_824, 1) if disk else 0
    disk_pct     = round(disk.percent, 1) if disk else 0

    # Ollama active model info
    ollama_info = {"model": get_active_model(), "vram_mb": 0}
    try:
        import requests as _req
        ps = _req.get("http://localhost:11434/api/ps", timeout=1).json()
        if ps.get("models"):
            m = ps["models"][0]
            ollama_info = {
                "model":   m.get("name", get_active_model()),
                "vram_mb": round(m.get("size_vram", 0) / 1_048_576),
            }
    except Exception:
        pass

    tokens_last = _token_stats.get("last_out", 0)

    return {
        "cpu_pct":      cpu,
        "ram_used_gb":  ram_used_gb,
        "ram_total_gb": ram_total_gb,
        "ram_free_gb":  ram_free_gb,
        "ram_pct":      ram_pct,
        "disk_used_gb": disk_used_gb,
        "disk_total_gb":disk_total_gb,
        "disk_pct":     disk_pct,
        "active_jobs":  running,
        "total_jobs":   running + done + failed,
        "ws_clients":   len(manager.active),
        "tokens_in":    _token_stats["total_in"],
        "tokens_out":   _token_stats["total_out"],
        "tokens_last":  tokens_last,
        "ollama":       ollama_info,
        # legacy fields kept for backward compat
        "mem_used_mb":  round(mem.used / 1_048_576) if mem else 0,
        "mem_total_mb": round(mem.total / 1_048_576) if mem else 0,
        "jobs_running": running,
        "jobs_done":    done,
        "jobs_failed":  failed,
        "uptime_s":     round(time.time() - _start_time),
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