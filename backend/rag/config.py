"""
rag/config.py — RAG subsystem configuration
=============================================
All defaults come from settings.py but can be overridden at runtime
via the /kb/config API and are persisted to data/rag_config.json.
"""
import json, logging
from settings import (
    RAG_CONFIG_FILE,
    RAG_ENABLED, RAG_EMBED_MODEL, RAG_CHUNK_SIZE, RAG_CHUNK_OVERLAP,
    RAG_TOP_K, RAG_MIN_SCORE, RAG_USE_OLLAMA_EMBED,
)

logger = logging.getLogger("rag.config")

_DEFAULTS = {
    "enabled":          RAG_ENABLED,
    "embed_model":      RAG_EMBED_MODEL,
    "chunk_size":       RAG_CHUNK_SIZE,
    "chunk_overlap":    RAG_CHUNK_OVERLAP,
    "top_k":            RAG_TOP_K,
    "min_score":        RAG_MIN_SCORE,
    "use_ollama_embed": RAG_USE_OLLAMA_EMBED,
}


def load_kb_config() -> dict:
    cfg = dict(_DEFAULTS)
    if RAG_CONFIG_FILE.exists():
        try:
            cfg.update(json.loads(RAG_CONFIG_FILE.read_text(encoding="utf-8")))
        except Exception as e:
            logger.warning(f"RAG config load failed: {e}")
    return cfg


def save_kb_config(cfg: dict) -> None:
    RAG_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    RAG_CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
