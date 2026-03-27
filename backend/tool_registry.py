"""
tool_registry.py — Custom Tool Store

Mirrors the agent_registry pattern:
  • Each tool has a dedicated folder: backend/tools/<tool_id>/
  • A TOOL.md file defines the tool's name, description, and Python code
  • Custom tools are persisted to custom_tools.json
  • Agents can request new tools (spawn_tool); human approval required
  • Approved tools are saved, loaded, and available to agents immediately

TOOL.md format:
  ## Name
  my_tool_name          ← tool ID used in SKILLS.md / agent config

  ## Description
  One-sentence description shown to the LLM.

  ## Code
  ```python
  def _run(self, input_data):
      # input_data is always a string
      return "result string"
  ```
"""
import uuid, time, re, json, textwrap
from pathlib import Path
from typing import Optional

TOOLS_DIR      = Path(__file__).parent / "tools"
_REGISTRY_PATH = Path(__file__).parent / "custom_tools.json"
TOOLS_DIR.mkdir(exist_ok=True)

TOOL_MD_TEMPLATE = """# Tool Definition

## Name
{name}

## Description
{description}

## Tags
{tags}

## Code
```python
def _run(self, input_data):
    # input_data is always a string passed by the agent
    # Return a string result
{code_indented}
```
"""

# ── Built-in tool catalogue (metadata only — classes live in tools.py) ─────
BUILTIN_TOOLS: list[dict] = [
    {
        "id": "web_search", "name": "web_search",
        "display_name": "Web Search",
        "description": "Search the web for real-time information — current events, weather, date/time, exchange rates, news. Enable in ⚙️ Settings → Web Search.",
        "tags": ["search", "research"],
        "builtin": True, "active": True,
        "module": "tools", "class_name": "MockSearchTool"  # Smart tool — routes to real providers when enabled,
    },
    {
        "id": "data_analyser", "name": "data_analyser",
        "display_name": "Data Analyser",
        "description": "Analyse data or text and extract key insights.",
        "tags": ["analysis", "insights"],
        "builtin": True, "active": True,
        "module": "tools", "class_name": "DataAnalysisTool",
    },
    {
        "id": "summariser", "name": "summariser",
        "display_name": "Summariser",
        "description": "Summarise long content into concise bullet points.",
        "tags": ["summary", "condensing"],
        "builtin": True, "active": True,
        "module": "tools", "class_name": "SummaryTool",
    },
    {
        "id": "read_uploaded_file", "name": "read_uploaded_file",
        "display_name": "File Reader",
        "description": "Read the content of an uploaded file (PDF, DOCX, CSV, XLSX, TXT).",
        "tags": ["files", "reading"],
        "builtin": True, "active": True,
        "module": "tools", "class_name": "FileReadTool",
    },
    {
        "id": "calculator", "name": "calculator",
        "display_name": "Calculator",
        "description": "Evaluate mathematical expressions and perform calculations.",
        "tags": ["maths", "calculation"],
        "builtin": True, "active": True,
        "module": "tools", "class_name": "MathTool",
    },
    {
        "id": "request_new_agent", "name": "request_new_agent",
        "display_name": "Spawn Agent",
        "description": "Request creation of a new specialised agent (human approval required).",
        "tags": ["spawn", "agents"],
        "builtin": True, "active": True,
        "module": "tools", "class_name": "SpawnAgentTool",
    },
    {
        "id": "request_new_tool", "name": "request_new_tool",
        "display_name": "Spawn Tool",
        "description": "Request creation of a new custom tool when a needed capability is missing (human approval required).",
        "tags": ["spawn", "tools"],
        "builtin": True, "active": True,
        "module": "tools", "class_name": "SpawnToolTool",
    },
    {
        "id": "fs_read_file", "name": "fs_read_file",
        "display_name": "FS Read File",
        "description": "Read a file from an allowed local filesystem folder.",
        "tags": ["filesystem", "reading"],
        "builtin": True, "active": True,
        "module": "fs_tools", "class_name": "FSReadTool",
    },
    {
        "id": "fs_list_dir", "name": "fs_list_dir",
        "display_name": "FS List Directory",
        "description": "List files and subdirectories in an allowed local folder.",
        "tags": ["filesystem", "listing"],
        "builtin": True, "active": True,
        "module": "fs_tools", "class_name": "FSListTool",
    },
    {
        "id": "fs_write_file", "name": "fs_write_file",
        "display_name": "FS Write File",
        "description": "Create a new file in an allowed local filesystem folder.",
        "tags": ["filesystem", "writing"],
        "builtin": True, "active": True,
        "module": "fs_tools", "class_name": "FSWriteTool",
    },
    {
        "id": "fs_edit_file", "name": "fs_edit_file",
        "display_name": "FS Edit File",
        "description": "Overwrite or append to an existing file in an allowed folder.",
        "tags": ["filesystem", "editing"],
        "builtin": True, "active": True,
        "module": "fs_tools", "class_name": "FSEditTool",
    },
]

_tools:              list[dict] = [dict(t) for t in BUILTIN_TOOLS]
_pending_tool_spawns: list[dict] = []


# ─────────────────────────────────────────────────────────────────────────
# Path helpers
# ─────────────────────────────────────────────────────────────────────────

def _slug(text: str) -> str:
    s = re.sub(r'[^a-zA-Z0-9 _-]', '', text.strip().lower())
    s = re.sub(r'[ \-]+', '_', s).strip('_')
    return s or "tool"


def tool_folder(tool_id: str) -> Path:
    f = TOOLS_DIR / tool_id
    f.mkdir(parents=True, exist_ok=True)
    return f


def tool_md_path(tool_id: str) -> Path:
    return tool_folder(tool_id) / "TOOL.md"


# ─────────────────────────────────────────────────────────────────────────
# TOOL.md read / write
# ─────────────────────────────────────────────────────────────────────────

def write_tool_md(tool: dict) -> Path:
    p    = tool_md_path(tool["id"])
    code = tool.get("code", "    return f\"Custom tool '{tool.get('name','?')}' called with: {input_data}\"")
    # Ensure code is indented with 4 spaces inside the function
    lines = code.split("\n")
    indented = "\n".join("    " + l if l.strip() else l for l in lines)
    tags = ", ".join(tool.get("tags") or [])
    content = TOOL_MD_TEMPLATE.format(
        name=tool.get("name", tool["id"]),
        description=tool.get("description", ""),
        tags=tags,
        code_indented=indented,
    )
    p.write_text(content, encoding="utf-8")
    return p


def read_tool_md(tool_id: str) -> Optional[dict]:
    """Parse TOOL.md and return dict with name, description, tags, code."""
    p = tool_md_path(tool_id)
    if not p.exists():
        return None
    text = p.read_text(encoding="utf-8")
    out: dict = {}

    def _section(h: str) -> str:
        m = re.search(rf"^##\s+{re.escape(h)}\s*\n(.*?)(?=^##|\Z)",
                      text, re.MULTILINE | re.DOTALL)
        return m.group(1).strip() if m else ""

    out["name"]        = _section("Name")        or None
    out["description"] = _section("Description") or None
    raw_tags = _section("Tags")
    if raw_tags:
        out["tags"] = [t.strip() for t in re.split(r"[,\n]+", raw_tags) if t.strip()]

    code_block = _section("Code")
    if code_block:
        # Extract code from fenced block if present
        m = re.search(r"```python\s*\n(.*?)```", code_block, re.DOTALL)
        if m:
            code_raw = m.group(1)
        else:
            code_raw = code_block
        # Strip the outer def _run(self, input_data): wrapper — keep body only
        lines = code_raw.split("\n")
        body  = []
        in_fn = False
        for line in lines:
            if re.match(r"\s*def _run\s*\(", line):
                in_fn = True
                continue
            if in_fn:
                # De-dent one level (4 spaces)
                body.append(line[4:] if line.startswith("    ") else line)
        out["code"] = "\n".join(body).strip() if body else code_raw.strip()

    return {k: v for k, v in out.items() if v is not None}


def get_tool_md_text(tool_id: str) -> str:
    p = tool_md_path(tool_id)
    return p.read_text(encoding="utf-8") if p.exists() else ""


def save_tool_md_text(tool_id: str, text: str) -> None:
    """Overwrite TOOL.md and reload registry fields."""
    p = tool_md_path(tool_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    parsed = read_tool_md(tool_id)
    if parsed:
        update_tool(tool_id, parsed)


# ─────────────────────────────────────────────────────────────────────────
# Persistence
# ─────────────────────────────────────────────────────────────────────────

def _save_custom_tools() -> None:
    custom = [t for t in _tools if not t.get("builtin")]
    safe   = [{k: v for k, v in t.items()} for t in custom]
    try:
        _REGISTRY_PATH.write_text(json.dumps(safe, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[tool_registry] save failed: {e}")


def _load_custom_tools() -> None:
    if not _REGISTRY_PATH.exists():
        return
    try:
        data = json.loads(_REGISTRY_PATH.read_text(encoding="utf-8"))
        for t in data:
            tid = t.get("id", "")
            if not tid or get_tool(tid):
                continue
            t.setdefault("builtin", False)
            t.setdefault("active", True)
            _tools.append(t)
            if not tool_md_path(tid).exists():
                write_tool_md(t)
    except Exception as e:
        print(f"[tool_registry] load failed: {e}")


def ensure_tool_files() -> None:
    """Called at startup — load persisted tools, scaffold TOOL.md."""
    _load_custom_tools()
    for t in _tools:
        if not t.get("builtin") and not tool_md_path(t["id"]).exists():
            write_tool_md(t)


# ─────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────

def get_all_tools(include_inactive: bool = True) -> list[dict]:
    return list(_tools) if include_inactive else [t for t in _tools if t.get("active", True)]


def get_active_tools() -> list[dict]:
    return [t for t in _tools if t.get("active", True)]


def get_tool(tool_id: str) -> Optional[dict]:
    return next((t for t in _tools if t["id"] == tool_id), None)


def find_tool_by_name(name: str) -> Optional[dict]:
    n = name.strip().lower()
    return next((t for t in _tools if t.get("name","").lower() == n), None)


def name_exists(name: str) -> bool:
    return find_tool_by_name(name) is not None


def add_tool(definition: dict) -> tuple[dict, bool]:
    """Add a new custom tool. Returns (tool, created)."""
    req_name = _slug(definition.get("name", "") or definition.get("display_name", "tool"))
    existing = find_tool_by_name(req_name)
    if existing:
        return existing, False

    base_id  = definition.get("id") or req_name
    tool_id  = base_id
    suffix   = 1
    while get_tool(tool_id):
        tool_id = f"{base_id}_{suffix}"; suffix += 1

    new_tool = {
        "id":           tool_id,
        "name":         req_name,
        "display_name": definition.get("display_name", req_name.replace("_", " ").title()),
        "description":  definition.get("description", "A custom tool."),
        "tags":         definition.get("tags", []),
        "code":         definition.get("code", "    return f\"Tool called with: {input_data}\""),
        "builtin":      False,
        "active":       True,
        "tool_file":    str(tool_md_path(tool_id)),
        "added":        time.time(),
    }
    _tools.append(new_tool)
    write_tool_md(new_tool)
    _save_custom_tools()
    return new_tool, True


def update_tool(tool_id: str, updates: dict) -> Optional[dict]:
    for t in _tools:
        if t["id"] == tool_id:
            for k in ("name","display_name","description","tags","code","active"):
                if k in updates and updates[k] is not None:
                    t[k] = updates[k]
            if not t.get("builtin"):
                write_tool_md(t)
                _save_custom_tools()
            return t
    return None


def remove_tool(tool_id: str) -> bool:
    global _tools
    before  = len(_tools)
    _tools  = [t for t in _tools if not (t["id"] == tool_id and not t.get("builtin"))]
    changed = len(_tools) < before
    if changed:
        _save_custom_tools()
    return changed


def set_tool_active(tool_id: str, active: bool) -> Optional[dict]:
    for t in _tools:
        if t["id"] == tool_id:
            t["active"] = active
            _save_custom_tools()
            return t
    return None


# ─────────────────────────────────────────────────────────────────────────
# Dynamic tool class builder
# ─────────────────────────────────────────────────────────────────────────

def build_custom_tool_class(tool_def: dict):
    """
    Dynamically create a BaseTool subclass from a tool definition.
    The code in TOOL.md is the body of _run(self, input_data: str) -> str.
    Returns a class (not an instance).
    """
    from langchain.tools import BaseTool

    tool_name = tool_def.get("name", tool_def["id"])
    tool_desc = tool_def.get("description", "A custom tool.")
    code_body = tool_def.get("code", "    return 'No code defined.'")

    # Ensure minimum indentation
    lines    = code_body.split("\n")
    indented = "\n".join("    " + l if l.strip() and not l.startswith("    ") else l
                          for l in lines)

    body   = indented or "    return 'No code defined.'"
    fn_src = "def _run(self, input_data=None, **kwargs):\n" + body
    ns: dict = {}
    try:
        exec(textwrap.dedent(fn_src), ns)   # noqa: S102
    except Exception as e:
        # If code fails to compile, return a no-op that reports the error
        err_msg = str(e).replace("'", "\\'")
        fallback = "def _run(self, input_data=None, **kwargs):\n    return 'Tool code error: " + err_msg + "'"
        exec(fallback, ns)

    _run_fn = ns["_run"]

    ToolClass = type(
        f"CustomTool_{tool_name}",
        (BaseTool,),
        {
            "name":        tool_name,
            "description": tool_desc,
            "_run":        _run_fn,
            "_arun":       lambda self, *a, **kw: (_ for _ in ()).throw(NotImplementedError()),
        },
    )
    return ToolClass


def instantiate_tool(tool_id: str):
    """Instantiate a custom tool by ID. Returns BaseTool instance or None."""
    tool_def = get_tool(tool_id)
    if not tool_def or tool_def.get("builtin"):
        return None
    # Reload latest TOOL.md values
    fresh = read_tool_md(tool_id)
    if fresh:
        merged = {**tool_def, **fresh}
    else:
        merged = tool_def
    cls = build_custom_tool_class(merged)
    return cls()


# ─────────────────────────────────────────────────────────────────────────
# Tool spawn request queue
# ─────────────────────────────────────────────────────────────────────────

def request_tool_spawn(requested_by: str, suggestion: dict) -> dict:
    req = {
        "request_id":   uuid.uuid4().hex[:8],
        "requested_by": requested_by,
        "status":       "pending",
        "suggestion":   suggestion,
        "ts":           time.time(),
    }
    _pending_tool_spawns.append(req)
    return req


def get_pending_tool_spawns() -> list[dict]:
    return [r for r in _pending_tool_spawns if r["status"] == "pending"]


def resolve_tool_spawn(request_id: str, approved: bool) -> Optional[dict]:
    for r in _pending_tool_spawns:
        if r["request_id"] == request_id:
            if approved:
                tool, created = add_tool(r["suggestion"])
                if created:
                    r["status"] = "approved"; r["tool_id"] = tool["id"]
                else:
                    r["status"] = "rejected"
                    r["reason"] = f"Tool '{tool['name']}' already exists."
            else:
                r["status"] = "rejected"
            return r
    return None
