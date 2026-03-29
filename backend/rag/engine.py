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

import logging
logger = logging.getLogger("rag.engine")

__all__ = [
    "search", "retrieve", "ingest_file", "ingest_text",
    "get_all_entries", "get_entry_count",
    "delete_entry", "delete_source", "clear_store", "list_sources",
    "format_retrieval_result", "_load_store", "KB_DIR",
    "load_kb_config", "save_kb_config",
    "query_rag",
]

def query_rag(query: str, top_k: int = None) -> dict:
    """
    Retrieve relevant chunks and generate an answer grounded strictly
    in the KB — no agents, no web search, direct Ollama call.
    Returns { query, answer, chunks, model, duration_ms }
    """
    import time as _time
    cfg = load_kb_config()
    t0  = _time.time()

    chunks = retrieve(query, top_k=top_k)
    if not chunks:
        return {
            "query":       query,
            "answer":      "No relevant information found in the knowledge base for this query.",
            "chunks":      [],
            "model":       cfg.get("embed_model"),
            "duration_ms": int((_time.time() - t0) * 1000),
        }

    context = "\n\n".join(
        f"[Source: {c['source']} | chunk {c['chunk_index']} | score {c['score']:.0%}]\n{c['text']}"
        for c in chunks
    )

    prompt = (
        "You are a precise assistant. Answer the question using ONLY the context below.\n"
        "If the context does not contain enough information, say so clearly.\n"
        "Do not use any outside knowledge.\n\n"
        f"CONTEXT:\n{context}\n\n"
        f"QUESTION: {query}\n\n"
        "ANSWER:"
    )

    answer = _call_ollama_generate(prompt, cfg)

    return {
        "query":       query,
        "answer":      answer,
        "chunks":      chunks,
        "model":       cfg.get("embed_model"),
        "duration_ms": int((_time.time() - t0) * 1000),
    }


def _call_ollama_generate(prompt: str, cfg: dict) -> str:
    """Call Ollama /api/generate directly — no CrewAI, no agents."""
    import urllib.request as _req
    import json as _json
    from settings import OLLAMA_URL  # ← correct variable name

    try:
        from config.model import get_active_model
        model = get_active_model()
    except Exception:
        model = "llama3.2:3b"

    payload = _json.dumps({
        "model":   model,
        "prompt":  prompt,
        "stream":  False,
        "options": {"temperature": 0.1},
    }).encode("utf-8")

    try:
        request = _req.Request(
            f"{OLLAMA_URL}/api/generate",
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with _req.urlopen(request, timeout=120) as resp:
            data = _json.loads(resp.read().decode("utf-8"))
        return data.get("response", "").strip()
    except Exception as e:
        logger.warning(f"Ollama generate failed: {e}")
        return f"[LLM call failed: {e}]"