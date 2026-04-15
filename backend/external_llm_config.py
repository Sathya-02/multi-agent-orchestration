"""
external_llm_config.py
────────────────────────────────────────────────────────────────────────────
Persistence layer for external LLM provider configurations.
Stores provider configs in a JSON file: backend/external_providers.json

Supported provider types:
  - openai       : OpenAI-compatible API (GPT-4, GPT-3.5, etc.)
  - anthropic    : Anthropic Claude API
  - custom       : Any OpenAI-compatible endpoint (LM Studio, Groq, Together, etc.)
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Optional

CONFIG_FILE = Path(__file__).parent / "external_providers.json"

# ── Well-known provider presets ───────────────────────────────────────────────
PROVIDER_PRESETS: dict[str, dict] = {
    "openai": {
        "display_name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        "icon": "🟢",
    },
    "anthropic": {
        "display_name": "Anthropic (Claude)",
        "base_url": "https://api.anthropic.com",
        "default_model": "claude-3-5-sonnet-20241022",
        "models": [
            "claude-opus-4-5",
            "claude-sonnet-4-5",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
        ],
        "icon": "🟠",
    },
    "groq": {
        "display_name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "default_model": "llama-3.3-70b-versatile",
        "models": [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "mixtral-8x7b-32768",
            "gemma2-9b-it",
        ],
        "icon": "⚡",
    },
    "together": {
        "display_name": "Together AI",
        "base_url": "https://api.together.xyz/v1",
        "default_model": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
        "models": [
            "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
            "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
            "mistralai/Mixtral-8x7B-Instruct-v0.1",
        ],
        "icon": "🔵",
    },
    "custom": {
        "display_name": "Custom (OpenAI-compatible)",
        "base_url": "http://localhost:1234/v1",
        "default_model": "",
        "models": [],
        "icon": "⚙️",
    },
}


def _load_raw() -> dict:
    """Load the raw JSON config, returning empty structure if missing."""
    if not CONFIG_FILE.exists():
        return {"providers": []}
    try:
        with open(CONFIG_FILE, "r") as f:
            data = json.load(f)
        if "providers" not in data:
            data["providers"] = []
        return data
    except Exception:
        return {"providers": []}


def _save_raw(data: dict) -> None:
    """Persist the config dict to disk."""
    with open(CONFIG_FILE, "w") as f:
        json.dump(data, f, indent=2)


def list_providers() -> list[dict]:
    """Return all configured external providers (tokens masked)."""
    raw = _load_raw()
    result = []
    for p in raw.get("providers", []):
        entry = {k: v for k, v in p.items()}
        # Mask token for display
        if entry.get("api_token"):
            t = entry["api_token"]
            entry["api_token_masked"] = t[:6] + "*" * max(0, len(t) - 10) + t[-4:] if len(t) > 10 else "*" * len(t)
        else:
            entry["api_token_masked"] = ""
        result.append(entry)
    return result


def get_provider(provider_id: str) -> Optional[dict]:
    """Return a single provider config by id (unmasked — internal use only)."""
    raw = _load_raw()
    for p in raw.get("providers", []):
        if p.get("id") == provider_id:
            return p
    return None


def add_provider(
    provider_type: str,
    display_name: str,
    base_url: str,
    api_token: str,
    model_name: str,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    provider_id: Optional[str] = None,
) -> dict:
    """Add or update an external provider. Returns the saved entry."""
    raw = _load_raw()
    providers = raw.get("providers", [])

    pid = provider_id or str(uuid.uuid4())[:8]

    # Update existing if id matches
    for i, p in enumerate(providers):
        if p.get("id") == pid:
            providers[i] = {
                "id": pid,
                "provider_type": provider_type,
                "display_name": display_name,
                "base_url": base_url.rstrip("/"),
                "api_token": api_token,
                "model_name": model_name,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            raw["providers"] = providers
            _save_raw(raw)
            return providers[i]

    # New entry
    entry = {
        "id": pid,
        "provider_type": provider_type,
        "display_name": display_name,
        "base_url": base_url.rstrip("/"),
        "api_token": api_token,
        "model_name": model_name,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    providers.append(entry)
    raw["providers"] = providers
    _save_raw(raw)
    return entry


def delete_provider(provider_id: str) -> bool:
    """Remove a provider by id. Returns True if deleted."""
    raw = _load_raw()
    before = len(raw.get("providers", []))
    raw["providers"] = [p for p in raw.get("providers", []) if p.get("id") != provider_id]
    if len(raw["providers"]) < before:
        _save_raw(raw)
        return True
    return False


def get_active_external() -> Optional[dict]:
    """Return the currently active external provider config, if any."""
    raw = _load_raw()
    active_id = raw.get("active_external_id")
    if not active_id:
        return None
    return get_provider(active_id)


def set_active_external(provider_id: Optional[str]) -> None:
    """Mark a provider as active (or clear by passing None)."""
    raw = _load_raw()
    if provider_id is None:
        raw.pop("active_external_id", None)
    else:
        raw["active_external_id"] = provider_id
    _save_raw(raw)


def get_active_mode() -> str:
    """Return 'local' or 'external' depending on which is currently selected."""
    raw = _load_raw()
    return raw.get("active_mode", "local")


def set_active_mode(mode: str) -> None:
    """Set active_mode to 'local' or 'external'."""
    raw = _load_raw()
    raw["active_mode"] = mode
    _save_raw(raw)


def test_provider(provider_id: str) -> dict:
    """
    Attempt a minimal API call to verify the provider works.
    Returns {"ok": bool, "message": str}
    """
    p = get_provider(provider_id)
    if not p:
        return {"ok": False, "message": "Provider not found"}

    try:
        if p["provider_type"] == "anthropic":
            return _test_anthropic(p)
        else:
            return _test_openai_compat(p)
    except Exception as e:
        return {"ok": False, "message": str(e)}


def _test_openai_compat(p: dict) -> dict:
    """Test an OpenAI-compatible endpoint."""
    try:
        import openai
    except ImportError:
        return {"ok": False, "message": "openai package not installed — run: pip install openai"}

    client = openai.OpenAI(
        api_key=p.get("api_token", "no-key"),
        base_url=p.get("base_url", "https://api.openai.com/v1"),
        timeout=10,
    )
    try:
        resp = client.chat.completions.create(
            model=p.get("model_name", "gpt-4o-mini"),
            messages=[{"role": "user", "content": "Say hello in 3 words."}],
            max_tokens=20,
        )
        text = resp.choices[0].message.content or ""
        return {"ok": True, "message": f"✅ Connected — response: \"{text.strip()[:80]}\""}
    except Exception as e:
        return {"ok": False, "message": f"API error: {e}"}


def _test_anthropic(p: dict) -> dict:
    """Test an Anthropic Claude endpoint."""
    try:
        import anthropic
    except ImportError:
        return {"ok": False, "message": "anthropic package not installed — run: pip install anthropic"}

    client = anthropic.Anthropic(api_key=p.get("api_token", ""), timeout=10)
    try:
        resp = client.messages.create(
            model=p.get("model_name", "claude-3-5-haiku-20241022"),
            max_tokens=20,
            messages=[{"role": "user", "content": "Say hello in 3 words."}],
        )
        text = resp.content[0].text if resp.content else ""
        return {"ok": True, "message": f"✅ Connected — response: \"{text.strip()[:80]}\""}
    except Exception as e:
        return {"ok": False, "message": f"API error: {e}"}
