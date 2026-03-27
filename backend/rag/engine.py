"""
rag/engine.py — RAG engine module wrapper
==========================================
Re-exports from rag_engine.py at the backend root.
    from rag.engine import search, ingest_file, ingest_text ...
"""
from rag_engine import (
    search,
    retrieve,
    ingest_file,
    ingest_text,
    get_all_entries,
    get_entry_count,
    delete_entry,
    delete_source,
    clear_store,
    list_sources,
    format_retrieval_result,
    _load_store,
    KB_DIR,
)
from rag.config import load_kb_config, save_kb_config

__all__ = [
    "search", "retrieve", "ingest_file", "ingest_text",
    "get_all_entries", "get_entry_count",
    "delete_entry", "delete_source", "clear_store", "list_sources",
    "format_retrieval_result", "_load_store", "KB_DIR",
    "load_kb_config", "save_kb_config",
]
