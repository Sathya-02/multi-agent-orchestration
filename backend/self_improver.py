"""
self_improver.py — Autonomous System Self-Improvement

Runs as a background service. On a configurable schedule it:

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
    "interval_hours":       6,          # run every N hours
    "max_activity_entries": 50,         # how many recent log lines to analyse
    "auto_apply_safe":      True,       # auto-apply description-only changes
    "notify_telegram":      True,       # send Telegram notification on completion
    "model_override":       "",         # use a specific model (empty = use active)
    "min_confidence":       0.7,        # only apply suggestions above this threshold
}

_config: dict    = {}
_running: bool   = False
_thread: Optional[threading.Thread] = None


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
    """Append a job event to the rolling activity log."""
    try:
        with open(ACTIVITY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
        # Trim to last 500 lines
        lines = ACTIVITY_LOG_PATH.read_text(encoding="utf-8").splitlines()
        if len(lines) > 500:
            ACTIVITY_LOG_PATH.write_text("\n".join(lines[-500:]) + "\n", encoding="utf-8")
    except Exception as e:
        logger.warning(f"Activity log write failed: {e}")


def _read_recent_activity(n: int = 50) -> list[dict]:
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
    from model_config import get_active_model, get_llm_config
    try:
        import requests as req
        model   = _config.get("model_override") or get_active_model()
        payload = {
            "model":  model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": 1200, "temperature": 0.3},
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

def _run_improvement_cycle() -> dict:
    """
    Execute one full improvement cycle. Returns a summary dict.
    """
    ts        = datetime.now().strftime("%Y-%m-%d %H:%M")
    logger.info(f"Self-improvement cycle starting at {ts}")
    results   = {"ts": ts, "changes": [], "proposals": [], "best_practices_updated": False}

    activity   = _read_recent_activity(_config.get("max_activity_entries", 50))
    agent_ctx  = _gather_agent_context()
    tool_ctx   = _gather_tool_context()
    best_prac  = _read_best_practices()

    # ── Step 1: Analyse recent activity for patterns ─────────────────────
    activity_summary = ""
    if activity:
        lines = []
        for ev in activity[-20:]:
            job_id = ev.get("job_id","?")
            topic  = ev.get("topic","?")[:60]
            status = ev.get("status","?")
            model  = ev.get("model","?")
            lines.append(f"- Job {job_id}: {status} | '{topic}' | model={model}")
        activity_summary = "\n".join(lines)
    else:
        activity_summary = "No recent activity recorded yet."

    # ── Step 2: Ask LLM for best practices update ─────────────────────────
    bp_prompt = f"""You are a system self-improvement AI for a multi-agent research platform.

CURRENT BEST PRACTICES:
{best_prac or 'None documented yet.'}

RECENT JOB ACTIVITY (last 20 jobs):
{activity_summary}

ACTIVE AGENTS:
{agent_ctx[:2000]}

ACTIVE TOOLS:
{tool_ctx[:1500]}

Your task:
1. Review the recent activity for patterns (failures, slow completions, topic types that worked well).
2. Identify 2-4 concrete best practices for this system based on what you observe.
3. Note any patterns about which models perform better for which task types.
4. Suggest any improvements to agent goals or tool descriptions.

Output a BEST PRACTICES document in Markdown. Start with:
# Best Practices — Multi-Agent Orchestration
## Last updated: {ts}

Then write numbered best practice sections. Be specific and actionable.
Keep total output under 800 words."""

    bp_response = _call_llm(bp_prompt)

    if bp_response and not bp_response.startswith("[LLM"):
        BEST_PRACTICES_PATH.write_text(bp_response, encoding="utf-8")
        results["best_practices_updated"] = True
        logger.info("BEST_PRACTICES.md updated.")

    # ── Step 3: Agent improvement suggestions ────────────────────────────
    agent_prompt = f"""You are reviewing AI agent definitions for a multi-agent research system.

AGENTS:
{agent_ctx[:3000]}

RECENT JOB ACTIVITY:
{activity_summary}

For each agent, evaluate:
- Is the goal clear and specific enough?
- Is the backstory motivating the right behaviour?
- Are the tool assignments appropriate?

Output a JSON array of improvement suggestions. Each suggestion:
{{
  "agent_id": "researcher",
  "field": "goal",
  "current": "current text snippet",
  "suggested": "improved text",
  "reason": "why this is better",
  "confidence": 0.0-1.0,
  "safe_to_auto_apply": true/false
}}

Only include agents where you have a HIGH-CONFIDENCE (>0.8) improvement.
Output ONLY the JSON array, no other text."""

    agent_response = _call_llm(agent_prompt)
    agent_suggestions = _parse_json_response(agent_response)
    if isinstance(agent_suggestions, list):
        min_conf = _config.get("min_confidence", 0.7)
        for sug in agent_suggestions:
            if not isinstance(sug, dict):
                continue
            aid     = sug.get("agent_id","")
            field   = sug.get("field","")
            val     = sug.get("suggested","")
            conf    = float(sug.get("confidence", 0))
            safe    = sug.get("safe_to_auto_apply", False)
            reason  = sug.get("reason","")

            if conf < min_conf or not aid or not field or not val:
                continue

            if safe and _config.get("auto_apply_safe") and field in ("goal","backstory","description"):
                from agent_registry import update_agent, get_agent
                a = get_agent(aid)
                if a:
                    update_agent(aid, {field: val})
                    results["changes"].append(
                        f"Agent '{aid}' {field} updated (confidence={conf:.0%}): {reason}"
                    )
                    logger.info(f"Auto-applied agent improvement: {aid}.{field}")
            else:
                results["proposals"].append(
                    f"AGENT {aid}.{field} (confidence={conf:.0%}): {reason}\n"
                    f"  Suggested: {val[:200]}"
                )

    # ── Step 4: Tool description improvements ────────────────────────────
    tool_prompt = f"""You are reviewing tool descriptions for AI agents.

TOOLS (custom only — built-ins shown for context):
{tool_ctx[:2000]}

For each CUSTOM tool, evaluate if the description clearly tells an LLM:
- What the tool does
- What input format it expects
- What it returns

Output a JSON array:
[{{
  "tool_id": "my_tool",
  "current_description": "current text",
  "suggested_description": "improved text",
  "confidence": 0.0-1.0
}}]

Only include tools where improvement is CLEAR (confidence > 0.85).
Output ONLY the JSON array."""

    tool_response = _call_llm(tool_prompt)
    tool_suggestions = _parse_json_response(tool_response)
    if isinstance(tool_suggestions, list):
        for sug in tool_suggestions:
            if not isinstance(sug, dict):
                continue
            tid  = sug.get("tool_id","")
            val  = sug.get("suggested_description","")
            conf = float(sug.get("confidence", 0))
            if conf >= 0.85 and tid and val and _config.get("auto_apply_safe"):
                from tool_registry import update_tool, get_tool
                t = get_tool(tid)
                if t and not t.get("builtin"):
                    update_tool(tid, {"description": val})
                    results["changes"].append(
                        f"Tool '{tid}' description updated (confidence={conf:.0%})"
                    )
                    logger.info(f"Auto-applied tool improvement: {tid}.description")

    # ── Step 5: Write proposals and log ──────────────────────────────────
    if results["proposals"]:
        existing = PROPOSALS_PATH.read_text(encoding="utf-8") if PROPOSALS_PATH.exists() else ""
        new_block = f"\n## Proposals — {ts}\n\n" + "\n\n".join(results["proposals"]) + "\n"
        PROPOSALS_PATH.write_text(existing + new_block, encoding="utf-8")

    log_entry = (
        f"\n## Cycle: {ts}\n"
        f"- Best practices updated: {results['best_practices_updated']}\n"
        f"- Auto-applied changes: {len(results['changes'])}\n"
        f"- Proposals written: {len(results['proposals'])}\n"
    )
    if results["changes"]:
        log_entry += "\n### Changes applied:\n" + "\n".join(f"- {c}" for c in results["changes"]) + "\n"

    with open(IMPROVEMENT_LOG, "a", encoding="utf-8") as f:
        f.write(log_entry)

    logger.info(f"Cycle complete: {len(results['changes'])} changes, {len(results['proposals'])} proposals.")
    return results


def _parse_json_response(text: str) -> list:
    """Extract and parse a JSON array from LLM response."""
    if not text or text.startswith("[LLM"):
        return []
    # Find JSON array
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        return []
    try:
        return json.loads(m.group(0))
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────
# Background scheduler
# ─────────────────────────────────────────────────────────────────────────

def _scheduler_loop() -> None:
    global _running
    cfg             = load_config()
    interval_secs   = int(cfg.get("interval_hours", 6)) * 3600
    last_run        = 0.0

    logger.info(f"Self-improver scheduler active (interval: {cfg.get('interval_hours')}h)")

    while _running:
        now = time.time()
        if now - last_run >= interval_secs:
            try:
                results = _run_improvement_cycle()
                last_run = time.time()
                # Broadcast via WebSocket
                try:
                    import main as _main
                    changes_str = "; ".join(results["changes"][:3]) if results["changes"] else "none"
                    _main.sync_broadcast({
                        "type":    "agent_activity",
                        "agent":   "system",
                        "label":   "🔄 Self-Improver",
                        "message": (
                            f"🔄 Improvement cycle complete. "
                            f"Changes: {len(results['changes'])} | "
                            f"Proposals: {len(results['proposals'])} | "
                            f"Best practices updated: {results['best_practices_updated']}"
                        ),
                        "ts": time.time(),
                    })
                except Exception:
                    pass
                # Telegram notification
                if cfg.get("notify_telegram"):
                    try:
                        from telegram_bot import notify_message
                        summary = (
                            f"🔄 Self-improvement cycle complete\n"
                            f"Changes applied: {len(results['changes'])}\n"
                            f"Proposals: {len(results['proposals'])}\n"
                            f"Best practices: {'updated' if results['best_practices_updated'] else 'unchanged'}\n"
                        )
                        if results["changes"]:
                            summary += "\nChanges:\n" + "\n".join(f"• {c}" for c in results["changes"][:5])
                        notify_message(summary)
                    except Exception:
                        pass
            except Exception as e:
                logger.error(f"Self-improvement cycle failed: {e}", exc_info=True)
        time.sleep(60)   # check every minute


def start(interval_hours: Optional[int] = None) -> bool:
    global _running, _thread
    cfg = load_config()
    if not cfg.get("enabled", True):
        logger.info("Self-improver disabled in config.")
        return False
    if interval_hours:
        cfg["interval_hours"] = interval_hours
        save_config(cfg)
    _running = True
    _thread  = threading.Thread(target=_scheduler_loop, daemon=True, name="self-improver")
    _thread.start()
    return True


def stop() -> None:
    global _running
    _running = False


def run_now() -> dict:
    """Trigger an immediate improvement cycle (blocking). Returns results."""
    load_config()
    return _run_improvement_cycle()


# ─────────────────────────────────────────────────────────────────────────
# Init: write default BEST_PRACTICES.md if it doesn't exist
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

# ─────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────

def trigger_improvement_cycle() -> None:
    """
    Manually trigger one improvement cycle in a background thread.
    Called by POST /self-improver/run-now from main.py.
    """
    global _running
    if _running:
        logger.info("Self-improver already running — skipping trigger.")
        return

    def _run():
        global _running
        _running = True
        try:
            results = _run_improvement_cycle()
            logger.info(f"Manual improvement cycle complete: {results}")
        except Exception as e:
            logger.exception(f"Self-improver cycle failed: {e}")
        finally:
            _running = False

    t = threading.Thread(target=_run, daemon=True, name="self-improver-manual")
    t.start()


def start_scheduler() -> None:
    """
    Start the background scheduler thread that runs the improvement
    cycle every `interval_hours` hours. Call once from main.py startup.
    """
    global _thread

    def _loop():
        global _running
        while True:
            cfg = load_config()
            if not cfg.get("enabled", True):
                time.sleep(300)
                continue
            interval = int(cfg.get("interval_hours", 6)) * 3600
            time.sleep(interval)
            if _running:
                continue
            _running = True
            try:
                results = _run_improvement_cycle()
                logger.info(f"Scheduled improvement cycle complete: {results}")
            except Exception as e:
                logger.exception(f"Scheduled self-improver cycle failed: {e}")
            finally:
                _running = False

    if _thread is None or not _thread.is_alive():
        _thread = threading.Thread(target=_loop, daemon=True, name="self-improver-scheduler")
        _thread.start()
        logger.info("Self-improver scheduler started.")

# Run init when module is imported
_init_best_practices()
load_config()
