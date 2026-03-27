"""
filesystem/config.py — Filesystem access control (module path wrapper)
=======================================================================
Re-exports from fs_config.py at the backend root.
    from filesystem.config import get_access_list, add_access_entry ...
"""
from fs_config import (
    get_output_dir,
    set_output_dir,
    get_access_list,
    add_access_entry,
    remove_access_entry,
    update_access_entry,
    get_audit_log,
)

__all__ = [
    "get_output_dir", "set_output_dir",
    "get_access_list", "add_access_entry",
    "remove_access_entry", "update_access_entry",
    "get_audit_log",
]
