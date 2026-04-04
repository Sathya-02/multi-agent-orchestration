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
# Add any ollama model name here to set custom parameters.
# Fields: num_predict (max output tokens), num_ctx (context window), temperature
MODEL_PRESETS: dict[str, dict] = {
    # ── Lightweight — M1 8 GB / 4 vCPU cloud ─────────────────────────────
    "phi3:mini":        {"num_predict": 512,  "num_ctx": 4096, "temperature": 0.3},
    "llama3.2:3b":      {"num_predict": 768,  "num_ctx": 4096, "temperature": 0.3},
    "gemma2:2b":        {"num_predict": 512,  "num_ctx": 4096, "temperature": 0.3},
    "qwen2.5:3b":       {"num_predict": 768,  "num_ctx": 4096, "temperature": 0.3},
    "tinyllama:1.1b":   {"num_predict": 256,  "num_ctx": 2048, "temperature": 0.2},
    "gemma3:1b":        {"num_predict": 512,  "num_ctx": 4096, "temperature": 0.3},
    # ── Mid-range — 16 GB RAM / 8 vCPU cloud ─────────────────────────────
    "llama3:8b":        {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    "mistral:7b":       {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    "qwen2.5:7b":       {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    "llama3.1:8b":      {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    # ── Large — 32 GB RAM / GPU cloud ─────────────────────────────────────
    "llama3:70b":       {"num_predict": 2048, "num_ctx":16384, "temperature": 0.4},
    "mixtral:8x7b":     {"num_predict": 2048, "num_ctx":16384, "temperature": 0.4},
    "qwen2.5:72b":      {"num_predict": 2048, "num_ctx":16384, "temperature": 0.4},
    # ── Remote API models (set OLLAMA_URL to an OpenAI-compatible endpoint)
    "gpt-4o":           {"num_predict": 4096, "num_ctx":32768, "temperature": 0.4},
    "claude-3-5-sonnet":{"num_predict": 4096, "num_ctx":32768, "temperature": 0.4},
}

MODEL_DEFAULT_PRESET = {"num_predict": 768, "num_ctx": 4096, "temperature": 0.3}

# ─────────────────────────────────────────────────────────────────────────
# API SERVER
# ─────────────────────────────────────────────────────────────────────────

API_VERSION     = "7.0.0"
API_TITLE       = "Multi Agent Orchestration"

# CORS — which frontend origins are allowed to connect.
# In production add your domain: ["https://yourdomain.com"]
# Override: ALLOWED_ORIGINS env var (comma-separated)
_origins_env = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS: list[str] = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    if _origins_env
    else [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",   # common React dev alt port
    ]
)

# ─────────────────────────────────────────────────────────────────────────
# FEATURE FLAGS — set to False to disable entirely
# ─────────────────────────────────────────────────────────────────────────

# Real-time web search (DuckDuckGo, Yahoo Finance, wttr.in, etc.)
# Requires: pip install duckduckgo-search yfinance
SEARCH_ENABLED          = os.getenv("SEARCH_ENABLED", "true").lower() == "true"

# RAG / Knowledge Base (Ollama nomic-embed-text embeddings)
# Requires: ollama pull nomic-embed-text
RAG_ENABLED             = os.getenv("RAG_ENABLED", "true").lower() == "true"

# Telegram bot integration
# Requires: pip install python-telegram-bot==20.7 + bot token
TELEGRAM_ENABLED        = os.getenv("TELEGRAM_ENABLED", "false").lower() == "true"

# Autonomous self-improvement scheduler
SELF_IMPROVER_ENABLED   = os.getenv("SELF_IMPROVER_ENABLED", "true").lower() == "true"

# Agent spawn requests — agents can request creation of new agents
AGENT_SPAWN_ENABLED     = os.getenv("AGENT_SPAWN_ENABLED", "true").lower() == "true"

# Tool spawn requests — agents can request creation of new tools
TOOL_SPAWN_ENABLED      = os.getenv("TOOL_SPAWN_ENABLED", "true").lower() == "true"

# Filesystem access — File System Agent can read/write local files
FILESYSTEM_ENABLED      = os.getenv("FILESYSTEM_ENABLED", "true").lower() == "true"

# System stats endpoint (/stats)
STATS_ENABLED           = os.getenv("STATS_ENABLED", "true").lower() == "true"

# ─────────────────────────────────────────────────────────────────────────
# MULTI-USER / CLOUD
# ─────────────────────────────────────────────────────────────────────────

# Enable API key authentication (required for cloud/multi-user deployments)
# Override: REQUIRE_API_KEY=true
REQUIRE_API_KEY         = os.getenv("REQUIRE_API_KEY", "false").lower() == "true"

# Master API key for admin access (set this in production!)
# Override: MASTER_API_KEY env var
MASTER_API_KEY          = os.getenv("MASTER_API_KEY", "")

# Maximum concurrent jobs per API key (0 = unlimited)
MAX_JOBS_PER_KEY        = int(os.getenv("MAX_JOBS_PER_KEY", "3"))

# Job timeout in seconds
JOB_TIMEOUT_SECONDS     = int(os.getenv("JOB_TIMEOUT_SECONDS", "300"))

# ─────────────────────────────────────────────────────────────────────────
# AUTH / OAUTH — Google login + email-based authorisation
# ─────────────────────────────────────────────────────────────────────────
#
# LOCAL  → GOOGLE_CLIENT_ID/SECRET left empty → OAuth routes exist but
#          login button is hidden in the UI; app runs fully unauthenticated.
# DEV    → fill in a real OAuth app pointed at http://localhost:8000
# PROD   → set all vars in .env.production / environment secrets

# Google OAuth 2.0 credentials
# Get them at https://console.cloud.google.com/ → APIs & Services → Credentials
GOOGLE_CLIENT_ID        = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET    = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI     = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/auth/callback/google",
)

# Comma-separated list of email domains allowed to log in.
# Empty string = any Google account is allowed (open, use with care).
# Example: "gmail.com,mycompany.com"
ALLOWED_EMAIL_DOMAINS: list[str] = [
    d.strip().lower()
    for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "").split(",")
    if d.strip()
]

# Explicit allowlist of individual email addresses (always allowed regardless
# of domain rules above). Comma-separated.
ALLOWED_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.getenv("ALLOWED_EMAILS", "").split(",")
    if e.strip()
}

# Emails that receive admin/enterprise access.
ADMIN_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.getenv("ADMIN_EMAILS", "").split(",")
    if e.strip()
}

# Secret used to sign browser session JWTs.  MUST be overridden in production.
SESSION_SECRET          = os.getenv("SESSION_SECRET", "local-dev-secret-change-in-prod")
SESSION_ALG             = "HS256"
SESSION_COOKIE          = os.getenv("SESSION_COOKIE_NAME", "mao_session")
SESSION_TTL_HOURS       = int(os.getenv("SESSION_TTL_HOURS", "8"))

# After Google login, where to send the browser.
# Local: the Vite dev server.  Production: your real domain.
OAUTH_SUCCESS_REDIRECT  = os.getenv("OAUTH_SUCCESS_REDIRECT", "http://localhost:5173")

# ─────────────────────────────────────────────────────────────────────────
# REPORT DEFAULTS
# ─────────────────────────────────────────────────────────────────────────

# Default format when the LLM doesn't declare one
DEFAULT_REPORT_FORMAT   = "txt"

# Supported output formats: format_key → (mime_type, file_extension)
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

SEARCH_PROVIDER         = os.getenv("SEARCH_PROVIDER", "auto")  # auto|duckduckgo|wikipedia|mock
SEARCH_MAX_RESULTS      = int(os.getenv("SEARCH_MAX_RESULTS", "5"))
SEARCH_TIMEOUT_SECONDS  = int(os.getenv("SEARCH_TIMEOUT", "10"))
SEARCH_REGION           = os.getenv("SEARCH_REGION", "wt-wt")   # DuckDuckGo region
SEARCH_FALLBACK_TO_MOCK = os.getenv("SEARCH_FALLBACK_MOCK", "true").lower() == "true"

# ─────────────────────────────────────────────────────────────────────────
# RAG / KNOWLEDGE BASE DEFAULTS
# ─────────────────────────────────────────────────────────────────────────

RAG_EMBED_MODEL         = os.getenv("RAG_EMBED_MODEL", "nomic-embed-text")
RAG_CHUNK_SIZE          = int(os.getenv("RAG_CHUNK_SIZE", "400"))
RAG_CHUNK_OVERLAP       = int(os.getenv("RAG_CHUNK_OVERLAP", "80"))
RAG_TOP_K               = int(os.getenv("RAG_TOP_K", "4"))
RAG_MIN_SCORE           = float(os.getenv("RAG_MIN_SCORE", "0.7"))
RAG_USE_OLLAMA_EMBED    = os.getenv("RAG_USE_OLLAMA_EMBED", "true").lower() == "true"

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
