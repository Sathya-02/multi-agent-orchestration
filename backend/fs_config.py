"""
fs_config.py — Filesystem Access Configuration

All configuration is persisted to backend/fs_config.json so it
survives backend restarts.  The file is read on import and written
on every mutating operation.

Security model:
  • No write or edit access anywhere by default.
  • Read access must be explicitly granted per folder.
  • Path traversal (../) is blocked at the tool level.
  • All agent operations are logged (in-memory, last 200 ops).

Path matching: each entry stores both the resolved canonical path
AND the raw expanded path, so macOS /home ↔ /Users symlinks match.
"""
from pathlib import Path
from typing import Optional
import time, os, json

# ── Persistence file ──────────────────────────────────────────────────────
_PERSIST_PATH = Path(__file__).parent / "fs_config.json"

_output_dir: Optional[str] = None
_access_list: list[dict]   = []
_fs_audit:    list[dict]   = []   # in-memory only (not persisted — too noisy)


# ─────────────────────────────────────────────────────────────────────────
# Persistence helpers
# ─────────────────────────────────────────────────────────────────────────

def _save() -> None:
    """Write current state to fs_config.json."""
    data = {
        "output_dir":  _output_dir,
        "access_list": _access_list,
    }
    try:
        _PERSIST_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[fs_config] Warning: could not save config: {e}")


def _load() -> None:
    """Load state from fs_config.json (called once on import)."""
    global _output_dir, _access_list
    if not _PERSIST_PATH.exists():
        return
    try:
        data = json.loads(_PERSIST_PATH.read_text(encoding="utf-8"))
        _output_dir  = data.get("output_dir")
        raw_list     = data.get("access_list", [])
        # Validate: drop entries whose path no longer exists on disk
        _access_list = [
            e for e in raw_list
            if isinstance(e, dict) and e.get("path")
        ]
    except Exception as e:
        print(f"[fs_config] Warning: could not load config: {e}")


# Load persisted state immediately on import
_load()


# ─────────────────────────────────────────────────────────────────────────
# Audit log
# ─────────────────────────────────────────────────────────────────────────

def _audit(op: str, path: str, agent: str, status: str, detail: str = "") -> None:
    _fs_audit.append({"op": op, "path": path, "agent": agent,
                      "status": status, "detail": detail, "ts": time.time()})
    if len(_fs_audit) > 200:
        _fs_audit.pop(0)


def get_audit_log() -> list[dict]:
    return list(reversed(_fs_audit))


# ─────────────────────────────────────────────────────────────────────────
# Path helpers
# ─────────────────────────────────────────────────────────────────────────

def _expand(path_str: str) -> str:
    """Expand ~ only — does NOT follow symlinks."""
    try:
        return str(Path(path_str.strip()).expanduser())
    except Exception:
        return path_str.strip()


def _resolve(path_str: str) -> str:
    """Full resolve — follows symlinks (turns /home/user → /Users/user on macOS)."""
    try:
        return str(Path(path_str.strip()).expanduser().resolve())
    except Exception:
        return _expand(path_str)


def _both_forms(path_str: str) -> tuple[str, str]:
    return _expand(path_str), _resolve(path_str)


def _covers(entry: dict, p_str: str) -> bool:
    sep = os.sep
    for key in ("path", "path_raw"):
        folder = entry.get(key, "")
        if not folder:
            continue
        if p_str == folder or p_str.startswith(folder + sep):
            return True
    return False


# ─────────────────────────────────────────────────────────────────────────
# Output directory
# ─────────────────────────────────────────────────────────────────────────

def get_output_dir() -> Optional[str]:
    return _output_dir


def set_output_dir(path_str: str) -> dict:
    global _output_dir
    if not path_str or not path_str.strip():
        _output_dir = None
        _save()
        return {"output_dir": None, "status": "cleared"}
    resolved = _resolve(path_str)
    try:
        Path(resolved).mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return {"error": f"Cannot create directory '{resolved}': {e}"}
    _output_dir = resolved
    _save()
    return {"output_dir": resolved, "status": "set"}


# ─────────────────────────────────────────────────────────────────────────
# Access list management
# ─────────────────────────────────────────────────────────────────────────

def get_access_list() -> list[dict]:
    return [dict(e) for e in _access_list]


def get_accessible_paths() -> list[str]:
    paths = []
    for e in _access_list:
        if e.get("path"):     paths.append(e["path"])
        if e.get("path_raw") and e["path_raw"] != e.get("path"):
            paths.append(e["path_raw"])
    return paths


def add_access_entry(path_str: str, read: bool = True,
                     write: bool = False, edit: bool = False,
                     label: str = "") -> dict:
    expanded, resolved = _both_forms(path_str)

    p = Path(resolved)
    if not p.exists():
        p2 = Path(expanded)
        if not p2.exists():
            return {"error": f"Path does not exist: {expanded}"}
        p = p2

    if not p.is_dir():
        return {"error": f"Path is not a directory: {expanded}"}

    for entry in _access_list:
        if entry.get("path") == resolved or entry.get("path_raw") == expanded:
            entry["read"]     = read
            entry["write"]    = write
            entry["edit"]     = edit
            entry["path"]     = resolved
            entry["path_raw"] = expanded
            if label:
                entry["label"] = label
            _save()
            return {**entry, "updated": True}

    entry = {
        "path":     resolved,
        "path_raw": expanded,
        "read":     read,
        "write":    write,
        "edit":     edit,
        "label":    label or p.name,
        "added":    time.time(),
    }
    _access_list.append(entry)
    _save()
    return {**entry, "created": True}


def remove_access_entry(path_str: str) -> bool:
    global _access_list
    expanded, resolved = _both_forms(path_str)
    before = len(_access_list)
    _access_list = [
        e for e in _access_list
        if e.get("path") != resolved and e.get("path_raw") != expanded
    ]
    changed = len(_access_list) < before
    if changed:
        _save()
    return changed


def update_access_entry(path_str: str, **kwargs) -> Optional[dict]:
    expanded, resolved = _both_forms(path_str)
    for entry in _access_list:
        if entry.get("path") == resolved or entry.get("path_raw") == expanded:
            for k in ("read", "write", "edit", "label"):
                if k in kwargs and kwargs[k] is not None:
                    entry[k] = kwargs[k]
            _save()
            return dict(entry)
    return None


# ─────────────────────────────────────────────────────────────────────────
# Permission checking
# ─────────────────────────────────────────────────────────────────────────

def _resolve_safe(path_str: str) -> Optional[Path]:
    try:
        raw = Path(path_str)
        if ".." in raw.parts:
            return None
        return Path(_expand(path_str))
    except Exception:
        return None


def _find_entry(p: Path) -> Optional[dict]:
    p_str      = str(p)
    p_resolved = _resolve(p_str)
    best, best_d = None, -1
    for entry in _access_list:
        for test_p in (p_str, p_resolved):
            if _covers(entry, test_p):
                depth = len(Path(entry.get("path") or entry.get("path_raw","")).parts)
                if depth > best_d:
                    best, best_d = entry, depth
                break
    return best


def can_read(path_str: str, agent: str = "agent") -> tuple[bool, str]:
    p = _resolve_safe(path_str)
    if p is None:
        _audit("read", path_str, agent, "denied", "traversal blocked")
        return False, "Path traversal (../) is not allowed."
    entry = _find_entry(p)
    if entry is None or not entry.get("read"):
        accessible = get_accessible_paths()
        hint = (f"Accessible: {accessible}" if accessible
                else "No folders configured — add one in the 📁 Filesystem panel.")
        _audit("read", str(p), agent, "denied", "no read permission")
        return False, f"Read access not granted for '{p}'. {hint}"
    _audit("read", str(p), agent, "allowed")
    return True, ""


def can_write(path_str: str, agent: str = "agent") -> tuple[bool, str]:
    p = _resolve_safe(path_str)
    if p is None:
        _audit("write", path_str, agent, "denied", "traversal blocked")
        return False, "Path traversal (../) is not allowed."
    parent = p.parent
    entry  = _find_entry(parent)
    if entry is None or not entry.get("write"):
        _audit("write", str(p), agent, "denied", "no write permission")
        return False, (f"Write access not granted for '{parent}'. "
                       "Enable Write in the 📁 Filesystem panel.")
    _audit("write", str(p), agent, "allowed")
    return True, ""


def can_edit(path_str: str, agent: str = "agent") -> tuple[bool, str]:
    p = _resolve_safe(path_str)
    if p is None:
        _audit("edit", path_str, agent, "denied", "traversal blocked")
        return False, "Path traversal (../) is not allowed."
    entry = _find_entry(p)
    if entry is None or not entry.get("edit"):
        _audit("edit", str(p), agent, "denied", "no edit permission")
        return False, (f"Edit access not granted for '{p}'. "
                       "Enable Edit in the 📁 Filesystem panel.")
    _audit("edit", str(p), agent, "allowed")
    return True, ""
