"""
agent_registry.py — Runtime agent store

• Custom agents persist to custom_agents.json — survive restarts.
• Each agent has an active flag (soft-delete).
• Each agent folder: backend/agents/<slug_id>/SKILLS.md
"""
import uuid, time, re, json
from pathlib import Path
from typing import Optional

# ── Paths ─────────────────────────────────────────────────────────────────
AGENTS_DIR      = Path(__file__).parent / "agents"
_REGISTRY_PATH  = Path(__file__).parent / "custom_agents.json"
AGENTS_DIR.mkdir(exist_ok=True)

# ── SKILLS.md template ────────────────────────────────────────────────────
SKILLS_TEMPLATE = """# Agent Skills

## Role
{role}

## Goal
{goal}

## Backstory
{backstory}

## Tools
{tools}

## Config
max_iter: {max_iter}
allow_delegation: {allow_delegation}
"""

# ── Built-in agent definitions ────────────────────────────────────────────
_BUILTIN_AGENTS: list[dict] = [
    {
        "id": "coordinator", "label": "COORDINATOR",
        "role": "Research Coordinator",
        "goal": "Coordinate the research team, define the problem scope, and delegate tasks.",
        "backstory": (
            "You are a seasoned project coordinator with 15 years of experience "
            "managing multi-disciplinary research teams. You break complex problems "
            "into clear sub-tasks and ensure every team member works efficiently."
        ),
        "color": "#6C63FF", "icon": "🎯",
        "builtin": True, "active": True,
        "allow_delegation": True, "max_iter": 10,
        "tools": ["web_search", "request_new_agent"],
    },
    {
        "id": "researcher", "label": "RESEARCHER",
        "role": "Data Researcher",
        "goal": "Gather relevant data and factual information on the assigned topic.",
        "backstory": (
            "You are a meticulous data researcher who specialises in finding "
            "accurate, up-to-date information. You cross-reference sources and "
            "flag inconsistencies before passing findings to the analyst."
        ),
        "color": "#00BFA6", "icon": "🔍",
        "builtin": True, "active": True,
        "allow_delegation": False, "max_iter": 10,
        "tools": ["web_search", "knowledge_base_search", "summariser", "read_uploaded_file", "calculator"],
    },
    {
        "id": "analyst", "label": "ANALYST",
        "role": "Data Analyst",
        "goal": "Analyse gathered data, identify patterns, and produce actionable insights.",
        "backstory": (
            "You are an expert data analyst with a background in statistical "
            "modelling and pattern recognition. You translate raw information "
            "into structured insights that the writing team can use directly."
        ),
        "color": "#FF6584", "icon": "📊",
        "builtin": True, "active": True,
        "allow_delegation": False, "max_iter": 10,
        "tools": ["data_analyser", "knowledge_base_search", "summariser", "read_uploaded_file", "calculator"],
    },
    {
        "id": "writer", "label": "WRITER",
        "role": "Report Writer",
        "goal": "Synthesise research and analysis into a clear, well-structured report.",
        "backstory": (
            "You are a professional technical writer who crafts compelling, "
            "structured reports from complex technical findings. You ensure "
            "clarity, correct terminology, and logical narrative flow."
        ),
        "color": "#FFC107", "icon": "✍️",
        "builtin": True, "active": True,
        "allow_delegation": False, "max_iter": 10,
        "tools": ["summariser"],
    },
    {
        "id": "fs_agent", "label": "FILE SYSTEM",
        "role": "File System Agent",
        "goal": "Read, write, edit and organise files within permitted folders.",
        "backstory": (
            "You are a precise and security-conscious file system agent. "
            "You never access paths outside the permitted folders."
        ),
        "color": "#38bdf8", "icon": "🗂️",
        "builtin": True, "active": True,
        "allow_delegation": False, "max_iter": 10,
        "tools": ["fs_read_file", "fs_list_dir", "fs_write_file", "fs_edit_file"],
    },
]

_agents:         list[dict] = [dict(a) for a in _BUILTIN_AGENTS]
_pending_spawns: list[dict] = []
_spawn_enabled:  bool       = True

CUSTOM_COLORS = ["#a78bfa","#34d399","#fb7185","#38bdf8","#f472b6","#fbbf24","#a3e635"]
CUSTOM_ICONS  = ["🤖","🧠","🔬","🛠️","🧩","📝","🌐","⚡","🔭","🎨"]


# ─────────────────────────────────────────────────────────────────────────
# Path helpers
# ─────────────────────────────────────────────────────────────────────────

def _slug(text: str) -> str:
    """'Critics Agent' → 'critics_agent'"""
    s = re.sub(r'[^a-zA-Z0-9 _-]', '', text.strip().lower())
    s = re.sub(r'[ \-]+', '_', s).strip('_')
    return s or "agent"


def agent_folder(agent_id: str) -> Path:
    f = AGENTS_DIR / agent_id
    f.mkdir(parents=True, exist_ok=True)
    return f


def skills_path(agent_id: str) -> Path:
    return agent_folder(agent_id) / "SKILLS.md"


# ─────────────────────────────────────────────────────────────────────────
# SKILLS.md read / write
# ─────────────────────────────────────────────────────────────────────────

def write_skills_file(agent: dict) -> Path:
    p      = skills_path(agent["id"])
    tools  = ", ".join(agent.get("tools") or [])
    p.write_text(SKILLS_TEMPLATE.format(
        role=agent.get("role",""),
        goal=agent.get("goal",""),
        backstory=agent.get("backstory",""),
        tools=tools,
        max_iter=agent.get("max_iter",10),
        allow_delegation=str(agent.get("allow_delegation",False)),
    ), encoding="utf-8")
    return p


def read_skills_file(agent_id: str) -> Optional[dict]:
    p = skills_path(agent_id)
    if not p.exists():
        return None
    text = p.read_text(encoding="utf-8")
    out: dict = {}

    def _section(h: str) -> str:
        m = re.search(rf"^##\s+{re.escape(h)}\s*\n(.*?)(?=^##|\Z)",
                      text, re.MULTILINE | re.DOTALL)
        return m.group(1).strip() if m else ""

    out["role"]      = _section("Role")      or None
    out["goal"]      = _section("Goal")      or None
    out["backstory"] = _section("Backstory") or None
    tools_raw = _section("Tools")
    if tools_raw:
        out["tools"] = [t.strip() for t in re.split(r"[,\n]+", tools_raw) if t.strip()]
    for line in _section("Config").splitlines():
        if "max_iter" in line:
            try: out["max_iter"] = int(re.search(r"\d+", line).group())
            except: pass
        if "allow_delegation" in line:
            out["allow_delegation"] = "true" in line.lower()
    return {k: v for k, v in out.items() if v is not None}


def get_skills_text(agent_id: str) -> str:
    p = skills_path(agent_id)
    return p.read_text(encoding="utf-8") if p.exists() else ""


def save_skills_text(agent_id: str, text: str) -> None:
    p = skills_path(agent_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    parsed = read_skills_file(agent_id)
    if parsed:
        update_agent(agent_id, parsed)


# ─────────────────────────────────────────────────────────────────────────
# Custom agent persistence (JSON) — survives restarts
# ─────────────────────────────────────────────────────────────────────────

def _save_custom_agents() -> None:
    """Write all non-builtin agents to custom_agents.json."""
    custom = [a for a in _agents if not a.get("builtin")]
    safe   = [{k: str(v) if isinstance(v, Path) else v
               for k, v in a.items()} for a in custom]
    try:
        _REGISTRY_PATH.write_text(json.dumps(safe, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[agent_registry] save failed: {e}")


def _load_custom_agents() -> None:
    """Restore persisted custom agents into _agents on startup."""
    if not _REGISTRY_PATH.exists():
        return
    try:
        data = json.loads(_REGISTRY_PATH.read_text(encoding="utf-8"))
        for a in data:
            aid = a.get("id","")
            if not aid or get_agent(aid):
                continue
            if find_agent_by_role(a.get("role","")):
                continue
            a.setdefault("builtin", False)
            a.setdefault("active",  True)
            a.setdefault("tools",   ["web_search","summariser","calculator"])
            _agents.append(a)
            # Recreate SKILLS.md if folder was deleted
            if not skills_path(aid).exists():
                write_skills_file(a)
    except Exception as e:
        print(f"[agent_registry] load failed: {e}")


def ensure_skills_files() -> None:
    """Called once at startup — load persisted agents, then scaffold SKILLS.md."""
    _load_custom_agents()
    for a in _agents:
        if not skills_path(a["id"]).exists():
            write_skills_file(a)


# ─────────────────────────────────────────────────────────────────────────
# Spawn toggle
# ─────────────────────────────────────────────────────────────────────────

def is_spawn_enabled() -> bool:    return _spawn_enabled
def set_spawn_enabled(v: bool):
    global _spawn_enabled; _spawn_enabled = v


# ─────────────────────────────────────────────────────────────────────────
# Agent CRUD
# ─────────────────────────────────────────────────────────────────────────

def get_all_agents(include_inactive: bool = True) -> list[dict]:
    return list(_agents) if include_inactive else [a for a in _agents if a.get("active",True)]

def get_active_agents() -> list[dict]:
    return [a for a in _agents if a.get("active", True)]

def get_agent(agent_id: str) -> Optional[dict]:
    return next((a for a in _agents if a["id"] == agent_id), None)

def find_agent_by_role(role: str) -> Optional[dict]:
    r = role.strip().lower()
    return next((a for a in _agents if a["role"].strip().lower() == r), None)

def role_exists(role: str) -> bool:
    return find_agent_by_role(role) is not None


def add_agent(definition: dict) -> tuple[dict, bool]:
    requested_role = definition.get("role", "Custom Agent").strip()
    existing = find_agent_by_role(requested_role)
    if existing:
        return existing, False

    # Slug-based human-readable ID from label or role
    base_id  = definition.get("id") or _slug(
        definition.get("label","") or requested_role
    )
    agent_id = base_id
    suffix   = 1
    while get_agent(agent_id):
        agent_id = f"{base_id}_{suffix}"; suffix += 1

    idx   = len([a for a in _agents if not a.get("builtin")]) % len(CUSTOM_COLORS)
    tools = definition.get("tools")
    if not tools or not isinstance(tools, list):
        tools = ["web_search", "summariser", "calculator"]

    new_agent = {
        "id":               agent_id,
        "label":            definition.get("label", requested_role.upper()[:16]),
        "role":             requested_role,
        "goal":             definition.get("goal", "Complete assigned tasks effectively."),
        "backstory":        definition.get("backstory", "You are a capable AI assistant."),
        "color":            definition.get("color", CUSTOM_COLORS[idx]),
        "icon":             definition.get("icon", "🤖"),
        "builtin":          False,
        "active":           True,
        "allow_delegation": bool(definition.get("allow_delegation", False)),
        "max_iter":         int(definition.get("max_iter", 10)),
        "tools":            tools,
        "skills_file":      str(skills_path(agent_id)),
    }
    _agents.append(new_agent)
    write_skills_file(new_agent)
    _save_custom_agents()
    return new_agent, True


def update_agent(agent_id: str, updates: dict) -> Optional[dict]:
    new_role = updates.get("role","").strip()
    if new_role:
        conflict = find_agent_by_role(new_role)
        if conflict and conflict["id"] != agent_id:
            updates = {k:v for k,v in updates.items() if k != "role"}
    for a in _agents:
        if a["id"] == agent_id:
            for k in ("role","goal","backstory","icon","color","label",
                      "allow_delegation","max_iter","tools","active"):
                if k in updates:
                    a[k] = updates[k]
            write_skills_file(a)
            _save_custom_agents()
            return a
    return None


def remove_agent(agent_id: str) -> bool:
    global _agents
    before  = len(_agents)
    _agents = [a for a in _agents if not (a["id"]==agent_id and not a.get("builtin"))]
    changed = len(_agents) < before
    if changed:
        _save_custom_agents()
    return changed


def set_agent_active(agent_id: str, active: bool) -> Optional[dict]:
    for a in _agents:
        if a["id"] == agent_id:
            a["active"] = active
            write_skills_file(a)
            _save_custom_agents()
            return a
    return None


# ─────────────────────────────────────────────────────────────────────────
# Spawn request queue
# ─────────────────────────────────────────────────────────────────────────

def request_spawn(requested_by: str, suggestion: dict) -> dict:
    req = {"request_id": uuid.uuid4().hex[:8], "requested_by": requested_by,
           "status": "pending", "suggestion": suggestion, "ts": time.time()}
    _pending_spawns.append(req)
    return req

def get_pending_spawns() -> list[dict]:
    return [r for r in _pending_spawns if r["status"] == "pending"]

def resolve_spawn(request_id: str, approved: bool) -> Optional[dict]:
    for r in _pending_spawns:
        if r["request_id"] == request_id:
            if approved:
                agent, created = add_agent(r["suggestion"])
                if created:
                    r["status"] = "approved"; r["agent_id"] = agent["id"]
                else:
                    r["status"] = "rejected"
                    r["reason"] = f"Role '{agent['role']}' already exists."
            else:
                r["status"] = "rejected"
            return r
    return None
