"""
telegram_bot.py — Telegram Bot Integration for Multi-Agent Orchestration

Connects the orchestration system to a Telegram bot so any user with
access can trigger jobs, check status, switch models, and receive results
— all from a Telegram chat.

Setup:
  1. Create a bot via @BotFather on Telegram → get BOT_TOKEN
  2. Get your CHAT_ID by messaging @userinfobot
  3. Set env vars (or put in telegram_config.json):
       TELEGRAM_BOT_TOKEN=<token>
       TELEGRAM_ALLOWED_CHAT_IDS=<chat_id1>,<chat_id2>
  4. pip install python-telegram-bot==20.7
  5. The bot starts automatically when the backend starts (if configured).
     Or run standalone: python telegram_bot.py

Commands:
  /help              — show all commands
  /run <topic>       — run a full research pipeline
  /query <question>  — quick query / maths
  /status            — current job status
  /agents            — list active agents
  /tools             — list active tools
  /model [name]      — show or switch active model
  /report            — resend the last completed report
  /stop              — cancel running job (best-effort)
"""
import asyncio, json, logging, os, threading, time
from pathlib import Path
from typing import Optional

logger = logging.getLogger("telegram_bot")

# ── Config ─────────────────────────────────────────────────────────────────
_CONFIG_PATH = Path(__file__).parent / "telegram_config.json"

def _load_config() -> dict:
    """Load config from file or environment variables."""
    cfg: dict = {
        "bot_token":         "",
        "allowed_chat_ids":  [],  # empty = allow all (not recommended)
        "notify_chat_id":    "",  # where to send unsolicited job notifications
        "enabled":           False,
    }
    if _CONFIG_PATH.exists():
        try:
            saved = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
            cfg.update(saved)
        except Exception:
            pass
    # Environment variables override file
    if os.environ.get("TELEGRAM_BOT_TOKEN"):
        cfg["bot_token"]   = os.environ["TELEGRAM_BOT_TOKEN"]
        cfg["enabled"]     = True
    if os.environ.get("TELEGRAM_ALLOWED_CHAT_IDS"):
        raw = os.environ["TELEGRAM_ALLOWED_CHAT_IDS"].split(",")
        cfg["allowed_chat_ids"] = [c.strip() for c in raw if c.strip()]
    if os.environ.get("TELEGRAM_NOTIFY_CHAT_ID"):
        cfg["notify_chat_id"] = os.environ["TELEGRAM_NOTIFY_CHAT_ID"]
    return cfg


def save_config(cfg: dict) -> None:
    _CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


_config: dict          = _load_config()
_bot_app               = None   # telegram.ext.Application instance
_bot_loop: Optional[asyncio.AbstractEventLoop] = None
_last_job_id: Optional[str]  = None
_last_report_path: Optional[Path] = None


# ─────────────────────────────────────────────────────────────────────────
# Guard — only continue if telegram library is available
# ─────────────────────────────────────────────────────────────────────────
try:
    from telegram import Update, Bot
    from telegram.ext import (
        Application, CommandHandler, MessageHandler,
        ContextTypes, filters,
    )
    from telegram.constants import ParseMode
    _TELEGRAM_AVAILABLE = True
except ImportError:
    _TELEGRAM_AVAILABLE = False
    logger.warning(
        "python-telegram-bot not installed. "
        "Run: pip install 'python-telegram-bot==20.7' to enable Telegram integration."
    )


# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────

def is_enabled() -> bool:
    return bool(_config.get("enabled") and _config.get("bot_token") and _TELEGRAM_AVAILABLE)


def _allowed(chat_id: str) -> bool:
    allowed = _config.get("allowed_chat_ids", [])
    if not allowed:
        return True   # open access — not recommended for production
    return str(chat_id) in [str(c) for c in allowed]


def _escape_md(text: str) -> str:
    """Escape special chars for Telegram MarkdownV2."""
    for ch in r"\_*[]()~`>#+-=|{}.!":
        text = text.replace(ch, "\\" + ch)
    return text


def _truncate(text: str, limit: int = 3800) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n\n…[truncated — {len(text)-limit} chars omitted]"


async def _reply(update: Update, text: str, parse_md: bool = False) -> None:
    mode = ParseMode.MARKDOWN_V2 if parse_md else None
    try:
        await update.message.reply_text(_truncate(text), parse_mode=mode)
    except Exception:
        # Fall back without markdown on parse error
        await update.message.reply_text(_truncate(text))


async def _send_to_chat(chat_id: str, text: str) -> None:
    """Send a message to a specific chat (used for push notifications)."""
    if not _bot_app:
        return
    try:
        await _bot_app.bot.send_message(chat_id=chat_id, text=_truncate(text))
    except Exception as e:
        logger.warning(f"Telegram send failed: {e}")


async def _send_file_to_chat(chat_id: str, path: Path, caption: str = "") -> None:
    if not _bot_app or not path.exists():
        return
    try:
        with open(path, "rb") as f:
            await _bot_app.bot.send_document(
                chat_id=chat_id, document=f,
                filename=path.name,
                caption=caption[:1024] if caption else path.name,
            )
    except Exception as e:
        logger.warning(f"Telegram file send failed: {e}")


# ─────────────────────────────────────────────────────────────────────────
# Command handlers
# ─────────────────────────────────────────────────────────────────────────

async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    text = (
        "🤖 *Multi-Agent Orchestration Bot*\n\n"
        "/run <topic>        — Research pipeline\n"
        "/query <question>   — Quick query / maths\n"
        "/file <filename> <question>  — Analyse uploaded file\n"
        "/status             — Current job status\n"
        "/agents             — List active agents\n"
        "/tools              — List active tools\n"
        "/model [name]       — Show or switch model\n"
        "/report             — Resend last report as file\n"
        "/help               — This message\n\n"
        "Results are sent back automatically when jobs complete."
    )
    await update.message.reply_text(text, parse_mode=ParseMode.MARKDOWN)


async def cmd_run(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    topic = " ".join(context.args).strip()
    if not topic:
        await _reply(update, "Usage: /run <research topic>")
        return
    job_id = _trigger_job(topic, "research")
    await _reply(update, f"🚀 Research started (job #{job_id})\nTopic: {topic}\n\nResults will be sent when complete.")


async def cmd_query(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    question = " ".join(context.args).strip()
    if not question:
        await _reply(update, "Usage: /query <your question or expression>")
        return
    job_id = _trigger_job(question, "query")
    await _reply(update, f"💬 Query running (job #{job_id})…\nResults incoming.")


async def cmd_file(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    args = context.args
    if len(args) < 2:
        await _reply(update, "Usage: /file <filename> <your question>")
        return
    filename = args[0]
    question = " ".join(args[1:])
    job_id   = _trigger_job(question, "file", uploaded_files=[filename])
    await _reply(update, f"📎 File analysis started (job #{job_id})\nFile: {filename}\nQuestion: {question}")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    import main as _main
    if not _last_job_id or _last_job_id not in _main.jobs:
        await _reply(update, "No jobs have been run yet this session.")
        return
    job = _main.jobs[_last_job_id]
    status = job.get("status","unknown").upper()
    topic  = job.get("topic","?")[:60]
    model  = job.get("model","?")
    lines  = [
        f"📊 Job #{_last_job_id}",
        f"Status: {status}",
        f"Topic:  {topic}",
        f"Model:  {model}",
    ]
    if job.get("filename"):
        lines.append(f"Report: {job['filename']}")
    await _reply(update, "\n".join(lines))


async def cmd_agents(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    from agent_registry import get_all_agents
    agents = get_all_agents()
    lines  = ["🤖 Agents:\n"]
    for a in agents:
        status = "✅" if a.get("active", True) else "⏸"
        badge  = " [built-in]" if a.get("builtin") else " [custom]"
        lines.append(f"{status} {a['icon']} {a['role']}{badge}")
    await _reply(update, "\n".join(lines))


async def cmd_tools(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    from tool_registry import get_all_tools
    tools = get_all_tools()
    lines = ["🔧 Tools:\n"]
    for t in tools:
        status = "✅" if t.get("active", True) else "⏸"
        badge  = " [built-in]" if t.get("builtin") else " [custom]"
        lines.append(f"{status} {t.get('display_name', t['name'])}{badge}")
    await _reply(update, "\n".join(lines))


async def cmd_model(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    from model_config import get_active_model, set_active_model
    if context.args:
        new_model = context.args[0].strip()
        try:
            import requests as req
            installed = [m["name"] for m in
                         req.get("http://localhost:11434/api/tags", timeout=5).json().get("models", [])]
            if new_model not in installed:
                await _reply(update, f"❌ Model '{new_model}' not installed.\nInstalled: {', '.join(installed)}")
                return
        except Exception:
            await _reply(update, "❌ Cannot reach Ollama at localhost:11434")
            return
        set_active_model(new_model)
        await _reply(update, f"✅ Model switched to: {new_model}")
    else:
        current = get_active_model()
        await _reply(update, f"Active model: {current}\n\nTo switch: /model <model_name>")


async def cmd_report(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    if not _last_report_path or not _last_report_path.exists():
        await _reply(update, "No report available yet. Run a job first with /run <topic>")
        return
    await _send_file_to_chat(
        update.effective_chat.id,
        _last_report_path,
        caption=f"📄 Last report: {_last_report_path.name}"
    )


async def unknown_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_chat.id):
        return
    await _reply(update, "Unknown command. Use /help to see available commands.")


# ─────────────────────────────────────────────────────────────────────────
# Job triggering (calls main.py run_crew_sync in a thread)
# ─────────────────────────────────────────────────────────────────────────

def _trigger_job(topic: str, mode: str, uploaded_files: list = None) -> str:
    """Submit a job to the orchestration system and return job_id."""
    global _last_job_id
    import main as _main
    job_id = str(uuid.uuid4())[:8]
    _main.jobs[job_id] = {
        "status": "queued", "topic": topic, "mode": mode,
        "result": None, "model": _main.get_active_model(), "filename": None,
        "_telegram_origin": True,
    }
    _last_job_id = job_id
    t = threading.Thread(
        target=_main.run_crew_sync,
        args=(job_id, topic, mode, uploaded_files or []),
        daemon=True,
    )
    t.start()
    return job_id


# ─────────────────────────────────────────────────────────────────────────
# Push notification — called by main.py when a job completes
# ─────────────────────────────────────────────────────────────────────────

def notify_job_done(job_id: str, result: str, filename: Optional[str],
                    fmt: str = "md") -> None:
    """
    Called from main.py's _crew() thread when a job finishes.
    Sends the result to the notify_chat_id (and the originating chat if different).
    """
    global _last_report_path
    notify_chat = _config.get("notify_chat_id", "")
    if not notify_chat or not is_enabled():
        return

    from pathlib import Path as _Path
    reports_dir = _Path(__file__).parent / "reports"
    report_path = reports_dir / filename if filename else None
    if report_path and report_path.exists():
        _last_report_path = report_path

    # Build summary message
    preview  = result[:600] + ("…" if len(result) > 600 else "")
    msg      = f"✅ Job #{job_id} complete\n\n{preview}"

    def _send():
        if not _bot_loop or not _bot_app:
            return
        # Schedule coroutines on the bot's event loop from this thread
        future = asyncio.run_coroutine_threadsafe(
            _send_to_chat(notify_chat, msg), _bot_loop
        )
        try:
            future.result(timeout=15)
        except Exception as e:
            logger.warning(f"Telegram notify failed: {e}")
            return
        # Send the report file if available
        if report_path and report_path.exists():
            future2 = asyncio.run_coroutine_threadsafe(
                _send_file_to_chat(
                    notify_chat, report_path,
                    caption=f"📄 Report: {report_path.name}"
                ),
                _bot_loop,
            )
            try:
                future2.result(timeout=30)
            except Exception as e:
                logger.warning(f"Telegram file send failed: {e}")

    threading.Thread(target=_send, daemon=True).start()


def notify_message(text: str) -> None:
    """Send an arbitrary notification to the notify_chat_id."""
    notify_chat = _config.get("notify_chat_id", "")
    if not notify_chat or not is_enabled() or not _bot_loop:
        return
    asyncio.run_coroutine_threadsafe(
        _send_to_chat(notify_chat, text), _bot_loop
    )


# ─────────────────────────────────────────────────────────────────────────
# Bot lifecycle
# ─────────────────────────────────────────────────────────────────────────

def _build_app(token: str) -> "Application":
    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("help",   cmd_help))
    app.add_handler(CommandHandler("start",  cmd_help))
    app.add_handler(CommandHandler("run",    cmd_run))
    app.add_handler(CommandHandler("query",  cmd_query))
    app.add_handler(CommandHandler("file",   cmd_file))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("agents", cmd_agents))
    app.add_handler(CommandHandler("tools",  cmd_tools))
    app.add_handler(CommandHandler("model",  cmd_model))
    app.add_handler(CommandHandler("report", cmd_report))
    app.add_handler(MessageHandler(filters.COMMAND, unknown_command))
    return app


def _bot_thread_main(token: str) -> None:
    """Runs in a daemon thread — owns its own event loop."""
    global _bot_app, _bot_loop
    import asyncio as _aio
    loop = _aio.new_event_loop()
    _aio.set_event_loop(loop)
    _bot_loop = loop

    async def _run():
        global _bot_app
        _bot_app = _build_app(token)
        logger.info("Telegram bot starting (polling)…")
        await _bot_app.initialize()
        await _bot_app.start()
        await _bot_app.updater.start_polling(drop_pending_updates=True)
        logger.info("Telegram bot polling active.")
        # Keep running until the loop is stopped
        while True:
            await _aio.sleep(3600)

    try:
        loop.run_until_complete(_run())
    except Exception as e:
        logger.error(f"Telegram bot error: {e}")


def start_bot() -> bool:
    """
    Start the Telegram bot in a background daemon thread.
    Returns True if started, False if not configured or unavailable.
    """
    if not is_enabled():
        return False
    token = _config.get("bot_token", "")
    if not token:
        logger.info("Telegram bot not started — no token configured.")
        return False
    t = threading.Thread(target=_bot_thread_main, args=(token,), daemon=True, name="telegram-bot")
    t.start()
    logger.info("Telegram bot thread started.")
    return True


def stop_bot() -> None:
    global _bot_app, _bot_loop
    if _bot_app and _bot_loop:
        asyncio.run_coroutine_threadsafe(_bot_app.stop(), _bot_loop)


# ─────────────────────────────────────────────────────────────────────────
# Import uuid at module level (used by _trigger_job)
# ─────────────────────────────────────────────────────────────────────────
import uuid   # noqa: E402 (needed after the class definitions that reference it)


# ─────────────────────────────────────────────────────────────────────────
# Standalone entry point (for testing outside FastAPI)
# ─────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import logging as _logging
    _logging.basicConfig(level=_logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    cfg = _load_config()
    if not cfg.get("bot_token"):
        print("Set TELEGRAM_BOT_TOKEN env var or add bot_token to telegram_config.json")
    else:
        start_bot()
        print("Bot running. Press Ctrl+C to stop.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            stop_bot()
