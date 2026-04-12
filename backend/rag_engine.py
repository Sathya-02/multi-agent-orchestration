"""
rag_engine.py — RAG (Retrieval-Augmented Generation) / Knowledge Base

Provides a local vector store for document retrieval without any external
API keys or cloud services.

Architecture:
  • Documents ingested → chunked → embedded via Ollama nomic-embed-text
  • Vectors stored in-memory + persisted to data/rag_store.json on disk
  • Cosine similarity retrieval — top-k chunks returned to agents
  • Falls back to keyword (djb2 TF) if Ollama embedding is unavailable

Supported ingestion formats: .txt .md .pdf .docx .csv .json .html .log

Usage by agents:
  Tool name:  knowledge_base_search
  Input:      a query string
  Returns:    top-k relevant chunks with source metadata
"""
import json, re, math, time, uuid, logging
from pathlib import Path
from typing import Optional

from settings import (
    RAG_ENABLED, RAG_EMBED_MODEL, RAG_CHUNK_SIZE,
    RAG_CHUNK_OVERLAP, RAG_TOP_K, RAG_MIN_SCORE, RAG_USE_OLLAMA_EMBED,
    RAG_CONFIG_FILE,
    RAG_STORE_FILE,   # FIX: was missing — KB_STORE was hardcoded to wrong path
)

logger = logging.getLogger("rag_engine")

# ── Paths ────────────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
# FIX: KB_STORE now uses RAG_STORE_FILE from settings (data/rag_store.json)
# Old hardcoded value was BASE_DIR/"rag_store.json" which is a different path.
# When data/ dir didn’t exist, _save_store() silently failed and
# the import-time _load_store() could raise, causing the whole module
# import to fail — main.py then set RAG_ENABLED=False → all /kb/* = 404.
KB_STORE    = RAG_STORE_FILE
KB_DIR      = BASE_DIR / "knowledge_base"
KB_CFG_PATH = RAG_CONFIG_FILE

# Ensure both data/ and knowledge_base/ directories exist before any I/O
KB_STORE.parent.mkdir(parents=True, exist_ok=True)
KB_CFG_PATH.parent.mkdir(parents=True, exist_ok=True)
KB_DIR.mkdir(exist_ok=True)

# ── Config ─────────────────────────────────────────────────────────────────────────────
_DEFAULT_CFG = {
    "enabled":          RAG_ENABLED,
    "embed_model":      RAG_EMBED_MODEL,
    "chunk_size":       RAG_CHUNK_SIZE,
    "chunk_overlap":    RAG_CHUNK_OVERLAP,
    "top_k":            RAG_TOP_K,
    "min_score":        RAG_MIN_SCORE,
    "use_ollama_embed": RAG_USE_OLLAMA_EMBED,
}


def load_kb_config() -> dict:
    cfg = dict(_DEFAULT_CFG)
    if KB_CFG_PATH.exists():
        try:
            cfg.update(json.loads(KB_CFG_PATH.read_text(encoding="utf-8")))
        except Exception:
            pass
    return cfg


def save_kb_config(cfg: dict) -> None:
    KB_CFG_PATH.parent.mkdir(parents=True, exist_ok=True)
    KB_CFG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


# ───────────────────────────────────────────────────────────────────────────
# Vector store (in-memory + JSON persistence)
# ───────────────────────────────────────────────────────────────────────────

_store: list[dict] = []

# Keyword vector dimension — must match _embed_keyword()
_KW_DIM = 512


def _save_store() -> None:
    try:
        KB_STORE.parent.mkdir(parents=True, exist_ok=True)
        KB_STORE.write_text(
            json.dumps(_store, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as e:
        logger.warning(f"RAG store save failed: {e}")


def _migrate_legacy_vectors() -> None:
    """
    Detect and re-embed store entries that still carry old broken vectors.
    Old format: sparse alternating [hash/65536, tf/total, ...] pairs,
    variable length (never exactly 512). These produce near-zero cosine
    with any query vector from the new fixed djb2 encoder.
    Called once at startup after _load_store().
    """
    cfg = load_kb_config()
    needs_fix = [
        e for e in _store
        if not e.get("vector") or len(e["vector"]) != _KW_DIM
    ]
    if not needs_fix:
        return
    logger.info(
        f"RAG: migrating {len(needs_fix)}/{len(_store)} legacy vector entries "
        f"to fixed djb2 format"
    )
    for entry in needs_fix:
        entry["vector"] = _embed_keyword(entry["text"])
    _save_store()
    logger.info("RAG: legacy vector migration complete")


def _load_store() -> None:
    global _store
    if KB_STORE.exists():
        try:
            _store = json.loads(KB_STORE.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"RAG store load failed: {e}")
            _store = []


# FIX: wrap module-level startup calls in try/except so a corrupt store
# or missing directory never causes an ImportError in main.py which would
# set RAG_ENABLED=False and make every /kb/* endpoint return 404.
try:
    _load_store()
    _migrate_legacy_vectors()
except Exception as _startup_err:
    logger.warning(f"RAG store startup error (continuing with empty store): {_startup_err}")
    _store = []


def get_all_entries() -> list[dict]:
    return [
        {k: v for k, v in e.items() if k != "vector"}
        for e in _store
    ]


def get_entry_count() -> int:
    return len(_store)


def delete_entry(entry_id: str) -> bool:
    global _store
    before = len(_store)
    _store  = [e for e in _store if e.get("id") != entry_id]
    changed = len(_store) < before
    if changed:
        _save_store()
    return changed


def delete_source(source: str) -> int:
    global _store
    before = len(_store)
    _store  = [e for e in _store if e.get("source") != source]
    removed = before - len(_store)
    if removed:
        _save_store()
    return removed


def clear_store() -> None:
    global _store
    _store = []
    _save_store()


def list_sources() -> list[dict]:
    seen: dict = {}
    for e in _store:
        src = e.get("source", "unknown")
        if src not in seen:
            seen[src] = {"source": src, "chunks": 0, "ts": e.get("ts", 0),
                         "tags": e.get("tags", [])}
        seen[src]["chunks"] += 1
    return sorted(seen.values(), key=lambda x: x["ts"], reverse=True)


# ───────────────────────────────────────────────────────────────────────────
# Text chunking
# ───────────────────────────────────────────────────────────────────────────

def _chunk_text(text: str, chunk_size: int = 400, overlap: int = 80) -> list[str]:
    text = re.sub(r'\r\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()

    if len(text) <= chunk_size:
        return [text] if text else []

    boundaries = [m.end() for m in re.finditer(r'(?:\n\n|\. |\? |! )', text)]

    chunks = []
    start  = 0
    while start < len(text):
        end = start + chunk_size
        if end >= len(text):
            chunks.append(text[start:].strip())
            break
        good_end = end
        for b in reversed(boundaries):
            if start < b <= end:
                good_end = b
                break
        chunk = text[start:good_end].strip()
        if chunk:
            chunks.append(chunk)
        start = max(start + 1, good_end - overlap)

    return [c for c in chunks if len(c) > 20]


# ───────────────────────────────────────────────────────────────────────────
# Embedding
# ───────────────────────────────────────────────────────────────────────────

def _embed_ollama(text: str, model: str, timeout: int = 30) -> Optional[list[float]]:
    try:
        import urllib.request
        payload = json.dumps({"model": model, "prompt": text}).encode("utf-8")
        req     = urllib.request.Request(
            "http://localhost:11434/api/embeddings",
            data=payload,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("embedding")
    except Exception as e:
        logger.debug(f"Ollama embedding failed: {e}")
        return None


def _djb2(word: str) -> int:
    """
    Stable djb2 hash — same word → same bucket every run.
    Replaces Python's built-in hash() which is randomised per process
    by PYTHONHASHSEED, causing stored vs query vectors to be unrelated.
    """
    h = 5381
    for ch in word:
        h = ((h << 5) + h) + ord(ch)
        h &= 0xFFFFFFFF
    return h


def _embed_keyword(text: str) -> list[float]:
    """
    Fixed-size 512-bucket TF keyword embedding using stable djb2 hash.
    L2-normalised so cosine similarity = dot product.
    """
    tokens = re.findall(r'\b[a-z]{3,}\b', text.lower())
    freq: dict = {}
    for t in tokens:
        freq[t] = freq.get(t, 0) + 1
    total = sum(freq.values()) or 1

    vec = [0.0] * _KW_DIM
    for word, cnt in freq.items():
        bucket = _djb2(word) % _KW_DIM
        vec[bucket] += cnt / total

    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _is_keyword_vector(vec: list[float]) -> bool:
    return len(vec) == _KW_DIM


def _get_embedding(text: str, cfg: dict) -> list[float]:
    if cfg.get("use_ollama_embed", False):
        vec = _embed_ollama(text, cfg.get("embed_model", "nomic-embed-text"))
        if vec:
            return vec
    return _embed_keyword(text)


# ───────────────────────────────────────────────────────────────────────────
# Cosine similarity
# ───────────────────────────────────────────────────────────────────────────

def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    max_len = max(len(a), len(b))
    if len(a) < max_len:
        a = a + [0.0] * (max_len - len(a))
    if len(b) < max_len:
        b = b + [0.0] * (max_len - len(b))
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ───────────────────────────────────────────────────────────────────────────
# Ingestion
# ───────────────────────────────────────────────────────────────────────────

def _extract_text(path: Path) -> str:
    ext = path.suffix.lower()

    if ext in (".txt", ".md", ".log", ".csv", ".yaml", ".yml"):
        return path.read_text(encoding="utf-8", errors="replace")

    if ext == ".json":
        raw = path.read_text(encoding="utf-8", errors="replace")
        try:
            obj = json.loads(raw)
            return json.dumps(obj, indent=2)
        except Exception:
            return raw

    if ext == ".html":
        raw = path.read_text(encoding="utf-8", errors="replace")
        return re.sub(r'<[^>]+>', ' ', raw)

    if ext == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                return "\n".join(
                    page.extract_text() or "" for page in pdf.pages
                )
        except ImportError:
            pass
        try:
            import pypdf
            reader = pypdf.PdfReader(str(path))
            return "\n".join(
                page.extract_text() or "" for page in reader.pages
            )
        except ImportError:
            return f"[PDF: {path.name} — install pdfplumber or pypdf to extract text]"

    if ext == ".docx":
        try:
            import docx
            doc = docx.Document(str(path))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            return f"[DOCX: {path.name} — install python-docx to extract text]"

    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return f"[Could not read: {path.name}]"


def ingest_file(path: Path, tags: list[str] = None,
                progress_cb=None) -> dict:
    cfg    = load_kb_config()
    source = path.name
    tags   = tags or []

    removed  = delete_source(source)
    raw_text = _extract_text(path)
    if not raw_text.strip():
        return {"source": source, "chunks_added": 0, "chunks_skipped": 0,
                "message": "No text could be extracted from this file."}

    chunks = _chunk_text(
        raw_text,
        chunk_size=int(cfg.get("chunk_size", 400)),
        overlap=int(cfg.get("chunk_overlap", 80)),
    )

    added = 0
    for i, chunk in enumerate(chunks):
        if progress_cb:
            progress_cb(i, len(chunks), source)
        vec = _get_embedding(chunk, cfg)
        entry = {
            "id":          uuid.uuid4().hex[:12],
            "source":      source,
            "chunk_index": i,
            "text":        chunk,
            "vector":      vec,
            "ts":          time.time(),
            "tags":        tags,
            "char_count":  len(chunk),
        }
        _store.append(entry)
        added += 1

    _save_store()
    return {
        "source":         source,
        "chunks_added":   added,
        "chunks_skipped": 0,
        "removed_old":    removed,
        "message":        f"Ingested {added} chunks from '{source}'" +
                          (f" (replaced {removed} old chunks)" if removed else ""),
    }


def ingest_text(text: str, source_name: str, tags: list[str] = None) -> dict:
    tmp = KB_DIR / f"{source_name}.txt"
    tmp.write_text(text, encoding="utf-8")
    result = ingest_file(tmp, tags=tags)
    # Keep the .txt file so it can be browsed; only remove on clear/delete
    return result


# ───────────────────────────────────────────────────────────────────────────
# Retrieval
# ───────────────────────────────────────────────────────────────────────────

def retrieve(query: str, top_k: int = None,
             filter_tags: list[str] = None) -> list[dict]:
    """
    Retrieve the most relevant chunks for a query.
    """
    cfg   = load_kb_config()
    top_k = top_k or int(cfg.get("top_k", 4))
    min_score = float(cfg.get("min_score", 0.0))

    q_vec = _get_embedding(query, cfg)

    scored = []
    for entry in _store:
        vec   = entry.get("vector", [])
        score = _cosine(q_vec, vec)
        if score >= min_score:
            scored.append((score, entry))

    scored.sort(key=lambda x: x[0], reverse=True)

    results = []
    for score, entry in scored[:top_k]:
        if filter_tags and not any(t in entry.get("tags", []) for t in filter_tags):
            continue
        results.append({
            "id":     entry.get("id"),
            "source": entry.get("source"),
            "text":   entry.get("text"),
            "score":  round(score, 4),
            "tags":   entry.get("tags", []),
        })
    return results


def search(query: str) -> str:
    """String wrapper used by agent tools."""
    results = retrieve(query)
    if not results:
        return "No relevant knowledge base entries found."
    parts = []
    for i, r in enumerate(results, 1):
        parts.append(
            f"[{i}] Source: {r['source']} (score: {r['score']})\n{r['text']}"
        )
    return "\n\n".join(parts)


def reindex_store() -> dict:
    """Re-embed all entries using the current embedding config."""
    cfg = load_kb_config()
    count = 0
    for entry in _store:
        entry["vector"] = _get_embedding(entry["text"], cfg)
        count += 1
    if count:
        _save_store()
    return {"reindexed": count, "message": f"Re-embedded {count} chunks."}
