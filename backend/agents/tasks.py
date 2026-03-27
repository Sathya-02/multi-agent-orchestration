"""
agents/tasks.py — Task pipeline builder (module path wrapper)
==============================================================
Re-exports build_tasks from tasks_crew.py.
    from agents.tasks import build_tasks
"""
from tasks_crew import build_tasks

__all__ = ["build_tasks"]
