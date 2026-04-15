"""
admin_router.py

Admin-only endpoints for:
  - Managing tools          (add / edit / delete tool entries in tools_dir)
  - Editing tools.md        (raw markdown edit)
  - Managing agents         (add / edit / delete agent configs in agents_dir)
  - Editing skills.md       (raw markdown edit)
  - Role assignment         (grant or revoke add/edit capabilities per-user)

All routes require the `admin` role.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..auth import UserToken, require_role

router = APIRouter(prefix="/admin", tags=["admin"])
admin_required = Depends(require_role("admin"))

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent
TOOLS_DIR   = BACKEND_DIR / "tools_dir"
AGENTS_DIR  = BACKEND_DIR / "agents_dir"
USERS_FILE  = BACKEND_DIR / "users.json"

# Markdown file locations (may be at project root or backend/docs)
TOOLS_MD_CANDIDATES  = [
    BACKEND_DIR.parent / "docs" / "tools.md",
    BACKEND_DIR / "docs" / "tools.md",
    BACKEND_DIR.parent / "TOOLS.md",
]
SKILLS_MD_CANDIDATES = [
    BACKEND_DIR.parent / "docs" / "skills.md",
    BACKEND_DIR / "docs" / "skills.md",
    BACKEND_DIR.parent / "SKILLS.md",
]


def _find_md(candidates: list[Path], fallback: Path) -> Path:
    for p in candidates:
        if p.exists():
            return p
    return fallback  # will be created on first write


TOOLS_MD_PATH  = _find_md(TOOLS_MD_CANDIDATES,  BACKEND_DIR.parent / "docs" / "tools.md")
SKILLS_MD_PATH = _find_md(SKILLS_MD_CANDIDATES, BACKEND_DIR.parent / "docs" / "skills.md")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ToolEntry(BaseModel):
    name: str = Field(..., description="Unique snake_case tool name")
    description: str = Field(..., description="What the tool does")
    module: Optional[str] = Field(None, description="Python import path, if any")
    enabled: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentEntry(BaseModel):
    name: str = Field(..., description="Unique agent name")
    role: str = Field(..., description="Agent role / title")
    goal: str = Field(..., description="Agent goal")
    backstory: Optional[str] = None
    tools: List[str] = Field(default_factory=list, description="Tool names assigned to this agent")
    enabled: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MarkdownUpdate(BaseModel):
    content: str = Field(..., description="Full markdown content to write")


class RoleCapabilityUpdate(BaseModel):
    """Grant or revoke add/edit capabilities for a user."""
    username: str
    capabilities: List[Literal["add_tools", "edit_tools", "add_agents", "edit_agents",
                               "edit_tools_md", "edit_skills_md"]] = Field(
        ..., description="Capabilities to grant"
    )
    action: Literal["grant", "revoke"] = "grant"


# ---------------------------------------------------------------------------
# Utility: load / save users.json
# ---------------------------------------------------------------------------

def _load_users() -> Dict[str, Any]:
    if not USERS_FILE.exists():
        return {}
    return json.loads(USERS_FILE.read_text())


def _save_users(data: Dict[str, Any]) -> None:
    USERS_FILE.write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# Utility: load / save JSON files in tools_dir / agents_dir
# ---------------------------------------------------------------------------

def _dir_index(directory: Path) -> Dict[str, Path]:
    """Return {name: path} for all .json files in the directory."""
    directory.mkdir(parents=True, exist_ok=True)
    return {p.stem: p for p in directory.glob("*.json")}


def _read_entry(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _write_entry(path: Path, data: Dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# TOOLS endpoints
# ---------------------------------------------------------------------------

@router.get("/tools", summary="List all tools")
def list_tools(_: UserToken = admin_required) -> List[Dict[str, Any]]:
    index = _dir_index(TOOLS_DIR)
    return [_read_entry(p) for p in index.values()]


@router.post("/tools", status_code=status.HTTP_201_CREATED, summary="Add a new tool")
def add_tool(entry: ToolEntry, _: UserToken = admin_required) -> Dict[str, Any]:
    index = _dir_index(TOOLS_DIR)
    safe_name = re.sub(r"[^\w-]", "_", entry.name.lower())
    if safe_name in index:
        raise HTTPException(status_code=409, detail=f"Tool '{safe_name}' already exists")
    path = TOOLS_DIR / f"{safe_name}.json"
    data = entry.model_dump()
    data["name"] = safe_name
    _write_entry(path, data)
    return data


@router.get("/tools/{tool_name}", summary="Get a specific tool")
def get_tool(tool_name: str, _: UserToken = admin_required) -> Dict[str, Any]:
    index = _dir_index(TOOLS_DIR)
    if tool_name not in index:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
    return _read_entry(index[tool_name])


@router.put("/tools/{tool_name}", summary="Edit an existing tool")
def edit_tool(tool_name: str, entry: ToolEntry, _: UserToken = admin_required) -> Dict[str, Any]:
    index = _dir_index(TOOLS_DIR)
    if tool_name not in index:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
    data = entry.model_dump()
    data["name"] = tool_name
    _write_entry(index[tool_name], data)
    return data


@router.delete("/tools/{tool_name}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a tool")
def delete_tool(tool_name: str, _: UserToken = admin_required) -> None:
    index = _dir_index(TOOLS_DIR)
    if tool_name not in index:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
    index[tool_name].unlink()


# ---------------------------------------------------------------------------
# TOOLS.MD endpoint
# ---------------------------------------------------------------------------

@router.get("/tools-md", summary="Read tools.md")
def read_tools_md(_: UserToken = admin_required) -> Dict[str, str]:
    content = TOOLS_MD_PATH.read_text() if TOOLS_MD_PATH.exists() else ""
    return {"path": str(TOOLS_MD_PATH), "content": content}


@router.put("/tools-md", summary="Edit tools.md")
def edit_tools_md(body: MarkdownUpdate, _: UserToken = admin_required) -> Dict[str, str]:
    TOOLS_MD_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOOLS_MD_PATH.write_text(body.content)
    return {"status": "updated", "path": str(TOOLS_MD_PATH)}


# ---------------------------------------------------------------------------
# AGENTS endpoints
# ---------------------------------------------------------------------------

@router.get("/agents", summary="List all agents")
def list_agents(_: UserToken = admin_required) -> List[Dict[str, Any]]:
    index = _dir_index(AGENTS_DIR)
    return [_read_entry(p) for p in index.values()]


@router.post("/agents", status_code=status.HTTP_201_CREATED, summary="Add a new agent")
def add_agent(entry: AgentEntry, _: UserToken = admin_required) -> Dict[str, Any]:
    index = _dir_index(AGENTS_DIR)
    safe_name = re.sub(r"[^\w-]", "_", entry.name.lower())
    if safe_name in index:
        raise HTTPException(status_code=409, detail=f"Agent '{safe_name}' already exists")
    path = AGENTS_DIR / f"{safe_name}.json"
    data = entry.model_dump()
    data["name"] = safe_name
    _write_entry(path, data)
    return data


@router.get("/agents/{agent_name}", summary="Get a specific agent")
def get_agent(agent_name: str, _: UserToken = admin_required) -> Dict[str, Any]:
    index = _dir_index(AGENTS_DIR)
    if agent_name not in index:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    return _read_entry(index[agent_name])


@router.put("/agents/{agent_name}", summary="Edit an existing agent")
def edit_agent(agent_name: str, entry: AgentEntry, _: UserToken = admin_required) -> Dict[str, Any]:
    index = _dir_index(AGENTS_DIR)
    if agent_name not in index:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    data = entry.model_dump()
    data["name"] = agent_name
    _write_entry(index[agent_name], data)
    return data


@router.delete("/agents/{agent_name}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an agent")
def delete_agent(agent_name: str, _: UserToken = admin_required) -> None:
    index = _dir_index(AGENTS_DIR)
    if agent_name not in index:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    index[agent_name].unlink()


# ---------------------------------------------------------------------------
# SKILLS.MD endpoint
# ---------------------------------------------------------------------------

@router.get("/skills-md", summary="Read skills.md")
def read_skills_md(_: UserToken = admin_required) -> Dict[str, str]:
    content = SKILLS_MD_PATH.read_text() if SKILLS_MD_PATH.exists() else ""
    return {"path": str(SKILLS_MD_PATH), "content": content}


@router.put("/skills-md", summary="Edit skills.md")
def edit_skills_md(body: MarkdownUpdate, _: UserToken = admin_required) -> Dict[str, str]:
    SKILLS_MD_PATH.parent.mkdir(parents=True, exist_ok=True)
    SKILLS_MD_PATH.write_text(body.content)
    return {"status": "updated", "path": str(SKILLS_MD_PATH)}


# ---------------------------------------------------------------------------
# ROLE / CAPABILITY ASSIGNMENT
# ---------------------------------------------------------------------------

@router.get("/users", summary="List all users with their capabilities")
def list_users_admin(_: UserToken = admin_required) -> List[Dict[str, Any]]:
    users = _load_users()
    return [
        {
            "username": u,
            "role": info.get("role"),
            "capabilities": info.get("capabilities", []),
        }
        for u, info in users.items()
    ]


@router.post("/users/capabilities", summary="Grant or revoke add/edit capabilities for a user")
def update_capabilities(body: RoleCapabilityUpdate, _: UserToken = admin_required) -> Dict[str, Any]:
    users = _load_users()
    if body.username not in users:
        raise HTTPException(status_code=404, detail=f"User '{body.username}' not found")

    current: list = users[body.username].setdefault("capabilities", [])
    if body.action == "grant":
        for cap in body.capabilities:
            if cap not in current:
                current.append(cap)
    else:  # revoke
        users[body.username]["capabilities"] = [c for c in current if c not in body.capabilities]

    _save_users(users)
    return {
        "username": body.username,
        "capabilities": users[body.username]["capabilities"],
    }


@router.put("/users/{username}/role", summary="Change a user's base role (viewer/operator/admin)")
def change_role(
    username: str,
    new_role: Literal["viewer", "operator", "admin"],
    _: UserToken = admin_required,
) -> Dict[str, Any]:
    users = _load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    users[username]["role"] = new_role
    _save_users(users)
    return {"username": username, "role": new_role}


@router.get("/users/{username}/capabilities", summary="Get capabilities for a specific user")
def get_capabilities(username: str, _: UserToken = admin_required) -> Dict[str, Any]:
    users = _load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    return {
        "username": username,
        "role": users[username].get("role"),
        "capabilities": users[username].get("capabilities", []),
    }
