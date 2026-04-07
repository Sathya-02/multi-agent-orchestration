from typing import Any, Dict, List, Optional
import asyncio, base64, importlib, inspect, io, json, logging
import os, re, shutil, subprocess, sys, tempfile, threading, time, traceback, uuid
from contextlib import asynccontextmanager
from pathlib import Path

import psutil
from fastapi import (
    BackgroundTasks, Depends, FastAPI, File, Form, HTTPException,
    Query, Request, UploadFile, WebSocket, WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))
from model_config import get_active_model, list_presets, set_active_model
from rag_engine import RAGEngine
from settings import SettingsManager
from tool_registry import ToolRegistry
from agent_registry import AgentRegistry
from fs_config import FSConfig

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

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

_token_stats: Dict[str, int] = {"total_in": 0, "total_out": 0, "last_out": 0}

def _record_tokens(inp: int, out: int) -> None:
    _token_stats["total_in"]  += inp
    _token_stats["total_out"] += out
    _token_stats["last_out"]   = out

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

BASE_DIR    = Path(__file__).parent
UPLOADS_DIR = BASE_DIR / "uploads"
KB_DIR      = BASE_DIR / "knowledge_base"
REPORTS_DIR = BASE_DIR / "reports"
for _d in (UPLOADS_DIR, KB_DIR, REPORTS_DIR):
    _d.mkdir(exist_ok=True)

rag          = RAGEngine(str(KB_DIR))
settings_mgr = SettingsManager(str(BASE_DIR / "config"))
tool_reg     = ToolRegistry(str(BASE_DIR / "tools_dir"))
agent_reg    = AgentRegistry(str(BASE_DIR / "agents_dir"))
fs_cfg       = FSConfig(str(BASE_DIR / "fs_config.json"))

jobs: Dict[str, Dict] = {}

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
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(manager.broadcast(data))
        else:
            loop.run_until_complete(manager.broadcast(data))
    except Exception:
        pass

manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting up MAO backend")
    yield
    log.info("Shutting down MAO backend")

app = FastAPI(title="Multi-Agent Orchestration", version="7.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models ────────────────────────────────────────────────────────────
class TaskRequest(BaseModel):
    task: str
    model: Optional[str] = None

class ModelSelect(BaseModel):
    model: str

class KBQuery(BaseModel):
    query: str
    top_k: int = 5

class QueryRequest(BaseModel):
    query: str
    model: Optional[str] = None

class ResearchRequest(BaseModel):
    topic: str
    model: Optional[str] = None

class AgentCreate(BaseModel):
    name: str
    role: str
    goal: str
    backstory: str
    tools: List[str] = []

class AgentUpdate(BaseModel):
    name: str
    role: Optional[str] = None
    goal: Optional[str] = None
    backstory: Optional[str] = None
    tools: Optional[List[str]] = None

# ── WebSocket ──────────────────────────────────────────────────────────────────
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

# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "version": "7.0.0"}

# ── Stats ──────────────────────────────────────────────────────────────────────
@app.get("/stats")
def get_stats(current_user=_auth_dep):
    if not STATS_ENABLED:
        raise HTTPException(status_code=404, detail="Stats disabled")
    try:
        cpu  = psutil.cpu_percent(interval=0.1)
        mem  = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
    except Exception:
        cpu, mem, disk = 0, None, None

    running = sum(1 for j in jobs.values() if j.get("status") == "running")
    done    = sum(1 for j in jobs.values() if j.get("status") == "done")
    failed  = sum(1 for j in jobs.values() if j.get("status") == "failed")

    ram_used_gb  = round(mem.used      / 1_073_741_824, 1) if mem else 0
    ram_total_gb = round(mem.total     / 1_073_741_824, 1) if mem else 0
    ram_free_gb  = round(mem.available / 1_073_741_824, 1) if mem else 0
    ram_pct      = round(mem.percent, 1)                   if mem else 0
    disk_used_gb = round(disk.used     / 1_073_741_824, 1) if disk else 0
    disk_total_gb= round(disk.total    / 1_073_741_824, 1) if disk else 0
    disk_pct     = round(disk.percent, 1)                  if disk else 0

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
        "tokens_in":    _token_stats["total_in"],
        "tokens_out":   _token_stats["total_out"],
        "tokens_last":  _token_stats.get("last_out", 0),
        "ollama":       ollama_info,
        "ws_clients":   len(manager.active),
        "mem_used_mb":  round(mem.used  / 1_048_576) if mem else 0,
        "mem_total_mb": round(mem.total / 1_048_576) if mem else 0,
        "jobs_running": running,
        "jobs_done":    done,
        "jobs_failed":  failed,
        "uptime_s":     round(time.time() - _start_time),
    }

_start_time = time.time()

# ── Models ─────────────────────────────────────────────────────────────────────
@app.get("/models")
def list_models(current_user=_auth_dep):
    return {"active": get_active_model(), "presets": list_presets(), "models": list_presets()}

@app.post("/models/select")
def select_model(body: ModelSelect, current_user=_auth_dep):
    set_active_model(body.model)
    sync_broadcast({"type": "model_changed", "model": body.model})
    return {"active": body.model}

@app.get("/models/presets")
def get_presets(current_user=_auth_dep):
    return list_presets()

# ── Run task ───────────────────────────────────────────────────────────────────
def _run_crew_task(job_id: str, task: str, model: str):
    try:
        from agents_crew import build_agents
        from tasks_crew import build_tasks
        from crewai import Crew
        agents = build_agents(model)
        tasks  = build_tasks(task, agents)
        crew   = Crew(agents=agents, tasks=tasks, verbose=True)
        result = crew.kickoff()
        jobs[job_id] = {"status": "done", "result": str(result)}
        sync_broadcast({"type": "complete", "job_id": job_id, "result": str(result), "task": task})
    except Exception as e:
        jobs[job_id] = {"status": "failed", "error": str(e)}
        sync_broadcast({"type": "error", "job_id": job_id, "message": str(e)})

@app.post("/run")
def run_task(body: TaskRequest, background_tasks: BackgroundTasks, current_user=_auth_dep):
    model  = body.model or get_active_model()
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "running", "task": body.task}
    background_tasks.add_task(_run_crew_task, job_id, body.task, model)
    return {"job_id": job_id, "status": "started"}

@app.post("/stop")
def stop_task(current_user=_auth_dep):
    for j in jobs.values():
        if j.get("status") == "running":
            j["status"] = "stopped"
    return {"status": "stopped"}

@app.get("/jobs/{job_id}")
def get_job(job_id: str, current_user=_auth_dep):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

# ── Query / Research ───────────────────────────────────────────────────────────
@app.post("/query")
def quick_query(body: QueryRequest, current_user=_auth_dep):
    try:
        import ollama
        model  = body.model or get_active_model()
        resp   = ollama.chat(model=model, messages=[{"role": "user", "content": body.query}])
        result = resp["message"]["content"]
        _record_tokens(len(body.query.split()), len(result.split()))
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/research")
def research(body: ResearchRequest, current_user=_auth_dep):
    try:
        import ollama
        model  = body.model or get_active_model()
        prompt = f"Research the following topic thoroughly and provide a comprehensive summary:\n\n{body.topic}"
        resp   = ollama.chat(model=model, messages=[{"role": "user", "content": prompt}])
        result = resp["message"]["content"]
        _record_tokens(len(prompt.split()), len(result.split()))
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Knowledge Base ─────────────────────────────────────────────────────────────
@app.get("/kb/files")
def kb_files(current_user=_auth_dep):
    files = [f.name for f in KB_DIR.iterdir() if f.is_file()]
    return {"files": files}

@app.post("/kb/query")
def kb_query(body: KBQuery, current_user=_auth_dep):
    try:
        result = rag.query(body.query, top_k=body.top_k)
        return {"answer": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/kb/delete/{filename}")
def kb_delete(filename: str, current_user=_auth_dep):
    path = KB_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink()
    return {"status": "deleted", "file": filename}

# ── Upload ─────────────────────────────────────────────────────────────────────
@app.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    target: str = Form("kb"),
    current_user=_auth_dep,
):
    dest = KB_DIR if target == "kb" else UPLOADS_DIR
    saved = []
    for f in files:
        path = dest / f.filename
        with open(path, "wb") as fp:
            fp.write(await f.read())
        saved.append(f.filename)
        if target == "kb":
            try:
                rag.add_document(str(path))
            except Exception:
                pass
    return {"message": f"Uploaded {len(saved)} file(s)", "files": saved}

# ── File analysis ──────────────────────────────────────────────────────────────
@app.post("/analyze-file")
async def analyze_file(file: UploadFile = File(...), current_user=_auth_dep):
    content = await file.read()
    try:
        text = content.decode("utf-8", errors="ignore")[:8000]
    except Exception:
        text = str(content[:4000])
    try:
        import ollama
        model  = get_active_model()
        prompt = f"Analyse this file content and provide a detailed summary:\n\n{text}"
        resp   = ollama.chat(model=model, messages=[{"role": "user", "content": prompt}])
        return {"result": resp["message"]["content"], "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Tools ──────────────────────────────────────────────────────────────────────
@app.get("/tools")
def list_tools(current_user=_auth_dep):
    try:
        tools = tool_reg.list_tools()
        return {"tools": tools}
    except Exception:
        return {"tools": []}

# ── Agents ─────────────────────────────────────────────────────────────────────
@app.get("/agents/settings")
def get_agent_settings(current_user=_auth_dep):
    try:
        return agent_reg.get_all()
    except Exception:
        return {"custom_agents": []}

@app.post("/agents/settings")
def save_agent_settings(body: dict, current_user=_auth_dep):
    try:
        agent_reg.save_all(body)
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agents/create")
def create_agent(body: AgentCreate, current_user=_auth_dep):
    try:
        agent_reg.create(body.dict())
        return {"status": "created", "name": body.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agents/update")
def update_agent(body: AgentUpdate, current_user=_auth_dep):
    try:
        agent_reg.update(body.name, body.dict(exclude_none=True))
        return {"status": "updated", "name": body.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/agents/delete/{name}")
def delete_agent(name: str, current_user=_auth_dep):
    try:
        agent_reg.delete(name)
        return {"status": "deleted", "name": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Settings ───────────────────────────────────────────────────────────────────
@app.get("/settings")
def get_settings(current_user=_auth_dep):
    try:
        return settings_mgr.get_all()
    except Exception:
        return {}

@app.post("/settings")
def save_settings(body: dict, current_user=_auth_dep):
    try:
        settings_mgr.save_all(body)
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Filesystem ─────────────────────────────────────────────────────────────────
@app.get("/fs/list")
def fs_list(path: str = "/", current_user=_auth_dep):
    try:
        items = fs_cfg.list_dir(path)
        return {"items": items, "path": path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/fs/read")
def fs_read(path: str, current_user=_auth_dep):
    try:
        content = fs_cfg.read_file(path)
        return {"content": content, "path": path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
