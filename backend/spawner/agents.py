"""
spawner/agents.py — Agent spawn request queue
==============================================
Wraps agent_registry spawn functions.
    from spawner.agents import request_spawn, get_pending_spawns, resolve_spawn
"""
from agent_registry import (
    request_spawn,
    get_pending_spawns,
    resolve_spawn,
)

__all__ = ["request_spawn", "get_pending_spawns", "resolve_spawn"]
