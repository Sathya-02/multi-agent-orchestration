"""
Shared model configuration — single source of truth for which
Ollama model the agents use. Updated at runtime via the /model API endpoint.
"""

# ── Default model ─────────────────────────────────────────────────────────
_active_model: str = "phi3:mini"

# ── Per-model tuning presets ──────────────────────────────────────────────
# num_predict  = max tokens the model generates per response
# num_ctx      = context window size (tokens)
# temperature  = creativity vs determinism (lower = more focused)
MODEL_PRESETS: dict[str, dict] = {
    # ── Installed on this machine ─────────────────────────────────────────
    "phi3:mini": {
        "num_predict": 512,
        "num_ctx":     4096,
        "temperature": 0.3,
    },
    "llama3.2:3b": {
        "num_predict": 768,
        "num_ctx":     4096,
        "temperature": 0.3,
    },
    "gemma3:1b": {
        "num_predict": 512,
        "num_ctx":     4096,
        "temperature": 0.3,
    },
    "qwen2.5:3b": {
        "num_predict": 768,
        "num_ctx":     4096,
        "temperature": 0.3,
    },
    # ── Embedding models (not for chat, listed for completeness) ──────────
    "nomic-embed-text:latest": {
        "num_predict": 0,
        "num_ctx":     2048,
        "temperature": 0.0,
    },
    "mxbai-embed-large:latest": {
        "num_predict": 0,
        "num_ctx":     2048,
        "temperature": 0.0,
    },
    # ── Small / M1 8 GB safe (additional presets) ─────────────────────────
    "gemma2:2b": {
        "num_predict": 512,
        "num_ctx":     4096,
        "temperature": 0.3,
    },
    "tinyllama:1.1b": {
        "num_predict": 256,
        "num_ctx":     2048,
        "temperature": 0.2,
    },
    # ── Larger / 16 GB+ ───────────────────────────────────────────────────
    "llama3:8b": {
        "num_predict": 1024,
        "num_ctx":     8192,
        "temperature": 0.4,
    },
    "mistral:7b": {
        "num_predict": 1024,
        "num_ctx":     8192,
        "temperature": 0.4,
    },
    "qwen2.5:7b": {
        "num_predict": 1024,
        "num_ctx":     8192,
        "temperature": 0.4,
    },
}

# ── Default fallback preset (for unknown / custom model names) ────────────
_DEFAULT_PRESET = {
    "num_predict": 768,
    "num_ctx":     4096,
    "temperature": 0.3,
}


def get_active_model() -> str:
    """Return the currently selected model name."""
    return _active_model


def set_active_model(model_name: str) -> None:
    """Update the active model name."""
    global _active_model
    _active_model = model_name


def get_llm_config() -> dict:
    """Return the full ChatOllama kwargs dict for the active model."""
    preset = MODEL_PRESETS.get(_active_model, _DEFAULT_PRESET)
    return {
        "model":       _active_model,
        "base_url":    "http://localhost:11434",
        **preset,
    }
