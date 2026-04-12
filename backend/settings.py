"""
settings.py — Single source of truth for ALL configuration.

This is the ONE file you edit to change system behaviour:
  - LLM model and parameters
  - CORS / allowed origins
  - Feature flags (web search, RAG, Telegram, self-improver)
  - Directory paths
  - Spawn controls
  - Report format defaults
  - Cloud / multi-user settings
  - Auth / OAuth (Google login, session cookies, email-based authz)

All sub-modules import from here. Never scatter magic strings across files.

Environment variable overrides (12-factor style):
  Any setting can be overridden via env vars. Naming convention:
    OLLAMA_MODEL, OLLAMA_URL, SEARCH_ENABLED, TELEGRAM_TOKEN, etc.
  See the "Environment Overrides" section at the bottom.
"""

import os
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────
# PATHS — all relative to the backend root
# ─────────────────────────────────────────────────────────────────────────

BASE_DIR        = Path(__file__).parent
REPORTS_DIR     = BASE_DIR / "reports"
UPLOADS_DIR     = BASE_DIR / "uploads"
KB_DIR          = BASE_DIR / "knowledge_base"
AGENTS_DIR      = BASE_DIR / "agents"
TOOLS_DIR       = BASE_DIR / "tools"
LOGS_DIR        = BASE_DIR / "logs"

# JSON persistence files
CUSTOM_AGENTS_FILE      = BASE_DIR / "data" / "custom_agents.json"
CUSTOM_TOOLS_FILE       = BASE_DIR / "data" / "custom_tools.json"
FS_CONFIG_FILE          = BASE_DIR / "data" / "fs_config.json"
TELEGRAM_CONFIG_FILE    = BASE_DIR / "data" / "telegram_config.json"
SELF_IMPROVER_CFG_FILE  = BASE_DIR / "data" / "self_improver_config.json"
WEB_SEARCH_CFG_FILE     = BASE_DIR / "data" / "web_search_config.json"
RAG_CONFIG_FILE         = BASE_DIR / "data" / "rag_config.json"
RAG_STORE_FILE          = BASE_DIR / "data" / "rag_store.json"
ACTIVITY_LOG_FILE       = BASE_DIR / "data" / "activity_log.jsonl"

# ─────────────────────────────────────────────────────────────────────────
# LLM / OLLAMA
# ─────────────────────────────────────────────────────────────────────────

# The model Ollama will use. Change this to switch models globally.
# Override: OLLAMA_MODEL env var
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "phi3:mini")

# Ollama server URL. In Docker it's the sidecar service name.
# Override: OLLAMA_URL env var
OLLAMA_URL      = os.getenv("OLLAMA_URL", "http://localhost:11434")

# Per-model tuning presets.
MODEL_PRESETS: dict[str, dict] = {
    "phi3:mini":        {"num_predict": 512,  "num_ctx": 4096, "temperature": 0.3},
    "llama3.2:3b":      {"num_predict": 768,  "num_ctx": 4096, "temperature": 0.3},
    "gemma2:2b":        {"num_predict": 512,  "num_ctx": 4096, "temperature": 0.3},
    "qwen2.5:3b":       {"num_predict": 768,  "num_ctx": 4096, "temperature": 0.3},
    "tinyllama:1.1b":   {"num_predict": 256,  "num_ctx": 2048, "temperature": 0.2},
    "gemma3:1b":        {"num_predict": 512,  "num_ctx": 4096, "temperature": 0.3},
    "llama3:8b":        {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    "mistral:7b":       {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    "qwen2.5:7b":       {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    "llama3.1:8b":      {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    "llama3:70b":       {"num_predict": 2048, "num_ctx":16384, "temperature": 0.4},
    "mixtral:8x7b":     {"num_predict": 2048, "num_ctx":16384, "temperature": 0.4},
    "qwen2.5:72b":      {"num_predict": 2048, "num_ctx":16384, "temperature": 0.4},
    "gpt-4o":           {"num_predict": 4096, "num_ctx":32768, "temperature": 0.4},
    "claude-3-5-sonnet":{"num_predict": 4096, "num_ctx":32768, "temperature": 0.4},
}

MODEL_DEFAULT_PRESET = {"num_predict": 768, "num_ctx": 4096, "temperature": 0.3}

# ─────────────────────────────────────────────────────────────────────────
# API SERVER
# ─────────────────────────────────────────────────────────────────────────

API_VERSION     = "7.0.0"
API_TITLE       = "Multi Agent Orchestration"

_origins_env = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS: list[str] = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    if _origins_env
    else [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]
)

# ─────────────────────────────────────────────────────────────────────────
# FEATURE FLAGS — set to False to disable entirely
# ─────────────────────────────────────────────────────────────────────────

SEARCH_ENABLED          = os.getenv("SEARCH_ENABLED", "true").lower() == "true"
RAG_ENABLED             = os.getenv("RAG_ENABLED", "true").lower() == "true"
TELEGRAM_ENABLED        = os.getenv("TELEGRAM_ENABLED", "false").lower() == "true"
SELF_IMPROVER_ENABLED   = os.getenv("SELF_IMPROVER_ENABLED", "true").lower() == "true"
AGENT_SPAWN_ENABLED     = os.getenv("AGENT_SPAWN_ENABLED", "true").lower() == "true"
TOOL_SPAWN_ENABLED      = os.getenv("TOOL_SPAWN_ENABLED", "true").lower() == "true"
FILESYSTEM_ENABLED      = os.getenv("FILESYSTEM_ENABLED", "true").lower() == "true"
STATS_ENABLED           = os.getenv("STATS_ENABLED", "true").lower() == "true"

# ─────────────────────────────────────────────────────────────────────────
# MULTI-USER / CLOUD
# ─────────────────────────────────────────────────────────────────────────

REQUIRE_API_KEY         = os.getenv("REQUIRE_API_KEY", "false").lower() == "true"
MASTER_API_KEY          = os.getenv("MASTER_API_KEY", "")
MAX_JOBS_PER_KEY        = int(os.getenv("MAX_JOBS_PER_KEY", "3"))
JOB_TIMEOUT_SECONDS     = int(os.getenv("JOB_TIMEOUT_SECONDS", "300"))

# ─────────────────────────────────────────────────────────────────────────
# AUTH / OAUTH — Google login + email-based authorisation
# ─────────────────────────────────────────────────────────────────────────

GOOGLE_CLIENT_ID        = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET    = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI     = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/auth/callback/google",
)

ALLOWED_EMAIL_DOMAINS: list[str] = [
    d.strip().lower()
    for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "").split(",")
    if d.strip()
]

ALLOWED_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.getenv("ALLOWED_EMAILS", "").split(",")
    if e.strip()
}

ADMIN_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.getenv("ADMIN_EMAILS", "").split(",")
    if e.strip()
}

SESSION_SECRET          = os.getenv("SESSION_SECRET", "local-dev-secret-change-in-prod")
SESSION_ALG             = "HS256"
SESSION_COOKIE          = os.getenv("SESSION_COOKIE_NAME", "mao_session")
SESSION_TTL_HOURS       = int(os.getenv("SESSION_TTL_HOURS", "8"))
OAUTH_SUCCESS_REDIRECT  = os.getenv("OAUTH_SUCCESS_REDIRECT", "http://localhost:5173")

# ─────────────────────────────────────────────────────────────────────────
# REPORT DEFAULTS
# ─────────────────────────────────────────────────────────────────────────

DEFAULT_REPORT_FORMAT   = "txt"

SUPPORTED_FORMATS: dict[str, tuple[str, str]] = {
    "txt":  ("text/plain",         ".txt"),
    "md":   ("text/markdown",      ".md"),
    "csv":  ("text/csv",           ".csv"),
    "json": ("application/json",   ".json"),
    "html": ("text/html",          ".html"),
    "log":  ("text/plain",         ".log"),
}

# ─────────────────────────────────────────────────────────────────────────
# WEB SEARCH DEFAULTS
# ─────────────────────────────────────────────────────────────────────────

SEARCH_PROVIDER         = os.getenv("SEARCH_PROVIDER", "auto")
SEARCH_MAX_RESULTS      = int(os.getenv("SEARCH_MAX_RESULTS", "5"))
SEARCH_TIMEOUT_SECONDS  = int(os.getenv("SEARCH_TIMEOUT", "10"))
SEARCH_REGION           = os.getenv("SEARCH_REGION", "wt-wt")
SEARCH_FALLBACK_TO_MOCK = os.getenv("SEARCH_FALLBACK_MOCK", "true").lower() == "true"

# ─────────────────────────────────────────────────────────────────────────
# RAG / KNOWLEDGE BASE DEFAULTS
# ─────────────────────────────────────────────────────────────────────────

RAG_EMBED_MODEL         = os.getenv("RAG_EMBED_MODEL", "nomic-embed-text")
RAG_CHUNK_SIZE          = int(os.getenv("RAG_CHUNK_SIZE", "400"))
RAG_CHUNK_OVERLAP       = int(os.getenv("RAG_CHUNK_OVERLAP", "80"))
RAG_TOP_K               = int(os.getenv("RAG_TOP_K", "4"))

# FIX: was 0.7 — way too high for keyword-fallback cosine scores (0.05–0.30).
# Set to 0.0 so top_k controls result count; the ranking still orders by score.
# If you have Ollama nomic-embed-text running, you can raise this to 0.4.
RAG_MIN_SCORE           = float(os.getenv("RAG_MIN_SCORE", "0.0"))

# FIX: was true — caused silent Ollama failure + fallback to broken hash()
# keyword vectors on every ingestion/query cycle. Set to false to use the
# reliable built-in djb2 keyword embedding unless Ollama is explicitly available.
# To enable Ollama embeddings: set RAG_USE_OLLAMA_EMBED=true env var and
# ensure `ollama pull nomic-embed-text` has been run.
RAG_USE_OLLAMA_EMBED    = os.getenv("RAG_USE_OLLAMA_EMBED", "false").lower() == "true"

# ─────────────────────────────────────────────────────────────────────────
# TELEGRAM DEFAULTS
# ─────────────────────────────────────────────────────────────────────────

TELEGRAM_TOKEN          = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_ALLOWED_CHATS  = [
    c.strip() for c in os.getenv("TELEGRAM_ALLOWED_CHAT_IDS", "").split(",")
    if c.strip()
]
TELEGRAM_NOTIFY_CHAT    = os.getenv("TELEGRAM_NOTIFY_CHAT_ID", "")

# ─────────────────────────────────────────────────────────────────────────
# SELF-IMPROVER DEFAULTS
# ─────────────────────────────────────────────────────────────────────────

IMPROVER_INTERVAL_HOURS = int(os.getenv("IMPROVER_INTERVAL_HOURS", "6"))
IMPROVER_MIN_CONFIDENCE = float(os.getenv("IMPROVER_MIN_CONFIDENCE", "0.7"))
IMPROVER_AUTO_APPLY     = os.getenv("IMPROVER_AUTO_APPLY", "true").lower() == "true"
IMPROVER_NOTIFY_TG      = os.getenv("IMPROVER_NOTIFY_TG", "true").lower() == "true"
IMPROVER_MODEL_OVERRIDE = os.getenv("IMPROVER_MODEL_OVERRIDE", "")

# ─────────────────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────────────────

LOG_LEVEL               = os.getenv("LOG_LEVEL", "INFO")
LOG_TO_FILE             = os.getenv("LOG_TO_FILE", "false").lower() == "true"

# ─────────────────────────────────────────────────────────────────────────
# CONVENIENCE: ensure all data/content directories exist
# ─────────────────────────────────────────────────────────────────────────

def ensure_dirs() -> None:
    """Create all required directories. Call once at startup."""
    for d in [
        REPORTS_DIR, UPLOADS_DIR, KB_DIR, AGENTS_DIR, TOOLS_DIR, LOGS_DIR,
        BASE_DIR / "data",
    ]:
        d.mkdir(parents=True, exist_ok=True)
