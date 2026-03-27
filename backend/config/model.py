"""
config/model.py — LLM model configuration
==========================================
Single source of truth for the active Ollama model and its parameters.

Usage:
    from config.model import get_active_model, set_active_model, get_llm_config

All model presets are defined in settings.py — edit there to add new models.
"""
import logging
from settings import OLLAMA_MODEL, OLLAMA_URL, MODEL_PRESETS, MODEL_DEFAULT_PRESET

logger = logging.getLogger("config.model")

# Runtime state — starts from settings.py, can be changed via /model API
_active_model: str = OLLAMA_MODEL


def get_active_model() -> str:
    """Return the currently selected model name."""
    return _active_model


def set_active_model(model_name: str) -> None:
    """Update the active model. Takes effect on the next job run."""
    global _active_model
    logger.info(f"Model switched: {_active_model} → {model_name}")
    _active_model = model_name


def get_model_preset(model_name: str | None = None) -> dict:
    """Return the parameter preset for a given model (or the active one)."""
    name = model_name or _active_model
    return MODEL_PRESETS.get(name, MODEL_DEFAULT_PRESET)


def get_llm_config(model_name: str | None = None) -> dict:
    """
    Return the full ChatOllama kwargs dict.

    Usage:
        from langchain_ollama import ChatOllama
        llm = ChatOllama(**get_llm_config())
    """
    name   = model_name or _active_model
    preset = MODEL_PRESETS.get(name, MODEL_DEFAULT_PRESET)
    return {
        "model":    name,
        "base_url": OLLAMA_URL,
        **preset,
    }


def list_presets() -> dict:
    """Return all configured model presets for display in the model picker."""
    return {
        name: {
            "temperature":   p.get("temperature", 0.3),
            "num_ctx":       p.get("num_ctx", 4096),
            "num_predict":   p.get("num_predict", 768),
        }
        for name, p in MODEL_PRESETS.items()
    }
