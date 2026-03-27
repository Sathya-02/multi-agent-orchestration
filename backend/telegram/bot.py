"""
telegram/bot.py — Telegram bot module wrapper
==============================================
Re-exports the public API from telegram_bot.py at the backend root.
The telegram/ package shadows python-telegram-bot's own 'telegram' namespace,
so telegram_bot.py is loaded explicitly by file path.

    from telegram.bot import start_bot, stop_bot, notify_job_done, notify_message
"""
import importlib.util, pathlib

# Load telegram_bot.py explicitly to avoid shadowing python-telegram-bot
_path = pathlib.Path(__file__).parent.parent / "telegram_bot.py"
_spec = importlib.util.spec_from_file_location("_telegram_bot_flat", _path)
_mod  = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

# Re-export public API
start_bot        = _mod.start_bot
stop_bot         = _mod.stop_bot
notify_job_done  = _mod.notify_job_done
notify_message   = _mod.notify_message
is_enabled       = _mod.is_enabled

__all__ = ["start_bot", "stop_bot", "notify_job_done", "notify_message", "is_enabled"]
