"""
self_improver.py — Autonomous System Self-Improvement

Runs in two modes:
  1. SCHEDULED — background thread fires every interval_hours
  2. PER-RUN   — triggered automatically after each job completes
     (debounced: min 5 minutes between cycles)

On each cycle it:
  1. Reads all SKILLS.md and TOOL.md files
  2. Reads the last N job activity logs (from a rolling log file)
  3. Reads the current BEST_PRACTICES.md
  4. Asks the LLM (via Ollama) to:
       a) Identify patterns in recent job failures or weak outputs
       b) Suggest improvements to agent goals/backstories
       c) Suggest improvements to tool descriptions
       d) Update BEST_PRACTICES.md with new learnings
  5. Applies non-destructive improvements (description updates) automatically
  6. Writes bigger structural suggestions to IMPROVEMENT_PROPOSALS.md
     for human review
  7. Broadcasts improvements via WebSocket so the UI shows them

The service never deletes anything — only appends and rewrites descriptions.
All changes are logged in IMPROVEMENT_LOG.md.
"""
import json, logging, re, threading, time
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger("self_improver")

BASE_DIR            = Path(__file__).parent
BEST_PRACTICES_PATH = BASE_DIR / "BEST_PRACTICES.md"
PROPOSALS_PATH      = BASE_DIR / "IMPROVEMENT_PROPOSALS.md"
IMPROVEMENT_LOG     = BASE_DIR / "IMPROVEMENT_LOG.md"
ACTIVITY_LOG_PATH   = BASE_DIR / "activity_log.jsonl"
CONFIG_PATH         = BASE_DIR / "self_improver_config.json"

_DEFAULT_CONFIG = {
    "enabled":              True,
    "interval_hours":       6,          # scheduled run every N hours
    "run_trigger":          True,       # also trigger after every job
    "run_trigger_debounce": 300,        # min seconds between per-run cycles
    "max_activity_entries": 50,
    "auto_apply_safe":      True,
    "notify_telegram":      True,
    "model_override":       "",
    "min_confidence":       0.7,
}

_config: dict    = {}
_lock            = threading.Lock()   # prevents concurrent cycles
_thread: Optional[threading.Thread] = None
_last_cycle_ts: float = 0.0           # epoch of last completed cycle


# ─────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────

def load_config() -> dict:
    global _config
    cfg = dict(_DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            saved = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            cfg.update(saved)
        except Exception:
            pass
    _config = cfg
    return cfg


def save_config(cfg: dict) -> None:
    global _config
    _config = cfg
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────
# Activity log writer (called from main.py after each job)
# ─────────────────────────────────────────────────────────────────────────

def log_activity(event: dict) -> None:
    """
    Append a job event to the rolling activity log.
    If run_trigger is enabled, also fire an improvement cycle
    (debounced by run_trigger_debounce seconds).
    """
    global _last_cycle_ts
    try:
        with open(ACTIVITY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
        # Trim to last 500 lines
        lines = ACTIVITY_LOG_PATH.read_text(encoding="utf-8").splitlines()
        if len(lines) > 500:
            ACTIVITY_LOG_PATH.write_text("\n".join(lines[-500:]) + "\n", encoding="utf-8")
    except Exception as e:
        logger.warning(f"Activity log write failed: {e}")

    # ── Per-run trigger ──────────────────────────────────────────────────
    cfg = _config or load_config()
    if not cfg.get("run_trigger", True):
        return
    if not cfg.get("enabled", True):
        return
    debounce = int(cfg.get("run_trigger_debounce", 300))
    if time.time() - _last_cycle_ts < debounce:
        logger.debug("Self-improver debounce: skipping per-run trigger")
        return

    # Fire in background — pass the triggering event as run context
    def _run():
        global _last_cycle_ts
        if not _lock.acquire(blocking=False):
            logger.debug("Self-improver busy: skipping per-run trigger")
            return
        try:
            _last_cycle_ts = time.time()
            results = _run_improvement_cycle(run_context=event)
            _broadcast_results(results)
            if cfg.get("notify_telegram"):
                _notify_telegram(results)
        except Exception as e:
            logger.exception(f"Per-run improvement cycle failed: {e}")
        finally:
            _lock.release()

    t = threading.Thread(target=_run, daemon=True, name="self-improver-per-run")
    t.start()


def _read_recent_activity(n: int = 50) -> list:
    if not ACTIVITY_LOG_PATH.exists():
        return []
    lines = ACTIVITY_LOG_PATH.read_text(encoding="utf-8").splitlines()
    recent = []
    for line in lines[-n:]:
        try:
            recent.append(json.loads(line))
        except Exception:
            pass
    return recent


# ─────────────────────────────────────────────────────────────────────────
# Context gathering
# ─────────────────────────────────────────────────────────────────────────

def _gather_agent_context() -> str:
    """Read all SKILLS.md files and return a summary."""
    from agent_registry import AGENTS_DIR, get_all_agents
    sections = []
    for agent in get_all_agents():
        aid = agent["id"]
        p   = AGENTS_DIR / aid / "SKILLS.md"
        if p.exists():
            sections.append(f"### Agent: {agent['role']} ({aid})\n{p.read_text(encoding='utf-8')}")
        else:
            sections.append(f"### Agent: {agent['role']} ({aid})\n[No SKILLS.md]")
    return "\n\n".join(sections)


def _gather_tool_context() -> str:
    """Read all TOOL.md files and return a summary."""
    from tool_registry import TOOLS_DIR, get_all_tools
    sections = []
    for tool in get_all_tools():
        if tool.get("builtin"):
            sections.append(
                f"### Tool: {tool.get('display_name', tool['name'])} ({tool['id']}) [built-in]\n"
                f"Description: {tool.get('description','')}"
            )
        else:
            tid = tool["id"]
            p   = TOOLS_DIR / tid / "TOOL.md"
            if p.exists():
                sections.append(f"### Tool: {tool.get('display_name', tool['name'])} ({tid}) [custom]\n{p.read_text(encoding='utf-8')}")
    return "\n\n".join(sections)


def _read_best_practices() -> str:
    if BEST_PRACTICES_PATH.exists():
        return BEST_PRACTICES_PATH.read_text(encoding="utf-8")
    return ""


# ─────────────────────────────────────────────────────────────────────────
# LLM call
# ─────────────────────────────────────────────────────────────────────────

def _call_llm(prompt: str) -> str:
    """Call Ollama with the given prompt and return the response text."""
    from model_config import get_active_model
    try:
        import requests as req
        model   = _config.get("model_override") or get_active_model()
        payload = {
            "model":  model,
            "prompt": prompt,
            "stream": False,
            # temperature 0.55 — enough variety to generate fresh insights
            # on each run without going off-rails
            "options": {"num_predict": 1200, "temperature": 0.55},
        }
        resp = req.post(
            "http://localhost:11434/api/generate",
            json=payload, timeout=120,
        )
        if resp.status_code == 200:
            return resp.json().get("response", "").strip()
        return f"[LLM error: HTTP {resp.status_code}]"
    except Exception as e:
        return f"[LLM call failed: {e}]"


# ─────────────────────────────────────────────────────────────────────────
# Core improvement logic
# ─────────────────────────────────────────────────────────────────────────

def _run_improvement_cycle(run_context: Optional[dict] = None) -> dict:
    """
    Execute one full improvement cycle.

    run_context: the specific job event that triggered this cycle
                 (None when called from the scheduler).
    Returns a summary dict.
    """
    ts      = datetime.now().strftime("%Y-%m-%d %H:%M")
    trigger = "scheduled"
    run_ctx_str = ""

    if run_context:
        trigger = "per-run"
        job_id  = run_context.get("job_id", "unknown")
        topic   = run_context.get("topic", "unknown")[:80]
        status  = run_context.get("status", "unknown")
        model   = run_context.get("model", "unknown")
        duration = run_context.get("duration_secs", "?")
        run_ctx_str = (
            f"\n\nTRIGGERING JOB (the run that just completed):\n"
            f"  Job ID:   {job_id}\n"
            f"  Topic:    {topic}\n"
            f"  Status:   {status}\n"
            f"  Model:    {model}\n"
            f"  Duration: {duration}s\n"
            f"Focus your analysis on what this specific job reveals about system performance."
        )

    logger.info(f"Self-improvement cycle [{trigger}] starting at {ts}")
    results = {"ts": ts, "trigger": trigger, "changes": [], "proposals": [],
               "best_practices_updated": False}

    activity   = _read_recent_activity(_config.get("max_activity_entries", 50))
    agent_ctx  = _gather_agent_context()
    tool_ctx   = _gather_tool_context()
    best_prac  = _read_best_practices()

    # ── Step 1: Summarise recent activity ────────────────────────────────
    if activity:
        lines = []
        for ev in activity[-20:]:
            job_id   = ev.get("job_id", "?")
            topic    = ev.get("topic", "?")[:60]
            status   = ev.get("status", "?")
            model    = ev.get("model", "?")
            duration = ev.get("duration_secs", "?")
            lines.append(f"- Job {job_id}: {status} | '{topic}' | model={model} | {duration}s")
        activity_summary = "\n".join(lines)
    else:
        activity_summary = "No recent activity recorded yet."

    # ── Step 2: Best practices update ────────────────────────────────────
    bp_prompt = (
        f"You are a self-improvement AI for a multi-agent research platform.\n"
        f"Cycle type: {trigger.upper()} | Timestamp: {ts}"
        f"{run_ctx_str}\n\n"
        f"CURRENT BEST PRACTICES:\n{best_prac or 'None documented yet.'}\n\n"
        f"RECENT JOB ACTIVITY (last 20 jobs):\n{activity_summary}\n\n"
        f"ACTIVE AGENTS:\n{agent_ctx[:2000]}\n\n"
        f"ACTIVE TOOLS:\n{tool_ctx[:1500]}\n\n"
        f"Your task:\n"
        f"1. Review the triggering job and recent activity for NEW patterns not yet in best practices.\n"
        f"2. Identify 2-4 SPECIFIC, ACTIONABLE best practices based on what you observe RIGHT NOW.\n"
        f"3. Do NOT repeat existing best practices verbatim — evolve or extend them.\n"
        f"4. Note model performance patterns relevant to the task types seen.\n\n"
        f"Output a BEST PRACTICES document in Markdown. Start with:\n"
        f"# Best Practices — Multi-Agent Orchestration\n"
        f"## Last updated: {ts} ({trigger} cycle)\n\n"
        f"Write numbered best practice sections. Be specific. Max 800 words."
    )

    bp_response = _call_llm(bp_prompt)
    if bp_response and not bp_response.startswith("[LLM"):
        BEST_PRACTICES_PATH.write_text(bp_response, encoding="utf-8")
        results["best_practices_updated"] = True
        logger.info("BEST_PRACTICES.md updated.")

    # ── Step 3: Agent improvement suggestions ────────────────────────────
    agent_prompt = (
        f"You are reviewing AI agent definitions for a multi-agent research system.\n"
        f"Cycle triggered by: {trigger.upper()} at {ts}"
        f"{run_ctx_str}\n\n"
        f"AGENTS:\n{agent_ctx[:3000]}\n\n"
        f"RECENT JOB ACTIVITY:\n{activity_summary}\n\n"
        f"For each agent, evaluate:\n"
        f"- Is the goal specific enough for the task type just seen?\n"
        f"- Does the backstory motivate behaviour needed for this topic domain?\n"
        f"- Are tool assignments appropriate?\n\n"
        f"Output a JSON array of improvement suggestions:\n"
        f'[{{\n'
        f'  "agent_id": "researcher",\n'
        f'  "field": "goal",\n'
        f'  "current": "current text snippet",\n'
        f'  "suggested": "improved text",\n'
        f'  "reason": "why this is better given the recent run",\n'
        f'  "confidence": 0.0,\n'
        f'  "safe_to_auto_apply": true\n'
        f'}}]\n\n'
        f"Only include HIGH-CONFIDENCE (>0.8) improvements. Output ONLY the JSON array."
    )

    agent_response   = _call_llm(agent_prompt)
    agent_suggestions = _parse_json_response(agent_response)
    if isinstance(agent_suggestions, list):
        min_conf = _config.get("min_confidence", 0.7)
        for sug in agent_suggestions:
            if not isinstance(sug, dict):
                continue
            aid    = sug.get("agent_id", "")
            field  = sug.get("field", "")
            val    = sug.get("suggested", "")
            conf   = float(sug.get("confidence", 0))
            safe   = sug.get("safe_to_auto_apply", False)
            reason = sug.get("reason", "")

            if conf < min_conf or not aid or not field or not val:
                continue

            if safe and _config.get("auto_apply_safe") and field in ("goal", "backstory", "description"):
                from agent_registry import update_agent, get_agent
                a = get_agent(aid)
                if a:
                    update_agent(aid, {field: val})
                    results["changes"].append(
                        f"Agent '{aid}' {field} updated (conf={conf:.0%}) [{trigger}]: {reason}"
                    )
                    logger.info(f"Auto-applied agent improvement: {aid}.{field}")
            else:
                results["proposals"].append(
                    f"AGENT {aid}.{field} (conf={conf:.0%}) [{trigger}]: {reason}\n"
                    f"  Suggested: {val[:200]}"
                )

    # ── Step 4: Tool description improvements ────────────────────────────
    tool_prompt = (
        f"You are reviewing tool descriptions for AI agents.\n"
        f"Cycle triggered by: {trigger.upper()} at {ts}"
        f"{run_ctx_str}\n\n"
        f"TOOLS (custom only — built-ins shown for context):\n{tool_ctx[:2000]}\n\n"
        f"For each CUSTOM tool, evaluate if the description tells an LLM:\n"
        f"- What the tool does\n"
        f"- What input format it expects\n"
        f"- What it returns\n\n"
        f"Output a JSON array:\n"
        f'[{{\n'
        f'  "tool_id": "my_tool",\n'
        f'  "current_description": "current text",\n'
        f'  "suggested_description": "improved text",\n'
        f'  "confidence": 0.0\n'
        f'}}]\n\n'
        f"Only include tools where improvement is CLEAR (confidence > 0.85). Output ONLY JSON."
    )

    tool_response    = _call_llm(tool_prompt)
    tool_suggestions = _parse_json_response(tool_response)
    if isinstance(tool_suggestions, list):
        for sug in tool_suggestions:
            if not isinstance(sug, dict):
                continue
            tid  = sug.get("tool_id", "")
            val  = sug.get("suggested_description", "")
            conf = float(sug.get("confidence", 0))
            if conf >= 0.85 and tid and val and _config.get("auto_apply_safe"):
                from tool_registry import update_tool, get_tool
                t = get_tool(tid)
                if t and not t.get("builtin"):
                    update_tool(tid, {"description": val})
                    results["changes"].append(
                        f"Tool '{tid}' description updated (conf={conf:.0%}) [{trigger}]"
                    )
                    logger.info(f"Auto-applied tool improvement: {tid}.description")

    # ── Step 5: Write proposals and log ──────────────────────────────────
    if results["proposals"]:
        existing  = PROPOSALS_PATH.read_text(encoding="utf-8") if PROPOSALS_PATH.exists() else ""
        new_block = f"\n## Proposals — {ts} [{trigger}]\n\n" + "\n\n".join(results["proposals"]) + "\n"
        PROPOSALS_PATH.write_text(existing + new_block, encoding="utf-8")

    run_tag = f"[{trigger}]"
    if run_context:
        run_tag += f" triggered by job '{run_context.get('job_id','?')}' ({run_context.get('topic','')[:40]})"

    log_entry = (
        f"\n## Cycle: {ts} {run_tag}\n"
        f"- Best practices updated: {results['best_practices_updated']}\n"
        f"- Auto-applied changes:   {len(results['changes'])}\n"
        f"- Proposals written:      {len(results['proposals'])}\n"
    )
    if results["changes"]:
        log_entry += "\n### Changes applied:\n" + "\n".join(f"- {c}" for c in results["changes"]) + "\n"

    with open(IMPROVEMENT_LOG, "a", encoding="utf-8") as f:
        f.write(log_entry)

    logger.info(f"Cycle [{trigger}] complete: {len(results['changes'])} changes, {len(results['proposals'])} proposals.")
    return results


def _parse_json_response(text: str) -> list:
    """Extract and parse a JSON array from LLM response."""
    if not text or text.startswith("[LLM"):
        return []
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        return []
    try:
        return json.loads(m.group(0))
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────
# Broadcast + Telegram helpers
# ─────────────────────────────────────────────────────────────────────────

def _broadcast_results(results: dict) -> None:
    try:
        import main as _main
        trigger = results.get("trigger", "scheduled")
        _main.sync_broadcast({
            "type":    "agent_activity",
            "agent":   "system",
            "label":   "🔄 Self-Improver",
            "message": (
                f"🔄 [{trigger}] Improvement cycle complete. "
                f"Changes: {len(results['changes'])} | "
                f"Proposals: {len(results['proposals'])} | "
                f"Best practices: {'updated' if results['best_practices_updated'] else 'unchanged'}"
            ),
            "ts": time.time(),
        })
    except Exception:
        pass


def _notify_telegram(results: dict) -> None:
    try:
        from telegram_bot import notify_message
        trigger = results.get("trigger", "scheduled")
        summary = (
            f"🔄 Self-improvement cycle [{trigger}]\n"
            f"Changes applied: {len(results['changes'])}\n"
            f"Proposals: {len(results['proposals'])}\n"
            f"Best practices: {'updated' if results['best_practices_updated'] else 'unchanged'}\n"
        )
        if results["changes"]:
            summary += "\nChanges:\n" + "\n".join(f"• {c}" for c in results["changes"][:5])
        notify_message(summary)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────
# Background scheduler
# ─────────────────────────────────────────────────────────────────────────

def _scheduler_loop() -> None:
    cfg           = load_config()
    interval_secs = int(cfg.get("interval_hours", 6)) * 3600
    last_run      = 0.0

    logger.info(f"Self-improver scheduler active (interval: {cfg.get('interval_hours')}h)")

    while True:
        now = time.time()
        if now - last_run >= interval_secs:
            if _lock.acquire(blocking=False):
                try:
                    results  = _run_improvement_cycle()   # no run_context = scheduled
                    last_run = time.time()
                    _broadcast_results(results)
                    cfg = load_config()
                    if cfg.get("notify_telegram"):
                        _notify_telegram(results)
                except Exception as e:
                    logger.error(f"Scheduled improvement cycle failed: {e}", exc_info=True)
                finally:
                    _lock.release()
            # reload interval from config in case it changed
            cfg           = load_config()
            interval_secs = int(cfg.get("interval_hours", 6)) * 3600
        time.sleep(60)


def start(interval_hours: Optional[int] = None) -> bool:
    global _thread
    cfg = load_config()
    if not cfg.get("enabled", True):
        logger.info("Self-improver disabled in config.")
        return False
    if interval_hours:
        cfg["interval_hours"] = interval_hours
        save_config(cfg)
    if _thread is None or not _thread.is_alive():
        _thread = threading.Thread(target=_scheduler_loop, daemon=True, name="self-improver")
        _thread.start()
    return True


def stop() -> None:
    # Scheduler thread is daemon — it will stop when the process exits.
    # Setting enabled=False in config prevents new cycles from starting.
    cfg = load_config()
    cfg["enabled"] = False
    save_config(cfg)


def run_now() -> dict:
    """Trigger an immediate improvement cycle (blocking). Returns results."""
    load_config()
    return _run_improvement_cycle()


# ─────────────────────────────────────────────────────────────────────────
# Public API — manual trigger (non-blocking)
# ─────────────────────────────────────────────────────────────────────────

def trigger_improvement_cycle() -> None:
    """
    Manually trigger one improvement cycle in a background thread.
    Called by POST /self-improver/run-now from main.py.
    Uses a threading.Lock so concurrent calls are safely skipped
    instead of being silently dropped forever.
    """
    def _run():
        if not _lock.acquire(blocking=False):
            logger.info("Self-improver busy — manual trigger skipped.")
            return
        try:
            results = _run_improvement_cycle()
            _broadcast_results(results)
            cfg = _config or load_config()
            if cfg.get("notify_telegram"):
                _notify_telegram(results)
            logger.info(f"Manual improvement cycle complete: {results}")
        except Exception as e:
            logger.exception(f"Self-improver cycle failed: {e}")
        finally:
            _lock.release()

    t = threading.Thread(target=_run, daemon=True, name="self-improver-manual")
    t.start()


def start_scheduler() -> None:
    """
    Start the background scheduler thread.
    Call once from main.py startup.
    """
    global _thread
    if _thread is None or not _thread.is_alive():
        _thread = threading.Thread(target=_scheduler_loop, daemon=True, name="self-improver-scheduler")
        _thread.start()
        logger.info("Self-improver scheduler started.")


# ─────────────────────────────────────────────────────────────────────────
# Init
# ─────────────────────────────────────────────────────────────────────────

def _init_best_practices() -> None:
    if not BEST_PRACTICES_PATH.exists():
        BEST_PRACTICES_PATH.write_text(
            "# Best Practices — Multi-Agent Orchestration\n\n"
            "> Auto-maintained by the self-improvement service. "
            "Updated after each improvement cycle.\n\n"
            "## Getting Started\n\n"
            "1. Use `llama3.2:3b` or larger for complex multi-step research tasks.\n"
            "2. `phi3:mini` works well for quick queries and simple summaries.\n"
            "3. Keep research topics specific — broad topics produce weaker reports.\n"
            "4. Custom agents added to the pipeline run after the Writer and receive "
            "the full report as context.\n"
            "5. Filesystem access must be explicitly granted before agents can read files.\n",
            encoding="utf-8",
        )

# Run init when module is imported
_init_best_practices()
load_config()
