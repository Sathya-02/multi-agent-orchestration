"""
agents/registry.py — Agent registry module wrapper
====================================================
Thin re-export of agent_registry.py so the modular import path works:
    from agents.registry import get_active_agents, add_agent ...

The actual implementation stays in agent_registry.py at the backend root.
This keeps backwards-compatibility while giving the new module structure.
"""
from agent_registry import (
    get_all_agents,
    get_active_agents,
    get_agent,
    find_agent_by_role,
    role_exists,
    add_agent,
    update_agent,
    remove_agent,
    set_agent_active,
    get_skills_text,
    save_skills_text,
    ensure_skills_files,
    read_skills_file,
    request_spawn,
    get_pending_spawns,
    resolve_spawn,
    is_spawn_enabled,
    set_spawn_enabled,
)

__all__ = [
    "get_all_agents", "get_active_agents", "get_agent",
    "find_agent_by_role", "role_exists",
    "add_agent", "update_agent", "remove_agent", "set_agent_active",
    "get_skills_text", "save_skills_text", "ensure_skills_files", "read_skills_file",
    "request_spawn", "get_pending_spawns", "resolve_spawn",
    "is_spawn_enabled", "set_spawn_enabled",
]
