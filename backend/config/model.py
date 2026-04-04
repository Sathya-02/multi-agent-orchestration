"""
config/model.py — LLM model configuration
==========================================
Single source of truth for the active Ollama model and its parameters.

Usage:
    from config.model import get_active_model, set_active_model, get_llm_config

All model presets are defined in settings.py — edit there to add new models.
"""
import logging
import subprocess
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


def get_ollama_installed_models() -> set:
    """
    Ask the local Ollama daemon which models are actually pulled.
    Returns a set of model name strings (e.g. {'phi3:mini', 'llama3.2:3b'}).
    Falls back to an empty set if Ollama is unavailable.
    """
    installed: set = set()
    try:
        # Try the REST API first (works even when 'ollama' binary isn't on PATH)
        import requests as _req
        resp = _req.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if resp.ok:
            data = resp.json()
            for m in data.get("models", []):
                name = m.get("name", "") or m.get("model", "")
                if name:
                    installed.add(name)
            return installed
    except Exception:
        pass

    # Fallback: shell out to `ollama list`
    try:
        out = subprocess.check_output(["ollama", "list"], timeout=5, text=True)
        for line in out.splitlines()[1:]:  # skip header row
            parts = line.split()
            if parts:
                installed.add(parts[0])
    except Exception:
        pass

    return installed


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


def list_models_with_status() -> dict:
    """
    Return the active model plus the full preset list annotated with
    whether each model is actually installed in Ollama.

    Response shape consumed by the frontend fetchModels():
    {
      "active_model": "phi3:mini",
      "models": [
        { "name": "phi3:mini",   "pulled": true,  ... },
        { "name": "llama3:8b",   "pulled": false, ... },
      ]
    }
    """
    installed = get_ollama_installed_models()
    models = []
    for name, p in MODEL_PRESETS.items():
        models.append({
            "name":        name,
            "pulled":      name in installed,
            "temperature": p.get("temperature", 0.3),
            "num_ctx":     p.get("num_ctx", 4096),
            "num_predict": p.get("num_predict", 768),
        })

    # Also include any extra installed models not in presets
    preset_names = set(MODEL_PRESETS.keys())
    for name in sorted(installed - preset_names):
        models.append({
            "name":    name,
            "pulled":  True,
            "temperature": MODEL_DEFAULT_PRESET.get("temperature", 0.3),
            "num_ctx":     MODEL_DEFAULT_PRESET.get("num_ctx", 4096),
            "num_predict": MODEL_DEFAULT_PRESET.get("num_predict", 768),
        })

    return {
        "active_model": _active_model,
        "models":       models,
    }
