"""
spawner/config.py — Spawn system configuration
================================================
Controls whether agents can dynamically request new agents or tools.
Both flags can be toggled at runtime via the /spawn-settings API
or permanently via settings.py / environment variables.
"""
import logging
from settings import AGENT_SPAWN_ENABLED, TOOL_SPAWN_ENABLED

logger = logging.getLogger("spawner.config")

# Runtime state — starts from settings.py defaults
_agent_spawn_enabled: bool = AGENT_SPAWN_ENABLED
_tool_spawn_enabled:  bool = TOOL_SPAWN_ENABLED


def is_agent_spawn_enabled() -> bool:
    return _agent_spawn_enabled


def set_agent_spawn_enabled(value: bool) -> None:
    global _agent_spawn_enabled
    logger.info(f"Agent spawn {'enabled' if value else 'disabled'}")
    _agent_spawn_enabled = value


def is_tool_spawn_enabled() -> bool:
    return _tool_spawn_enabled


def set_tool_spawn_enabled(value: bool) -> None:
    global _tool_spawn_enabled
    logger.info(f"Tool spawn {'enabled' if value else 'disabled'}")
    _tool_spawn_enabled = value


def get_spawn_status() -> dict:
    return {
        "agent_spawn_enabled": _agent_spawn_enabled,
        "tool_spawn_enabled":  _tool_spawn_enabled,
    }
