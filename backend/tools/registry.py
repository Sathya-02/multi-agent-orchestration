"""
tools/registry.py — Tool registry module wrapper
=================================================
Re-exports from tool_registry.py at the backend root.
    from tools.registry import get_all_tools, add_tool ...
"""
from tool_registry import (
    get_all_tools,
    get_active_tools,
    get_tool,
    find_tool_by_name,
    name_exists,
    add_tool,
    update_tool,
    remove_tool,
    set_tool_active,
    get_tool_md_text,
    save_tool_md_text,
    ensure_tool_files,
    get_pending_tool_spawns,
    resolve_tool_spawn,
    request_tool_spawn,
    instantiate_tool,
)

__all__ = [
    "get_all_tools", "get_active_tools", "get_tool",
    "find_tool_by_name", "name_exists",
    "add_tool", "update_tool", "remove_tool", "set_tool_active",
    "get_tool_md_text", "save_tool_md_text", "ensure_tool_files",
    "get_pending_tool_spawns", "resolve_tool_spawn", "request_tool_spawn",
    "instantiate_tool",
]
