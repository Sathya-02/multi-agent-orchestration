"""
self_improver.py — Autonomous Agent Evolution with Human-in-the-Loop

Evolution pipeline:
  1. SCHEDULED or PER-RUN trigger fires after each job
  2. For every agent, the LLM evaluates:
       - SKILLS.md content vs recent job performance
       - Past evolution lineage (what changed before, did it help?)
  3. Confidence routing:
       >= 0.88 + safe_to_auto_apply  → patch SKILLS.md immediately
       0.70 – 0.87                  → queue as structured proposal
       < 0.70                        → silently discard
  4. Human reviews proposals in the UI:
       Approve → SKILLS.md patched live + WebSocket broadcast
       Reject  → logged with reason, agent remembers it
  5. All changes written to evolution_history.json
     (fed back as lineage context on the NEXT cycle)

The service never deletes — only appends / rewrites text fields.
All changes logged in IMPROVEMENT_LOG.md.
"""
import hashlib, json, logging, re, threading, time
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger("self_improver")

BASE_DIR              = Path(__file__).parent
BEST_PRACTICES_PATH   = BASE_DIR / "BEST_PRACTICES.md"
PROPOSALS_PATH        = BASE_DIR / "IMPROVEMENT_PROPOSALS.md"  # legacy flat file kept
PROPOSALS_JSON        = BASE_DIR / "proposals_pending.json"     # new structured store
EVOLUTION_HISTORY     = BASE_DIR / "evolution_history.json"     # per-agent lineage
IMPROVEMENT_LOG       = BASE_DIR / "IMPROVEMENT_LOG.md"
ACTIVITY_LOG_PATH     = BASE_DIR / "activity_log.jsonl"
CONFIG_PATH           = BASE_DIR / "self_improver_config.json"

_DEFAULT_CONFIG = {
    "enabled":              True,
    "interval_hours":       6,
    "run_trigger":          True,
    "run_trigger_debounce": 300,
    "max_activity_entries": 50,
    "auto_apply_safe":      True,
    "notify_telegram":      True,
    "model_override":       "",
    "min_confidence":       0.70,
    "auto_apply_threshold": 0.88,   # >= this → auto-patch without human review
}

_config: dict    = {}
_lock            = threading.Lock()
_thread: Optional[threading.Thread] = None
_last_cycle_ts: float = 0.0
_broadcast_fn:  Optional[Callable] = None   # injected from main.py


# ─────────────────────────────────────────────────────────────────────────
# Broadcast injection
# ─────────────────────────────────────────────────────────────────────────

def set_broadcast_fn(fn: Callable) -> None:
    global _broadcast_fn
    _broadcast_fn = fn


def _broadcast(msg: dict) -> None:
    if _broadcast_fn:
        try:
            _broadcast_fn(msg)
        except Exception:
            pass
    else:
        # fallback via main.sync_broadcast
        try:
            import main as _main
            _main.sync_broadcast(msg)
        except Exception:
            pass


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
# Structured Proposal Store
# ─────────────────────────────────────────────────────────────────────────

def _load_proposals() -> list:
    if PROPOSALS_JSON.exists():
        try:
            return json.loads(PROPOSALS_JSON.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _save_proposals(proposals: list) -> None:
    PROPOSALS_JSON.write_text(json.dumps(proposals, indent=2, ensure_ascii=False), encoding="utf-8")


def get_pending_proposals() -> list:
    """Return proposals awaiting human decision (status='pending')."""
    return [p for p in _load_proposals() if p.get("status") == "pending"]


def get_all_proposals() -> list:
    return _load_proposals()


def _queue_proposal(
    agent_id: str,
    agent_label: str,
    patches: dict,
    reason: str,
    confidence: float,
    trigger: str,
    job_context: Optional[dict] = None,
    current_skills_snapshot: str = "",
) -> str:
    """Add a proposal to the pending store. Returns proposal_id."""
    proposals = _load_proposals()
    pid = hashlib.md5(
        f"{agent_id}{json.dumps(patches, sort_keys=True)}{time.time()}".encode()
    ).hexdigest()[:8]
    proposals.append({
        "id":                     pid,
        "created_at":             datetime.now().isoformat(),
        "agent_id":               agent_id,
        "agent_label":            agent_label,
        "patches":                patches,
        "reason":                 reason,
        "confidence":             round(confidence, 3),
        "trigger":                trigger,
        "job_context":            job_context or {},
        "current_skills_snapshot": current_skills_snapshot,
        "status":                 "pending",
    })
    _save_proposals(proposals)
    logger.info(f"Proposal queued: {pid} for agent {agent_id} ({list(patches.keys())})")
    _broadcast({"type": "si_proposal_queued", "proposal_id": pid, "agent_id": agent_id})
    return pid


# ─────────────────────────────────────────────────────────────────────────
# Evolution History (lineage)
# ─────────────────────────────────────────────────────────────────────────

def _append_history(entry: dict) -> None:
    history = []
    if EVOLUTION_HISTORY.exists():
        try:
            history = json.loads(EVOLUTION_HISTORY.read_text(encoding="utf-8"))
        except Exception:
            history = []
    history.append(entry)
    if len(history) > 500:
        history = history[-500:]
    EVOLUTION_HISTORY.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")


def get_evolution_history(agent_id: Optional[str] = None) -> list:
    if not EVOLUTION_HISTORY.exists():
        return []
    try:
        history = json.loads(EVOLUTION_HISTORY.read_text(encoding="utf-8"))
    except Exception:
        return []
    if agent_id:
        return [h for h in history if h.get("agent_id") == agent_id]
    return history


def _gather_evolution_context(agent_id: str) -> str:
    """Last 5 changes for this agent — fed back into LLM prompt as lineage."""
    entries = get_evolution_history(agent_id)[-5:]
    if not entries:
        return "No previous evolution history."
    lines = []
    for e in entries:
        ts    = e.get("applied_at", "?")[:16]
        src   = e.get("source", "?")     # "auto_applied" | "human_approved"
        flds  = ", ".join(e.get("fields_changed", []))
        rsn   = e.get("reason", "")[:120]
        lines.append(f"- [{ts}] {src}: changed [{flds}] — {rsn}")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────
# SKILLS.md Patch Engine
# ─────────────────────────────────────────────────────────────────────────

def _patch_skills_yaml(current_text: str, patches: dict) -> str:
    """
    Apply field patches to a SKILLS.md text.
    Handles: goal, backstory, role (multi-line YAML blocks),
             max_iter (scalar int), tools (YAML list).
    Appends a version stamp at the end.
    Preserves everything else unchanged.
    """
    result = current_text
    for field, new_value in patches.items():
        if field == "max_iter":
            result = re.sub(r"(max_iter\s*:\s*)\d+", f"\\g<1>{new_value}", result)

        elif field in ("goal", "backstory", "role"):
            block_pat = re.compile(
                rf"^([ \t]*{re.escape(field)}\s*:[>| ]?\s*\n)((?:[ \t]+.+\n?)*)",
                re.MULTILINE,
            )
            new_lines = "\n".join(f"  {ln}" for ln in str(new_value).strip().splitlines())
            if block_pat.search(result):
                result = block_pat.sub(f"\\g<1>{new_lines}\n", result, count=1)
            else:
                # field not present — inline replace or append
                inline_pat = re.compile(rf"^({re.escape(field)}\s*:\s*)(.+)$", re.MULTILINE)
                if inline_pat.search(result):
                    result = inline_pat.sub(f"\\g<1>{str(new_value).strip()}", result, count=1)
                else:
                    result = result.rstrip() + f"\n{field}: {str(new_value).strip()}\n"

        elif field == "tools" and isinstance(new_value, list):
            tools_block = "tools:\n" + "\n".join(f"  - {t}" for t in new_value) + "\n"
            tools_pat   = re.compile(r"^tools\s*:\s*\n((?:[ \t]+.+\n?)*)", re.MULTILINE)
            if tools_pat.search(result):
                result = tools_pat.sub(tools_block, result, count=1)
            else:
                result = result.rstrip() + f"\n{tools_block}"

        elif field == "description":
            inline_pat = re.compile(r"^(description\s*:\s*)(.+)$", re.MULTILINE)
            if inline_pat.search(result):
                result = inline_pat.sub(f"\\g<1>{str(new_value).strip()}", result, count=1)
            else:
                result = result.rstrip() + f"\ndescription: {str(new_value).strip()}\n"

    # version stamp
    ts     = datetime.now().strftime("%Y-%m-%d %H:%M")
    result = re.sub(r"\n# \[evolved .*?\]\n?", "", result)
    result = result.rstrip() + f"\n# [evolved {ts} by self-improver]\n"
    return result


def _apply_skills_patch(
    agent_id: str,
    patches: dict,
    reason: str,
    source: str = "auto_applied",
) -> bool:
    """
    Write patched SKILLS.md to disk and update agent_registry in memory.
    Returns True on success.
    """
    try:
        from agent_registry import AGENTS_DIR, get_agent, update_agent
        skills_path = AGENTS_DIR / agent_id / "SKILLS.md"
        if not skills_path.exists():
            logger.warning(f"SKILLS.md not found for {agent_id}")
            return False

        current = skills_path.read_text(encoding="utf-8")
        patched = _patch_skills_yaml(current, patches)
        skills_path.write_text(patched, encoding="utf-8")

        # Sync text fields back to agent_registry JSON
        updatable = {k: v for k, v in patches.items() if k in ("goal", "backstory", "role", "description")}
        if updatable:
            update_agent(agent_id, updatable)

        _append_history({
            "applied_at":     datetime.now().isoformat(),
            "agent_id":       agent_id,
            "fields_changed": list(patches.keys()),
            "reason":         reason,
            "source":         source,
            "patches_preview": {k: str(v)[:100] for k, v in patches.items()},
        })
        logger.info(f"SKILLS.md patched for {agent_id} ({list(patches.keys())}) [{source}]")
        return True
    except Exception as e:
        logger.exception(f"_apply_skills_patch failed for {agent_id}: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────
# Human-in-the-Loop: Approve / Reject
# ─────────────────────────────────────────────────────────────────────────

def approve_proposal(proposal_id: str) -> dict:
    """
    Human approves a proposal.
    Patches SKILLS.md immediately, updates history, broadcasts live.
    """
    proposals = _load_proposals()
    prop = next((p for p in proposals if p["id"] == proposal_id), None)
    if not prop:
        return {"error": f"Proposal {proposal_id} not found"}
    if prop.get("status") != "pending":
        return {"error": f"Proposal {proposal_id} already {prop.get('status')}"}

    ok = _apply_skills_patch(
        prop["agent_id"],
        prop["patches"],
        prop["reason"],
        source="human_approved",
    )

    prop["status"]      = "approved"
    prop["approved_at"] = datetime.now().isoformat()
    prop["apply_ok"]    = ok
    _save_proposals(proposals)

    if ok:
        _broadcast({"type": "agents_updated"})
        _broadcast({
            "type":        "si_proposal_applied",
            "proposal_id": proposal_id,
            "agent_id":    prop["agent_id"],
            "applied":     list(prop["patches"].keys()),
        })
        _broadcast({
            "type":    "agent_activity",
            "agent":   "system",
            "label":   "🧬 Evolution",
            "message": f"✅ Human approved evolution for {prop['agent_label']}: {', '.join(prop['patches'].keys())} updated in SKILLS.md",
            "ts":      time.time(),
        })

    return {"ok": ok, "applied": [f"{prop['agent_id']}: {list(prop['patches'].keys())}"]}


def reject_proposal(proposal_id: str, reason: str = "") -> dict:
    """Human rejects — logged, no SKILLS.md change."""
    proposals = _load_proposals()
    prop = next((p for p in proposals if p["id"] == proposal_id), None)
    if not prop:
        return {"error": f"Proposal {proposal_id} not found"}

    prop["status"]      = "rejected"
    prop["rejected_at"] = datetime.now().isoformat()
    prop["reject_reason"] = reason
    _save_proposals(proposals)

    # Log to history so future cycles don't re-suggest
    _append_history({
        "applied_at":     datetime.now().isoformat(),
        "agent_id":       prop["agent_id"],
        "fields_changed": list(prop["patches"].keys()),
        "reason":         f"REJECTED by human: {reason or 'no reason given'}",
        "source":         "human_rejected",
        "patches_preview": {k: str(v)[:100] for k, v in prop["patches"].items()},
    })

    logger.info(f"Proposal {proposal_id} rejected: {reason}")
    return {"ok": True, "rejected": proposal_id}


# ─────────────────────────────────────────────────────────────────────────
# Activity log writer
# ─────────────────────────────────────────────────────────────────────────

def log_activity(event: dict) -> None:
    global _last_cycle_ts
    try:
        with open(ACTIVITY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
        lines = ACTIVITY_LOG_PATH.read_text(encoding="utf-8").splitlines()
        if len(lines) > 500:
            ACTIVITY_LOG_PATH.write_text("\n".join(lines[-500:]) + "\n", encoding="utf-8")
    except Exception as e:
        logger.warning(f"Activity log write failed: {e}")

    cfg = _config or load_config()
    if not cfg.get("run_trigger", True) or not cfg.get("enabled", True):
        return
    debounce = int(cfg.get("run_trigger_debounce", 300))
    if time.time() - _last_cycle_ts < debounce:
        logger.debug("Self-improver debounce active — skipping per-run trigger")
        return

    def _run():
        global _last_cycle_ts
        if not _lock.acquire(blocking=False):
            logger.debug("Self-improver busy — skipping per-run trigger")
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

    threading.Thread(target=_run, daemon=True, name="si-per-run").start()


def _read_recent_activity(n: int = 50) -> list:
    if not ACTIVITY_LOG_PATH.exists():
        return []
    lines = ACTIVITY_LOG_PATH.read_text(encoding="utf-8").splitlines()
    out   = []
    for line in lines[-n:]:
        try: out.append(json.loads(line))
        except Exception: pass
    return out


# ─────────────────────────────────────────────────────────────────────────
# Context helpers
# ─────────────────────────────────────────────────────────────────────────

def _gather_best_practices() -> str:
    return BEST_PRACTICES_PATH.read_text(encoding="utf-8") if BEST_PRACTICES_PATH.exists() else ""


def _gather_tool_context() -> str:
    try:
        from tool_registry import TOOLS_DIR, get_all_tools
        parts = []
        for t in get_all_tools():
            if t.get("builtin"):
                parts.append(f"### Tool: {t.get('display_name', t['name'])} [built-in]\n{t.get('description','')}")
            else:
                p = TOOLS_DIR / t["id"] / "TOOL.md"
                if p.exists():
                    parts.append(f"### Tool: {t.get('display_name', t['name'])} [custom]\n{p.read_text(encoding='utf-8')}")
        return "\n\n".join(parts)
    except Exception as e:
        return f"[tool context unavailable: {e}]"


# ─────────────────────────────────────────────────────────────────────────
# LLM call
# ─────────────────────────────────────────────────────────────────────────

def _call_llm(prompt: str) -> str:
    from model_config import get_active_model
    try:
        import requests as req
        model   = _config.get("model_override") or get_active_model()
        payload = {
            "model":   model,
            "prompt":  prompt,
            "stream":  False,
            "options": {"num_predict": 1400, "temperature": 0.50},
        }
        resp = req.post("http://localhost:11434/api/generate", json=payload, timeout=120)
        if resp.status_code == 200:
            return resp.json().get("response", "").strip()
        return f"[LLM error: HTTP {resp.status_code}]"
    except Exception as e:
        return f"[LLM call failed: {e}]"


# ─────────────────────────────────────────────────────────────────────────
# Per-Agent Evolution
# ─────────────────────────────────────────────────────────────────────────

def _evolve_agent(
    agent: dict,
    activity_summary: str,
    trigger: str,
    run_context: Optional[dict] = None,
) -> dict:
    """
    Run LLM evolution analysis for ONE agent.
    Returns {"auto_applied": [...], "proposals": [...]}.
    """
    from agent_registry import AGENTS_DIR

    aid     = agent["id"]
    label   = agent.get("label") or agent.get("role", aid)
    sp      = AGENTS_DIR / aid / "SKILLS.md"
    current = sp.read_text(encoding="utf-8") if sp.exists() else "[No SKILLS.md]"
    lineage = _gather_evolution_context(aid)
    cfg     = _config or load_config()
    auto_threshold = float(cfg.get("auto_apply_threshold", 0.88))
    min_conf       = float(cfg.get("min_confidence", 0.70))

    job_ctx = ""
    if run_context:
        job_ctx = (
            f"\nTRIGGERING JOB:\n"
            f"  Job ID:   {run_context.get('job_id','?')}\n"
            f"  Topic:    {run_context.get('topic','?')[:80]}\n"
            f"  Status:   {run_context.get('status','?')}\n"
            f"  Duration: {run_context.get('duration_secs','?')}s\n"
        )

    prompt = f"""You are an AI agent evolution engine. Improve agent SKILLS.md files based on real job performance.

AGENT: {label} (id={aid})

CURRENT SKILLS.md:
{current}

RECENT JOB PERFORMANCE (last 20 jobs):
{activity_summary}
{job_ctx}
EVOLUTION LINEAGE (previous changes — avoid repeating failed attempts):
{lineage}

Analyse:
1. Does the goal match the task type and domain seen in recent jobs?
2. Does the backstory give the agent the right motivation for these tasks?
3. Is max_iter appropriate for the job duration observed?
4. Are there patterns of failure or slow performance this agent caused?

Output ONLY this JSON (no markdown, no explanation):
{{"patches": {{"goal": "new text"}}, "reason": "evidence-based reason", "confidence": 0.0, "safe_to_auto_apply": true}}

Rules:
- Only include fields that genuinely need changing in "patches"
- confidence: 0.0–1.0 (be conservative — 0.88+ only for clear improvements)
- safe_to_auto_apply: true only for goal/backstory/max_iter changes with confidence >= 0.88
- If nothing needs changing: {{"patches": {{}}, "confidence": 0, "reason": "no change needed"}}
Output ONLY JSON."""

    raw = _call_llm(prompt)
    if not raw or raw.startswith("[LLM"):
        return {"auto_applied": [], "proposals": []}

    # extract JSON
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        return {"auto_applied": [], "proposals": []}
    try:
        data = json.loads(m.group(0))
    except Exception:
        return {"auto_applied": [], "proposals": []}

    patches    = data.get("patches", {})
    reason     = data.get("reason", "")
    confidence = float(data.get("confidence", 0))
    safe       = data.get("safe_to_auto_apply", False)
    result     = {"auto_applied": [], "proposals": []}

    if not patches or confidence < min_conf:
        return result

    if safe and cfg.get("auto_apply_safe") and confidence >= auto_threshold:
        ok = _apply_skills_patch(aid, patches, reason, source="auto_applied")
        if ok:
            result["auto_applied"].append(
                f"{label}: {list(patches.keys())} updated (conf={confidence:.0%})"
            )
            _broadcast({
                "type":    "agent_activity",
                "agent":   "system",
                "label":   "🧬 Evolution",
                "message": f"🤖 Auto-evolved {label}: {list(patches.keys())} updated (conf={confidence:.0%}) — {reason[:80]}",
                "ts":      time.time(),
            })
    else:
        # Queue for human review
        _queue_proposal(
            agent_id=aid,
            agent_label=label,
            patches=patches,
            reason=reason,
            confidence=confidence,
            trigger=trigger,
            job_context=run_context,
            current_skills_snapshot=current,
        )
        result["proposals"].append(f"{label}: {list(patches.keys())} (conf={confidence:.0%}) queued")

    return result


# ─────────────────────────────────────────────────────────────────────────
# Core improvement cycle
# ─────────────────────────────────────────────────────────────────────────

def _run_improvement_cycle(run_context: Optional[dict] = None) -> dict:
    ts      = datetime.now().strftime("%Y-%m-%d %H:%M")
    trigger = "per-run" if run_context else "scheduled"
    logger.info(f"Evolution cycle [{trigger}] starting at {ts}")

    results = {"ts": ts, "trigger": trigger,
               "changes": [], "proposals": [],
               "best_practices_updated": False}

    activity = _read_recent_activity(_config.get("max_activity_entries", 50))

    # ── Activity summary ────────────────────────────────────────────────
    if activity:
        lines = []
        for ev in activity[-20:]:
            lines.append(
                f"- Job {ev.get('job_id','?')}: {ev.get('status','?')} | "
                f"'{ev.get('topic','?')[:60]}' | model={ev.get('model','?')} | {ev.get('duration_secs','?')}s"
            )
        activity_summary = "\n".join(lines)
    else:
        activity_summary = "No recent activity recorded yet."

    # ── Best practices update ───────────────────────────────────────────
    best_prac  = _gather_best_practices()
    tool_ctx   = _gather_tool_context()
    run_ctx_str = ""
    if run_context:
        run_ctx_str = (
            f"\nTRIGGERING JOB: {run_context.get('job_id','?')} | "
            f"'{run_context.get('topic','?')[:60]}' | {run_context.get('status','?')}"
        )

    bp_prompt = (
        f"You are a self-improvement AI for a multi-agent research platform.\n"
        f"Cycle: {trigger.upper()} | {ts}{run_ctx_str}\n\n"
        f"CURRENT BEST PRACTICES:\n{best_prac or 'None yet.'}\n\n"
        f"RECENT ACTIVITY:\n{activity_summary}\n\n"
        f"TOOLS:\n{tool_ctx[:1200]}\n\n"
        f"Task: Identify 2-4 NEW, specific, actionable best practices NOT already listed.\n"
        f"Do not repeat existing practices. Focus on what this cycle reveals.\n"
        f"Output a Markdown best practices doc. Start with:\n"
        f"# Best Practices — Multi-Agent Orchestration\n"
        f"## Last updated: {ts} ({trigger})\n"
        f"Max 600 words."
    )
    bp_resp = _call_llm(bp_prompt)
    if bp_resp and not bp_resp.startswith("[LLM"):
        BEST_PRACTICES_PATH.write_text(bp_resp, encoding="utf-8")
        results["best_practices_updated"] = True

    # ── Per-agent evolution ─────────────────────────────────────────────
    try:
        from agent_registry import get_all_agents
        agents = get_all_agents()
    except Exception:
        agents = []

    for agent in agents:
        try:
            evo = _evolve_agent(agent, activity_summary, trigger, run_context)
            results["changes"].extend(evo["auto_applied"])
            results["proposals"].extend(evo["proposals"])
        except Exception as e:
            logger.warning(f"Evolution failed for {agent.get('id')}: {e}")

    # ── Tool description improvements ───────────────────────────────────
    tool_prompt = (
        f"Review tool descriptions for AI agents. Cycle: {trigger} | {ts}\n\n"
        f"TOOLS:\n{tool_ctx[:2000]}\n\n"
        f"For CUSTOM tools only: output JSON array if description is unclear to an LLM.\n"
        f'[{{"tool_id": "x", "suggested_description": "text", "confidence": 0.0}}]\n'
        f"Only include confidence > 0.85. Output ONLY JSON."
    )
    tool_resp = _call_llm(tool_prompt)
    tool_sugs = _parse_json_list(tool_resp)
    if isinstance(tool_sugs, list):
        for sug in tool_sugs:
            if not isinstance(sug, dict): continue
            tid  = sug.get("tool_id", "")
            val  = sug.get("suggested_description", "")
            conf = float(sug.get("confidence", 0))
            if conf >= 0.85 and tid and val and _config.get("auto_apply_safe"):
                try:
                    from tool_registry import update_tool, get_tool
                    t = get_tool(tid)
                    if t and not t.get("builtin"):
                        update_tool(tid, {"description": val})
                        results["changes"].append(f"Tool '{tid}' description updated (conf={conf:.0%})")
                except Exception as e:
                    logger.warning(f"Tool update failed {tid}: {e}")

    # ── Write legacy flat proposals file (backward compat) ──────────────
    if results["proposals"]:
        existing = PROPOSALS_PATH.read_text(encoding="utf-8") if PROPOSALS_PATH.exists() else ""
        new_block = f"\n## Proposals — {ts} [{trigger}]\n\n" + "\n\n".join(results["proposals"]) + "\n"
        PROPOSALS_PATH.write_text(existing + new_block, encoding="utf-8")

    # ── Improvement log ──────────────────────────────────────────────────
    log_entry = (
        f"\n## Cycle: {ts} [{trigger}]\n"
        f"- Best practices updated: {results['best_practices_updated']}\n"
        f"- Auto-applied changes:   {len(results['changes'])}\n"
        f"- Proposals queued:       {len(results['proposals'])}\n"
    )
    if results["changes"]:
        log_entry += "\n### Changes:\n" + "\n".join(f"- {c}" for c in results["changes"]) + "\n"
    with open(IMPROVEMENT_LOG, "a", encoding="utf-8") as f:
        f.write(log_entry)

    logger.info(f"Cycle [{trigger}] done: {len(results['changes'])} changes, {len(results['proposals'])} proposals.")
    return results


def _parse_json_list(text: str) -> list:
    if not text or text.startswith("[LLM"): return []
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m: return []
    try: return json.loads(m.group(0))
    except Exception: return []


# ─────────────────────────────────────────────────────────────────────────
# Broadcast + Telegram
# ─────────────────────────────────────────────────────────────────────────

def _broadcast_results(results: dict) -> None:
    trigger = results.get("trigger", "scheduled")
    _broadcast({
        "type":    "agent_activity",
        "agent":   "system",
        "label":   "🔄 Self-Improver",
        "message": (
            f"🔄 [{trigger}] Evolution cycle complete. "
            f"Auto-applied: {len(results['changes'])} | "
            f"Pending review: {len(results['proposals'])} | "
            f"Best practices: {'updated' if results['best_practices_updated'] else 'unchanged'}"
        ),
        "ts": time.time(),
    })


def _notify_telegram(results: dict) -> None:
    try:
        from telegram_bot import notify_message
        trigger = results.get("trigger", "scheduled")
        msg = (
            f"🧬 Agent evolution [{trigger}]\n"
            f"Auto-applied: {len(results['changes'])}\n"
            f"Pending review: {len(results['proposals'])}\n"
            f"Best practices: {'updated' if results['best_practices_updated'] else 'unchanged'}"
        )
        if results["changes"]:
            msg += "\n\nChanges:\n" + "\n".join(f"• {c}" for c in results["changes"][:5])
        if results["proposals"]:
            msg += "\n\n⏳ Awaiting your review in Settings → Evolution Proposals"
        notify_message(msg)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────
# Public read helpers (legacy — still used by /self-improver/proposals etc.)
# ─────────────────────────────────────────────────────────────────────────

def get_best_practices() -> str:
    return BEST_PRACTICES_PATH.read_text(encoding="utf-8") if BEST_PRACTICES_PATH.exists() else ""


def get_proposals() -> str:
    return PROPOSALS_PATH.read_text(encoding="utf-8") if PROPOSALS_PATH.exists() else ""


def get_log() -> str:
    return IMPROVEMENT_LOG.read_text(encoding="utf-8") if IMPROVEMENT_LOG.exists() else ""


# ─────────────────────────────────────────────────────────────────────────
# Scheduler
# ─────────────────────────────────────────────────────────────────────────

def _scheduler_loop() -> None:
    cfg           = load_config()
    interval_secs = int(cfg.get("interval_hours", 6)) * 3600
    last_run      = 0.0
    logger.info(f"Evolution scheduler active (interval: {cfg.get('interval_hours')}h)")
    while True:
        now = time.time()
        if now - last_run >= interval_secs:
            if _lock.acquire(blocking=False):
                try:
                    results  = _run_improvement_cycle()
                    last_run = time.time()
                    _broadcast_results(results)
                    cfg = load_config()
                    if cfg.get("notify_telegram"):
                        _notify_telegram(results)
                except Exception as e:
                    logger.error(f"Scheduled cycle failed: {e}", exc_info=True)
                finally:
                    _lock.release()
            cfg           = load_config()
            interval_secs = int(cfg.get("interval_hours", 6)) * 3600
        time.sleep(60)


def start_scheduler() -> None:
    global _thread
    if _thread is None or not _thread.is_alive():
        _thread = threading.Thread(target=_scheduler_loop, daemon=True, name="si-scheduler")
        _thread.start()
        logger.info("Evolution scheduler started.")


def trigger_improvement_cycle() -> None:
    """Non-blocking manual trigger. Called by POST /self-improver/run-now."""
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
        except Exception as e:
            logger.exception(f"Manual cycle failed: {e}")
        finally:
            _lock.release()
    threading.Thread(target=_run, daemon=True, name="si-manual").start()


def run_cycle() -> None:
    """Alias for backward compat (called by /self-improver/run-now background task)."""
    trigger_improvement_cycle()


# ─────────────────────────────────────────────────────────────────────────
# Init
# ─────────────────────────────────────────────────────────────────────────

def _init_best_practices() -> None:
    if not BEST_PRACTICES_PATH.exists():
        BEST_PRACTICES_PATH.write_text(
            "# Best Practices — Multi-Agent Orchestration\n\n"
            "> Auto-maintained by the evolution service.\n\n"
            "## Getting Started\n\n"
            "1. Use `llama3.2:3b` or larger for complex multi-step tasks.\n"
            "2. Keep topics specific — broad topics produce weaker outputs.\n"
            "3. Custom agents run after Writer and receive the full report as context.\n",
            encoding="utf-8",
        )


_init_best_practices()
load_config()
