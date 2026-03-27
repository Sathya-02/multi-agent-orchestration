"""
spawner/ — Agent and Tool spawn request subsystem
==================================================
Handles human-in-the-loop approval for dynamically created agents/tools.

    from spawner.agents import request_spawn, get_pending_spawns, resolve_spawn
    from spawner.tools  import request_tool_spawn, get_pending_tool_spawns
    from spawner.config import is_spawn_enabled, set_spawn_enabled
"""
