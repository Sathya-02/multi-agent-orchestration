"""
model_config.py
────────────────────────────────────────────────────────────────────────────
Shared model configuration — single source of truth for which LLM the
agents use. Supports both:
  1. Local Ollama models (original behaviour)
  2. External LLM providers: OpenAI, Anthropic Claude, or any
     OpenAI-compatible API (Groq, Together AI, LM Studio, etc.)

Updated at runtime via the /model and /models/external-providers API endpoints.
"""
from __future__ import annotations

from typing import Any

# ── Default local model ────────────────────────────────────────────────────
_active_model: str = "phi3:mini"

# ── Per-model tuning presets (Ollama / local) ──────────────────────────────
MODEL_PRESETS: dict[str, dict] = {
    "phi3:mini":           {"num_predict": 512,  "num_ctx": 4096, "temperature": 0.3},
    "llama3.2:3b":         {"num_predict": 768,  "num_ctx": 4096, "temperature": 0.3},
    "gemma3:1b":           {"num_predict": 512,  "num_ctx": 4096, "temperature": 0.3},
    "qwen2.5:3b":          {"num_predict": 768,  "num_ctx": 4096, "temperature": 0.3},
    "nomic-embed-text:latest":  {"num_predict": 0, "num_ctx": 2048, "temperature": 0.0},
    "mxbai-embed-large:latest": {"num_predict": 0, "num_ctx": 2048, "temperature": 0.0},
    "gemma2:2b":           {"num_predict": 512,  "num_ctx": 4096, "temperature": 0.3},
    "tinyllama:1.1b":      {"num_predict": 256,  "num_ctx": 2048, "temperature": 0.2},
    "llama3:8b":           {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    "mistral:7b":          {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
    "qwen2.5:7b":          {"num_predict": 1024, "num_ctx": 8192, "temperature": 0.4},
}

_DEFAULT_PRESET = {"num_predict": 768, "num_ctx": 4096, "temperature": 0.3}


def get_active_model() -> str:
    """Return the currently selected local model name."""
    return _active_model


def set_active_model(model_name: str) -> None:
    """Update the active local model name."""
    global _active_model
    _active_model = model_name


def get_llm_config() -> dict:
    """
    Return the LLM kwargs dict for the *currently active* provider.
    - If an external provider is active  → returns config for that provider.
    - Otherwise                          → returns ChatOllama kwargs (legacy).
    """
    try:
        from external_llm_config import get_active_mode, get_active_external
        if get_active_mode() == "external":
            ext = get_active_external()
            if ext:
                return _build_external_config(ext)
    except Exception:
        pass
    return _build_ollama_config()


def _build_ollama_config() -> dict:
    """Build ChatOllama kwargs for the active local model."""
    preset = MODEL_PRESETS.get(_active_model, _DEFAULT_PRESET)
    return {
        "provider":  "ollama",
        "model":     _active_model,
        "base_url":  "http://localhost:11434",
        **preset,
    }


def _build_external_config(ext: dict) -> dict:
    """Build LLM kwargs for an external provider config dict."""
    return {
        "provider":    ext["provider_type"],
        "model":       ext["model_name"],
        "base_url":    ext["base_url"],
        "api_key":     ext["api_token"],
        "temperature": ext.get("temperature", 0.3),
        "max_tokens":  ext.get("max_tokens", 1024),
    }


def get_langchain_llm(stream: bool = False) -> Any:
    """
    Factory: return the appropriate LangChain LLM object based on
    the currently active provider.  Used by agents_crew.py, tasks_crew.py,
    and self_improver.py.

    Raises ImportError with a helpful message if the required package is absent.
    """
    cfg = get_llm_config()
    provider = cfg.get("provider", "ollama")

    if provider == "ollama":
        from langchain_ollama import ChatOllama  # type: ignore
        preset = MODEL_PRESETS.get(cfg["model"], _DEFAULT_PRESET)
        return ChatOllama(
            model=cfg["model"],
            base_url=cfg["base_url"],
            **preset,
        )

    if provider == "openai":
        try:
            from langchain_openai import ChatOpenAI  # type: ignore
        except ImportError:
            raise ImportError(
                "langchain_openai not installed. Run: pip install langchain-openai"
            )
        return ChatOpenAI(
            model=cfg["model"],
            openai_api_key=cfg["api_key"],
            openai_api_base=cfg.get("base_url"),
            temperature=cfg.get("temperature", 0.3),
            max_tokens=cfg.get("max_tokens", 1024),
            streaming=stream,
        )

    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic  # type: ignore
        except ImportError:
            raise ImportError(
                "langchain_anthropic not installed. Run: pip install langchain-anthropic"
            )
        return ChatAnthropic(
            model=cfg["model"],
            anthropic_api_key=cfg["api_key"],
            temperature=cfg.get("temperature", 0.3),
            max_tokens=cfg.get("max_tokens", 1024),
        )

    if provider == "custom":
        # Treat all custom endpoints as OpenAI-compatible
        try:
            from langchain_openai import ChatOpenAI  # type: ignore
        except ImportError:
            raise ImportError(
                "langchain_openai not installed. Run: pip install langchain-openai"
            )
        return ChatOpenAI(
            model=cfg["model"],
            openai_api_key=cfg.get("api_key", "no-key"),
            openai_api_base=cfg["base_url"],
            temperature=cfg.get("temperature", 0.3),
            max_tokens=cfg.get("max_tokens", 1024),
            streaming=stream,
        )

    raise ValueError(f"Unknown LLM provider: {provider!r}")
