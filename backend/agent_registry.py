"""
agent_registry.py — Persistent agent store with YAML skills support.

Fix: read_skills_file now checks both .yaml and .json extensions and
always returns a dict (never None) so callers can safely .get() on it.
"""
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

BASE_DIR   = Path(__file__).parent
DATA_DIR   = BASE_DIR / "data"
AGENTS_DIR = BASE_DIR / "agents_dir"
DATA_DIR.mkdir(parents=True, exist_ok=True)
AGENTS_DIR.mkdir(parents=True, exist_ok=True)

AGENTS_FILE   = DATA_DIR / "agents.json"
SPAWN_CFG     = DATA_DIR / "spawn_config.json"


# ---------------------------------------------------------------------------
# Default built-in agent definitions
# ---------------------------------------------------------------------------
DEFAULT_AGENTS: List[Dict[str, Any]] = [
    {
        "id":        "coordinator",
        "role":      "Research Coordinator",
        "label":     "Coordinator",
        "goal":      "Plan and coordinate the research workflow. Produce a concise research plan.",
        "backstory": "Expert research coordinator known for crisp, actionable planning.",
        "icon":      "🧭",
        "color":     "#6366f1",
        "active":    True,
        "tools":     ["web_search", "summariser", "request_new_agent"],
        "max_iter":  4,
    },
    {
        "id":        "researcher",
        "role":      "Research Specialist",
        "label":     "Researcher",
        "goal":      "Gather comprehensive information and return a structured bullet-point summary.",
        "backstory": "Meticulous researcher skilled at finding and synthesising information.",
        "icon":      "🔍",
        "color":     "#3b82f6",
        "active":    True,
        "tools":     ["web_search", "knowledge_base_search", "summariser",
                      "read_uploaded_file", "calculator"],
        "max_iter":  5,
    },
    {
        "id":        "analyst",
        "role":      "Data Analyst",
        "label":     "Analyst",
        "goal":      "Analyse findings and identify the top 3-5 patterns, insights, and risks.",
        "backstory": "Sharp analyst who transforms raw research into actionable insights.",
        "icon":      "📊",
        "color":     "#10b981",
        "active":    True,
        "tools":     ["data_analyser", "knowledge_base_search", "summariser",
                      "read_uploaded_file", "calculator"],
        "max_iter":  4,
    },
    {
        "id":        "writer",
        "role":      "Report Writer",
        "label":     "Writer",
        "goal":      "Write a professional markdown report with Executive Summary, Key Findings, Analysis, Recommendations.",
        "backstory": "Experienced technical writer producing clear, professional reports.",
        "icon":      "✍️",
        "color":     "#f59e0b",
        "active":    True,
        "tools":     ["summariser", "read_uploaded_file"],
        "max_iter":  4,
    },
]


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

def _load_agents() -> List[Dict[str, Any]]:
    if AGENTS_FILE.exists():
        try:
            data = json.loads(AGENTS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except Exception as e:
            logger.warning("Failed to load agents.json: %s", e)
    return []


def _save_agents(agents: List[Dict[str, Any]]) -> None:
    AGENTS_FILE.write_text(json.dumps(agents, indent=2), encoding="utf-8")


def _get_all() -> List[Dict[str, Any]]:
    """Return merged list: defaults overridden/extended by persisted agents."""
    persisted = {a["id"]: a for a in _load_agents()}
    result = []
    for defn in DEFAULT_AGENTS:
        merged = {**defn, **persisted.pop(defn["id"], {})}
        result.append(merged)
    # Any custom agents (not in DEFAULT_AGENTS)
    result.extend(persisted.values())
    return result


# ---------------------------------------------------------------------------
# Skills file helpers — supports .yaml and .json
# ---------------------------------------------------------------------------

def _skills_path(agent_id: str) -> Optional[Path]:
    """Return the first existing skills file for agent_id, or None."""
    for ext in (".yaml", ".yml", ".json"):
        p = AGENTS_DIR / f"{agent_id}_skills{ext}"
        if p.exists():
            return p
    return None


def read_skills_file(agent_id: str) -> Dict[str, Any]:
    """
    Read the skills file for agent_id.
    Returns a dict (possibly empty) — NEVER None.
    Supports .yaml, .yml, and .json formats.
    """
    p = _skills_path(agent_id)
    if p is None:
        return {}
    try:
        text = p.read_text(encoding="utf-8")
        if p.suffix in (".yaml", ".yml"):
            try:
                import yaml
                data = yaml.safe_load(text)
                return data if isinstance(data, dict) else {}
            except ImportError:
                # yaml not installed — parse simple key: value manually
                result: Dict[str, Any] = {}
                current_key = None
                current_lines: List[str] = []
                for line in text.splitlines():
                    stripped = line.strip()
                    if not stripped or stripped.startswith("#"):
                        continue
                    if ": " in line and not line.startswith(" ") and not line.startswith("-"):
                        if current_key:
                            result[current_key] = " ".join(current_lines).strip()
                        parts = line.split(": ", 1)
                        current_key = parts[0].strip()
                        val = parts[1].strip().lstrip(">")
                        current_lines = [val] if val else []
                    elif line.startswith("  - ") or line.startswith("- "):
                        val = stripped.lstrip("- ")
                        if current_key == "tools" and val:
                            if current_key not in result:
                                result[current_key] = []
                            result[current_key].append(val)
                    elif line.startswith(" ") and current_key:
                        current_lines.append(stripped)
                if current_key and current_key not in result:
                    result[current_key] = " ".join(current_lines).strip()
                return result
        else:
            data = json.loads(text)
            return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.warning("read_skills_file(%s): %s", agent_id, e)
        return {}


def get_skills_text(agent_id: str) -> str:
    """Return raw text of skills file for UI editing."""
    p = _skills_path(agent_id)
    if p is None:
        # Return a default YAML template
        return (
            f"# Skills for {agent_id}\n"
            f"role: {agent_id.replace('_', ' ').title()}\n"
            f"goal: >\n  Describe the goal here.\n"
            f"backstory: >\n  Describe the backstory here.\n"
            f"max_iter: 4\n"
            f"tools:\n  - summariser\n"
        )
    return p.read_text(encoding="utf-8")


def save_skills_text(agent_id: str, text: str) -> None:
    """Save raw text to skills file (prefer .yaml)."""
    p = _skills_path(agent_id)
    if p is None:
        p = AGENTS_DIR / f"{agent_id}_skills.yaml"
    p.write_text(text, encoding="utf-8")


def ensure_skills_files() -> None:
    """Create default skills YAML files for built-in agents if missing."""
    defaults = {
        "coordinator": (
            "# Coordinator agent skills\n"
            "role: Research Coordinator\n"
            "goal: >\n"
            "  Plan and coordinate the research workflow. Produce a clear, concise research\n"
            "  plan outlining key questions, primary sources, and report structure.\n"
            "  Do NOT delegate — write the plan yourself.\n"
            "backstory: >\n"
            "  Expert research coordinator known for crisp, actionable planning.\n"
            "max_iter: 4\n"
            "tools:\n"
            "  - web_search\n"
            "  - summariser\n"
            "  - request_new_agent\n"
        ),
        "researcher": (
            "# Researcher agent skills\n"
            "role: Research Specialist\n"
            "goal: >\n"
            "  Gather comprehensive information and return a structured bullet-point\n"
            "  summary with key findings and sources.\n"
            "backstory: >\n"
            "  Meticulous researcher skilled at finding and synthesising information.\n"
            "max_iter: 5\n"
            "tools:\n"
            "  - web_search\n"
            "  - knowledge_base_search\n"
            "  - summariser\n"
            "  - read_uploaded_file\n"
            "  - calculator\n"
        ),
        "analyst": (
            "# Analyst agent skills\n"
            "role: Data Analyst\n"
            "goal: >\n"
            "  Analyse findings and identify the top 3-5 patterns, insights, and risks.\n"
            "backstory: >\n"
            "  Sharp analyst who transforms raw research into actionable insights.\n"
            "max_iter: 4\n"
            "tools:\n"
            "  - data_analyser\n"
            "  - knowledge_base_search\n"
            "  - summariser\n"
            "  - read_uploaded_file\n"
            "  - calculator\n"
        ),
        "writer": (
            "# Writer agent skills\n"
            "role: Report Writer\n"
            "goal: >\n"
            "  Write a professional markdown report with Executive Summary,\n"
            "  Key Findings, Analysis, and Recommendations. Be concise.\n"
            "backstory: >\n"
            "  Experienced technical writer producing clear, professional reports.\n"
            "max_iter: 4\n"
            "tools:\n"
            "  - summariser\n"
            "  - read_uploaded_file\n"
        ),
    }
    for agent_id, content in defaults.items():
        p = AGENTS_DIR / f"{agent_id}_skills.yaml"
        if not p.exists():
            try:
                p.write_text(content, encoding="utf-8")
                logger.info("Created default skills file: %s", p)
            except Exception as e:
                logger.warning("Could not write %s: %s", p, e)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_all_agents() -> List[Dict[str, Any]]:
    return _get_all()


def get_active_agents() -> List[Dict[str, Any]]:
    return [a for a in _get_all() if a.get("active", True)]


def add_agent(data: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    agents = _load_agents()
    role   = data.get("role", "").strip().lower()
    for a in agents:
        if a.get("role", "").strip().lower() == role:
            return a, False  # duplicate
    new_agent = {
        "id":        data.get("id") or _make_id(data.get("role", "agent")),
        "role":      data.get("role", "Agent"),
        "label":     data.get("label") or data.get("role", "Agent"),
        "goal":      data.get("goal", ""),
        "backstory": data.get("backstory", ""),
        "icon":      data.get("icon", "🤖"),
        "color":     data.get("color", "#a78bfa"),
        "active":    True,
        "tools":     data.get("tools", ["web_search", "summariser"]),
        "max_iter":  int(data.get("max_iter", DEFAULT_AGENTS[0].get("max_iter", 4))),
        "created":   datetime.utcnow().isoformat(),
    }
    agents.append(new_agent)
    _save_agents(agents)
    return new_agent, True


def update_agent(agent_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    agents = _load_agents()
    for a in agents:
        if a["id"] == agent_id:
            a.update(updates)
            _save_agents(agents)
            return a
    # agent might be a default — persist an override
    for defn in DEFAULT_AGENTS:
        if defn["id"] == agent_id:
            merged = {**defn, **updates}
            agents.append(merged)
            _save_agents(agents)
            return merged
    return None


def remove_agent(agent_id: str) -> None:
    agents = [a for a in _load_agents() if a["id"] != agent_id]
    _save_agents(agents)


def set_agent_active(agent_id: str, active: bool) -> None:
    update_agent(agent_id, {"active": active})


def role_exists(role: str) -> bool:
    r = role.strip().lower()
    return any(a.get("role", "").strip().lower() == r for a in _get_all())


def find_agent_by_role(role: str) -> Optional[Dict[str, Any]]:
    r = role.strip().lower()
    for a in _get_all():
        if a.get("role", "").strip().lower() == r:
            return a
    return None


def is_spawn_enabled() -> bool:
    if SPAWN_CFG.exists():
        try:
            return json.loads(SPAWN_CFG.read_text()).get("enabled", True)
        except Exception:
            pass
    return True


def request_spawn(requested_by: str, suggestion: dict) -> dict:
    req = {
        "request_id": str(uuid.uuid4())[:8],
        "requested_by": requested_by,
        "suggestion":   suggestion,
        "ts":           datetime.utcnow().isoformat(),
        "resolved":     False,
        "approved":     None,
    }
    return req


def _make_id(role: str) -> str:
    import re
    s = re.sub(r"[^a-zA-Z0-9 _-]", "", role.strip().lower())
    return re.sub(r"[ \-]+", "_", s).strip("_") or "agent"
