"""
tools/builtin.py — Built-in tool factory
=========================================
Exposes make_tools using the same loader as tools/__init__.py
so there is no circular import.

    from tools.builtin import make_tools
"""
from tools import make_tools  # resolves via tools/__init__.py → tools.py

__all__ = ["make_tools"]
