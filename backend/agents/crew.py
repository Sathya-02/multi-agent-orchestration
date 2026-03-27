"""
agents/crew.py — Agent crew builder (module path wrapper)
==========================================================
Re-exports build_agents from agents_crew.py.
    from agents.crew import build_agents
"""
from agents_crew import build_agents

__all__ = ["build_agents"]
