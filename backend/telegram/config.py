"""
telegram/config.py — Telegram bot configuration (module wrapper)
=================================================================
Re-exports from telegram_bot.py loaded via importlib to avoid the
telegram/ package shadowing python-telegram-bot's own 'telegram' namespace.

    from telegram.config import load_config, save_config, is_enabled
"""
import importlib.util, pathlib

_path = pathlib.Path(__file__).parent.parent / "telegram_bot.py"
_spec = importlib.util.spec_from_file_location("_telegram_bot_flat", _path)
_mod  = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

load_config  = _mod._load_config
save_config  = _mod.save_config
is_enabled   = _mod.is_enabled

__all__ = ["load_config", "save_config", "is_enabled"]
