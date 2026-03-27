"""
tools/ — Tools subsystem public API
=====================================
This package shadows tools.py at the backend root.
We re-export everything from that flat file here so that
existing imports like `from tools import make_tools` keep working.

Sub-module imports:
    from tools.definitions import BUILTIN_TOOLS
    from tools.registry    import get_active_tools, add_tool
    from tools.builtin     import make_tools
"""
import importlib, sys

# ── Load the flat tools.py from the backend root without name conflict ─────
# tools/ package shadows tools.py, so we load tools.py explicitly by path.
import importlib.util, pathlib

_tools_py = pathlib.Path(__file__).parent.parent / "tools.py"
_spec      = importlib.util.spec_from_file_location("_tools_flat", _tools_py)
_mod       = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

# ── Re-export everything tools.py provides ─────────────────────────────────
MockSearchTool          = _mod.MockSearchTool
DataAnalysisTool        = _mod.DataAnalysisTool
SummaryTool             = _mod.SummaryTool
FileReadTool            = _mod.FileReadTool
MathTool                = _mod.MathTool
SpawnAgentTool          = _mod.SpawnAgentTool
SpawnToolTool           = _mod.SpawnToolTool
KnowledgeBaseSearchTool = _mod.KnowledgeBaseSearchTool
make_tools              = _mod.make_tools
to_str                  = _mod.to_str

__all__ = [
    "MockSearchTool", "DataAnalysisTool", "SummaryTool",
    "FileReadTool", "MathTool", "SpawnAgentTool", "SpawnToolTool",
    "KnowledgeBaseSearchTool", "make_tools", "to_str",
]
