"""
capability_guard.py

Optional FastAPI Depends() helpers that check fine-grained capabilities stored
per-user in users.json.  Admins always pass; other roles must have the
capability explicitly granted via POST /admin/users/capabilities.

Usage:
    from middleware.capability_guard import can_add_tools, can_edit_tools

    @app.post("/tools")
    async def add_tool(data: dict, user = can_add_tools):
        ...
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Callable

from fastapi import Depends, HTTPException, status

from ..auth import UserToken, get_current_user

USERS_FILE = Path(__file__).resolve().parent.parent / "users.json"


def _load_users() -> dict:
    if not USERS_FILE.exists():
        return {}
    return json.loads(USERS_FILE.read_text())


def capability_required(capability: str) -> Callable:
    """
    Returns a FastAPI Depends()-compatible callable that passes when:
      - the authenticated user has role == 'admin'  (always allowed), OR
      - the user has `capability` in their capabilities list.
    """
    def _guard(user: UserToken = Depends(get_current_user)) -> UserToken:
        if user.role == "admin":
            return user
        users = _load_users()
        user_data = users.get(user.username, {})
        caps: list = user_data.get("capabilities", [])
        if capability not in caps:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Capability '{capability}' required.",
            )
        return user

    _guard.__name__ = f"require_{capability}"
    return Depends(_guard)


# Pre-built guards — import these directly into route files
can_add_tools    = capability_required("add_tools")
can_edit_tools   = capability_required("edit_tools")
can_add_agents   = capability_required("add_agents")
can_edit_agents  = capability_required("edit_agents")
can_edit_tools_md  = capability_required("edit_tools_md")
can_edit_skills_md = capability_required("edit_skills_md")
