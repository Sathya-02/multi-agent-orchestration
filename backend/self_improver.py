"""
self_improver.py — Autonomous Agent Evolution with Human-in-the-Loop

Evolution pipeline:
  1. SCHEDULED  — background thread fires every interval_hours
  2. PER-RUN    — triggered automatically after each job completes
                  (debounced: min 5 minutes between cycles)

On each cycle:
  1. Reads every agent's SKILLS.md individually
  2. Reads the last N job activity logs
  3. Reads the agent's personal evolution lineage (what changed before)
  4. Asks the LLM to evaluate that specific agent and propose patches
  5. confidence >= auto_apply_threshold + safe_to_auto_apply=true
       → patches SKILLS.md immediately (no human needed)
  6. confidence >= min_confidence but below auto threshold
       → queued as a structured JSON proposal for human review
  7. Human clicks Approve  → _apply_skills_patch() rewrites SKILLS.md
     Human clicks Reject   → logged, never re-suggested
  8. Every applied change is appended to evolution_history.json
     (fed back into next cycle's prompt as lineage context)
  9. Broadcasts live WebSocket events after every apply/reject

File layout (all under backend/):
  BEST_PRACTICES.md          — auto-updated each cycle
  proposals_pending.json     — structured proposal store (NEW)
  evolution_history.json     — per-agent change lineage  (NEW)
  IMPROVEMENT_LOG.md         — human-readable cycle log
  activity_log.jsonl         — rolling job event log
"""
import hashlib
import json
import logging
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger("self_improver")

BASE_DIR             = Path(__file__).parent
BEST_PRACTICES_PATH  = BASE_DIR / "BEST_PRACTICES.md"
PROPOSALS_PATH       = BASE_DIR / "IMPROVEMENT_PROPOSALS.md"   # legacy flat file kept
PROPOSALS_JSON       = BASE_DIR / "proposals_pending.json"      # NEW structured store
EVOLUTION_HISTORY    = BASE_DIR / "evolution_history.json"      # NEW lineage store
IMPROVEMENT_LOG      = BASE_DIR / "IMPROVEMENT_LOG.md"
ACTIVITY_LOG_PATH    = BASE_DIR / "activity_log.jsonl"
CONFIG_PATH          = BASE_DIR / "self_improver_config.json"

_DEFAULT_CONFIG = {
    "enabled":               True,
    "interval_hours":        6,
    "run_trigger":           True,
    "run_trigger_debounce":  300,
    "max_activity_entries":  50,
    "auto_apply_safe":       True,
    "auto_apply_threshold":  0.88,   # confidence floor for auto-patch
    "min_confidence":        0.70,   # floor for queuing a proposal
    "notify_telegram":       True,
    "model_override":        "",
}

_config:          dict                     = {}
_lock             = threading.Lock()
_thread: Optional[threading.Thread]        = None
_last_cycle_ts:   float                    = 0.0
_broadcast_fn:    Optional[Callable]       = None


# ─────────────────────────────────────────────────────────────────────────────
# Broadcast helper
# ─────────────────────────────────────────────────────────────────────────────

def set_broadcast_fn(fn: Callable) -> None:
    """Register the sync_broadcast function from main.py."""
    global _broadcast_fn
    _broadcast_fn = fn


def _broadcast(msg: dict) -> None:
    if _broadcast_fn:
        try:
            _broadcast_fn(msg)
        except Exception as exc:
            logger.debug("broadcast error (ignored): %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

def load_config() -> dict:
    global _config
    cfg = dict(_DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except Exception:
            pass
    _config = cfg
    return cfg


def save_config(cfg: dict) -> None:
    global _config
    _config = cfg
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# Proposals JSON store
# ─────────────────────────────────────────────────────────────────────────────

def _load_proposals() -> list:
    if PROPOSALS_JSON.exists():
        try:
            return json.loads(PROPOSALS_JSON.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _save_proposals(proposals: list) -> None:
    PROPOSALS_JSON.write_text(json.dumps(proposals, indent=2, ensure_ascii=False), encoding="utf-8")


def get_pending_proposals() -> list:
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
    job_context: dict,
    current_skills: str,
) -> str:
    """Add a proposal to the pending store. Returns the proposal ID."""
    pid = hashlib.md5(
        f"{agent_id}{reason}{datetime.now().isoformat()}".encode()
    ).hexdigest()[:8]

    proposal = {
        "id":                     pid,
        "created_at":             datetime.now().isoformat(),
        "agent_id":               agent_id,
        "agent_label":            agent_label,
        "patches":                patches,
        "reason":                 reason,
        "confidence":             round(confidence, 3),
        "trigger":                trigger,
        "job_context":            job_context,
        "current_skills_snapshot": current_skills[:1200],  # store first 1200 chars as reference
        "status":                 "pending",
    }
    proposals = _load_proposals()
    proposals.append(proposal)
    _save_proposals(proposals)
    logger.info("Queued proposal %s for agent '%s' (conf=%.0f%%): %s", pid, agent_id, confidence * 100, reason[:80])
    return pid


# ─────────────────────────────────────────────────────────────────────────────
# Evolution history (lineage)
# ─────────────────────────────────────────────────────────────────────────────

def _load_history() -> list:
    if EVOLUTION_HISTORY.exists():
        try:
            return json.loads(EVOLUTION_HISTORY.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _append_history(entry: dict) -> None:
    history = _load_history()
    history.append(entry)
    # Keep last 500 entries
    if len(history) > 500:
        history = history[-500:]
    EVOLUTION_HISTORY.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")


def get_evolution_history(agent_id: str = None) -> list:
    history = _load_history()
    if agent_id:
        return [h for h in history if h.get("agent_id") == agent_id]
    return history


def _gather_evolution_context(agent_id: str) -> str:
    """Return a short string describing the last 5 changes to this agent."""
    history = [h for h in _load_history() if h.get("agent_id") == agent_id]
    if not history:
        return "No prior evolution changes recorded for this agent."
    recent = history[-5:]
    lines = []
    for h in reversed(recent):
        ts      = h.get("applied_at", "?")[:16]
        fields  = ", ".join(h.get("fields_changed", []))
        reason  = h.get("reason", "")[:100]
        source  = h.get("source", "auto")
        lines.append(f"- [{ts}] ({source}) Changed: {fields} — {reason}")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# SKILLS.md patch engine
# ─────────────────────────────────────────────────────────────────────────────

def _patch_skills_yaml(current_text: str, patches: dict) -> str:
    """
    Apply field patches to a SKILLS.md / YAML-ish text.
    - scalar fields (max_iter, temperature): regex replace
    - multi-line blocks (goal, backstory, role): replace YAML block value
    - tools list: replace the tools: block
    - Appends an evolution timestamp comment
    - Preserves all other content unchanged
    """
    result = current_text

    for field, new_value in patches.items():
        if field == "max_iter" and isinstance(new_value, (int, float)):
            result = re.sub(
                r"(max_iter\s*:\s*)\d+", f"\\g<1>{int(new_value)}", result
            )

        elif field in ("goal", "backstory", "role", "description"):
            # Handle YAML block scalars (> or |) or inline values
            block_pat = re.compile(
                rf"^([ \t]*{re.escape(field)}\s*:[>|]?\s*\n)((?:[ \t]+.+\n?)*)",
                re.MULTILINE,
            )
            inline_pat = re.compile(
                rf"^([ \t]*{re.escape(field)}\s*:\s*)(.+)$",
                re.MULTILINE,
            )
            new_val_str = str(new_value).strip()
            if "\n" in new_val_str:
                # Multi-line → use block scalar
                indented = "\n".join(f"  {ln}" for ln in new_val_str.splitlines())
                replacement = f"{field}: >\n{indented}\n"
                if block_pat.search(result):
                    result = block_pat.sub(replacement, result, count=1)
                elif inline_pat.search(result):
                    result = inline_pat.sub(replacement.rstrip(), result, count=1)
                else:
                    result = result.rstrip() + f"\n{replacement}"
            else:
                # Single line → keep inline
                replacement = f"\\g<1>{new_val_str}"
                if inline_pat.search(result):
                    result = inline_pat.sub(replacement, result, count=1)
                elif block_pat.search(result):
                    result = block_pat.sub(f"{field}: {new_val_str}\n", result, count=1)
                else:
                    result = result.rstrip() + f"\n{field}: {new_val_str}\n"

        elif field == "tools" and isinstance(new_value, list):
            tools_block = "tools:\n" + "\n".join(f"  - {t}" for t in new_value) + "\n"
            tools_pat = re.compile(r"^tools\s*:\s*\n((?:[ \t]+.+\n?)*)", re.MULTILINE)
            if tools_pat.search(result):
                result = tools_pat.sub(tools_block, result, count=1)
            else:
                result = result.rstrip() + f"\n{tools_block}"

        elif field not in ("goal", "backstory", "role", "description", "tools", "max_iter"):
            # Generic scalar field
            pat = re.compile(rf"^([ \t]*{re.escape(field)}\s*:\s*)(.+)$", re.MULTILINE)
            if pat.search(result):
                result = pat.sub(f"\\g<1>{new_value}", result, count=1)
            else:
                result = result.rstrip() + f"\n{field}: {new_value}\n"

    # Stamp with evolution timestamp
    result = re.sub(r"\n# \[evolved .*?\]\n?", "", result)
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    result = result.rstrip() + f"\n# [evolved {ts} by self-improver]\n"
    return result


def _apply_skills_patch(
    agent_id: str,
    patches: dict,
    reason: str,
    source: str = "auto",
) -> bool:
    """
    Write patch to SKILLS.md and update agent registry.
    Returns True on success.
    """
    try:
        from agent_registry import AGENTS_DIR, get_agent, update_agent

        # 1. Patch SKILLS.md file
        skills_path = AGENTS_DIR / agent_id / "SKILLS.md"
        if skills_path.exists():
            current = skills_path.read_text(encoding="utf-8")
            updated = _patch_skills_yaml(current, patches)
            skills_path.write_text(updated, encoding="utf-8")

        # 2. Also update the in-memory registry for applicable scalar fields
        registry_fields = {k: v for k, v in patches.items()
                           if k in ("goal", "backstory", "role", "description") and isinstance(v, str)}
        if registry_fields:
            update_agent(agent_id, registry_fields)

        # 3. Record in evolution history
        _append_history({
            "agent_id":      agent_id,
            "applied_at":    datetime.now().isoformat(),
            "fields_changed": list(patches.keys()),
            "patches":       patches,
            "reason":        reason,
            "source":        source,
        })

        logger.info("Applied skills patch to '%s' (%s): %s", agent_id, source, list(patches.keys()))
        return True
    except Exception as exc:
        logger.exception("Failed to apply skills patch to '%s': %s", agent_id, exc)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Public approve / reject
# ─────────────────────────────────────────────────────────────────────────────

def approve_proposal(proposal_id: str) -> dict:
    """Human approves a queued proposal → patches SKILLS.md immediately."""
    proposals = _load_proposals()
    prop = next((p for p in proposals if p["id"] == proposal_id), None)
    if not prop:
        return {"error": "proposal not found", "ok": False}
    if prop.get("status") != "pending":
        return {"error": f"proposal status is '{prop['status']}', not pending", "ok": False}

    success = _apply_skills_patch(
        prop["agent_id"],
        prop["patches"],
        prop["reason"],
        source="human_approved",
    )

    prop["status"]      = "approved" if success else "failed"
    prop["approved_at"] = datetime.now().isoformat()
    _save_proposals(proposals)

    _broadcast({
        "type":        "si_proposal_applied",
        "proposal_id": proposal_id,
        "agent_id":    prop["agent_id"],
        "patches":     list(prop["patches"].keys()),
        "ok":          success,
    })

    if success:
        _log_cycle_entry(
            trigger="human_approved",
            changes=[f"Agent '{prop['agent_id']}' {list(prop['patches'].keys())} patched (proposal {proposal_id})"],
            proposals=[],
            bp_updated=False,
        )

    return {
        "ok":     success,
        "applied": [f"{prop['agent_id']}: {list(prop['patches'].keys())}"],
    }


def reject_proposal(proposal_id: str, reason: str = "") -> dict:
    """Human rejects a proposal — logged, no SKILLS.md change."""
    proposals = _load_proposals()
    prop = next((p for p in proposals if p["id"] == proposal_id), None)
    if not prop:
        return {"error": "proposal not found", "ok": False}
    prop["status"]      = "rejected"
    prop["rejected_at"] = datetime.now().isoformat()
    prop["reject_reason"] = reason
    _save_proposals(proposals)
    logger.info("Proposal %s rejected for agent '%s': %s", proposal_id, prop.get("agent_id"), reason)
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Activity log
# ─────────────────────────────────────────────────────────────────────────────

def log_activity(event: dict) -> None:
    global _last_cycle_ts
    try:
        with open(ACTIVITY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")
        lines = ACTIVITY_LOG_PATH.read_text(encoding="utf-8").splitlines()
        if len(lines) > 500:
            ACTIVITY_LOG_PATH.write_text("\n".join(lines[-500:]) + "\n", encoding="utf-8")
    except Exception as e:
        logger.warning("Activity log write failed: %s", e)

    cfg = _config or load_config()
    if not cfg.get("run_trigger", True) or not cfg.get("enabled", True):
        return
    debounce = int(cfg.get("run_trigger_debounce", 300))
    if time.time() - _last_cycle_ts < debounce:
        return

    def _run():
        global _last_cycle_ts
        if not _lock.acquire(blocking=False):
            return
        try:
            _last_cycle_ts = time.time()
            results = _run_improvement_cycle(run_context=event)
            _broadcast_results(results)
            if cfg.get("notify_telegram"):
                _notify_telegram(results)
        except Exception as exc:
            logger.exception("Per-run improvement cycle failed: %s", exc)
        finally:
            _lock.release()

    threading.Thread(target=_run, daemon=True, name="self-improver-per-run").start()


def _read_recent_activity(n: int = 50) -> list:
    if not ACTIVITY_LOG_PATH.exists():
        return []
    lines = ACTIVITY_LOG_PATH.read_text(encoding="utf-8").splitlines()
    result = []
    for line in lines[-n:]:
        try:
            result.append(json.loads(line))
        except Exception:
            pass
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Context gathering
# ─────────────────────────────────────────────────────────────────────────────

def _get_all_agents_with_skills() -> list:
    """Return list of dicts: {id, role, label, skills_text}"""
    try:
        from agent_registry import AGENTS_DIR, get_all_agents
        agents = []
        for agent in get_all_agents():
            aid = agent["id"]
            p   = AGENTS_DIR / aid / "SKILLS.md"
            agents.append({
                "id":          aid,
                "role":        agent.get("role", aid),
                "label":       agent.get("label", agent.get("role", aid)),
                "skills_text": p.read_text(encoding="utf-8") if p.exists() else "[No SKILLS.md]",
            })
        return agents
    except Exception as exc:
        logger.warning("Could not load agents: %s", exc)
        return []


def _gather_tool_context() -> str:
    try:
        from tool_registry import get_all_tools, TOOLS_DIR
        sections = []
        for tool in get_all_tools():
            if tool.get("builtin"):
                sections.append(f"### Tool: {tool.get('display_name', tool['name'])} [built-in]\n"
                                f"Description: {tool.get('description', '')}")
            else:
                tid = tool["id"]
                p   = TOOLS_DIR / tid / "TOOL.md"
                sections.append(f"### Tool: {tool.get('display_name', tool['name'])} ({tid}) [custom]\n"
                                + (p.read_text(encoding="utf-8") if p.exists() else ""))
        return "\n\n".join(sections)
    except Exception as exc:
        return f"[Tool context unavailable: {exc}]"


# ─────────────────────────────────────────────────────────────────────────────
# LLM
# ─────────────────────────────────────────────────────────────────────────────

def _call_llm(prompt: str) -> str:
    try:
        from model_config import get_active_model
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
    except Exception as exc:
        return f"[LLM call failed: {exc}]"


def _parse_json_response(text: str):
    if not text or text.startswith("[LLM"):
        return None
    # Try to extract JSON object or array
    for pat in (r"\{.*\}", r"\[.*\]"):
        m = re.search(pat, text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                continue
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Core improvement cycle
# ─────────────────────────────────────────────────────────────────────────────

def _run_improvement_cycle(run_context: Optional[dict] = None) -> dict:
    ts      = datetime.now().strftime("%Y-%m-%d %H:%M")
    trigger = "per-run" if run_context else "scheduled"
    logger.info("Self-improvement cycle [%s] starting at %s", trigger, ts)

    results = {
        "ts":                    ts,
        "trigger":               trigger,
        "changes":               [],
        "proposals":             [],
        "best_practices_updated": False,
    }

    activity  = _read_recent_activity(_config.get("max_activity_entries", 50))
    agents    = _get_all_agents_with_skills()
    tool_ctx  = _gather_tool_context()
    best_prac = BEST_PRACTICES_PATH.read_text(encoding="utf-8") if BEST_PRACTICES_PATH.exists() else ""

    # Activity summary (last 20 jobs)
    if activity:
        lines = []
        for ev in activity[-20:]:
            lines.append(
                f"- Job {ev.get('job_id','?')}: {ev.get('status','?')} | "
                f"'{ev.get('topic','?')[:55]}' | model={ev.get('model','?')} | "
                f"{ev.get('duration_secs','?')}s"
            )
        activity_summary = "\n".join(lines)
    else:
        activity_summary = "No recent activity recorded yet."

    run_ctx_str = ""
    job_context = {}
    if run_context:
        job_context = {
            "job_id": run_context.get("job_id", "?"),
            "topic":  run_context.get("topic",  "")[:100],
            "status": run_context.get("status", "?"),
            "model":  run_context.get("model",  "?"),
            "duration_secs": run_context.get("duration_secs", "?"),
        }
        run_ctx_str = (
            f"\n\nTRIGGERING JOB:\n"
            f"  Job ID:   {job_context['job_id']}\n"
            f"  Topic:    {job_context['topic']}\n"
            f"  Status:   {job_context['status']}\n"
            f"  Model:    {job_context['model']}\n"
            f"  Duration: {job_context['duration_secs']}s"
        )

    auto_threshold = float(_config.get("auto_apply_threshold", 0.88))
    min_conf       = float(_config.get("min_confidence",       0.70))
    auto_apply     = _config.get("auto_apply_safe", True)

    # ── Step 1: Best practices update ────────────────────────────────────────
    bp_prompt = (
        f"You are a self-improvement AI for a multi-agent research platform.\n"
        f"Cycle type: {trigger.upper()} | Timestamp: {ts}{run_ctx_str}\n\n"
        f"CURRENT BEST PRACTICES:\n{best_prac or 'None documented yet.'}\n\n"
        f"RECENT JOB ACTIVITY (last 20):\n{activity_summary}\n\n"
        f"AGENTS:\n" + "\n".join(f"- {a['label']} ({a['id']})" for a in agents) + "\n\n"
        f"Your task:\n"
        f"1. Identify 2-4 NEW, SPECIFIC, ACTIONABLE best practices from the recent data.\n"
        f"2. Do NOT repeat existing best practices verbatim.\n"
        f"3. Note model performance patterns.\n\n"
        f"Output Markdown starting with:\n"
        f"# Best Practices — Multi-Agent Orchestration\n"
        f"## Last updated: {ts} ({trigger} cycle)\n\nMax 600 words."
    )
    bp_response = _call_llm(bp_prompt)
    if bp_response and not bp_response.startswith("[LLM"):
        BEST_PRACTICES_PATH.write_text(bp_response, encoding="utf-8")
        results["best_practices_updated"] = True

    # ── Step 2: Per-agent evolution ───────────────────────────────────────────
    for agent in agents:
        aid     = agent["id"]
        label   = agent["label"]
        skills  = agent["skills_text"]
        lineage = _gather_evolution_context(aid)

        evo_prompt = (
            f"You are an AI agent evolution engine evaluating a single agent.\n\n"
            f"AGENT: {label} (id={aid})\n"
            f"TRIGGER: {trigger.upper()} at {ts}{run_ctx_str}\n\n"
            f"CURRENT SKILLS.md:\n{skills[:2000]}\n\n"
            f"RECENT JOB PERFORMANCE:\n{activity_summary}\n\n"
            f"EVOLUTION LINEAGE (prior changes to this agent):\n{lineage}\n\n"
            f"AVAILABLE TOOLS:\n{tool_ctx[:600]}\n\n"
            f"Instructions:\n"
            f"- Evaluate whether this agent's goal/backstory/max_iter fit the recent job demands.\n"
            f"- Consider the lineage: if a field was recently changed, assess whether it helped.\n"
            f"- If no change is needed, output: {{\"patches\": {{}}, \"confidence\": 0, \"reason\": \"no change needed\", \"safe_to_auto_apply\": false}}\n\n"
            f"Output ONLY a single JSON object:\n"
            f"{{\n"
            f"  \"patches\": {{\"goal\": \"new text if changing\", \"backstory\": \"...\"}},\n"
            f"  \"reason\": \"specific evidence-based reason for this change\",\n"
            f"  \"confidence\": 0.0,\n"
            f"  \"safe_to_auto_apply\": true\n"
            f"}}\n\n"
            f"Rules:\n"
            f"- confidence 0.0-1.0 (be conservative; 0.88+ only for clear improvements)\n"
            f"- safe_to_auto_apply=true only for goal/backstory/max_iter with confidence >= {auto_threshold}\n"
            f"- Include ONLY fields that genuinely need changing in patches\n"
            f"- Output ONLY the JSON object, no explanation outside it"
        )

        raw = _call_llm(evo_prompt)
        parsed = _parse_json_response(raw)

        if not isinstance(parsed, dict):
            continue

        patches    = parsed.get("patches", {})
        reason     = parsed.get("reason", "")
        confidence = float(parsed.get("confidence", 0))
        safe       = parsed.get("safe_to_auto_apply", False)

        if not patches or confidence < min_conf:
            continue

        if auto_apply and safe and confidence >= auto_threshold:
            # Auto-patch immediately
            ok = _apply_skills_patch(aid, patches, reason, source="auto")
            if ok:
                msg = f"Agent '{aid}' auto-evolved (conf={confidence:.0%}): {list(patches.keys())} — {reason[:80]}"
                results["changes"].append(msg)
                _broadcast({
                    "type":    "agent_activity",
                    "agent":   "system",
                    "label":   "🧬 Self-Evolve",
                    "message": f"✅ [{trigger}] {msg}",
                    "ts":      time.time(),
                })
        else:
            # Queue for human review
            pid = _queue_proposal(
                agent_id=aid,
                agent_label=label,
                patches=patches,
                reason=reason,
                confidence=confidence,
                trigger=trigger,
                job_context=job_context,
                current_skills=skills,
            )
            summary = f"Agent '{aid}' proposal queued (conf={confidence:.0%}, id={pid}): {reason[:80]}"
            results["proposals"].append(summary)
            _broadcast({
                "type":        "si_proposal_queued",
                "proposal_id": pid,
                "agent_id":    aid,
                "agent_label": label,
                "confidence":  confidence,
                "fields":      list(patches.keys()),
                "reason":      reason,
            })

    # ── Step 3: Tool description improvements ────────────────────────────────
    tool_prompt = (
        f"You are reviewing tool descriptions for AI agents.\n"
        f"Cycle: {trigger.upper()} at {ts}{run_ctx_str}\n\n"
        f"TOOLS:\n{tool_ctx[:2000]}\n\n"
        f"For each CUSTOM tool, check if the description clearly states:\n"
        f"- What it does, what input it expects, what it returns.\n\n"
        f"Output a JSON array (empty [] if nothing to improve):\n"
        f"[{{\"tool_id\": \"my_tool\", \"suggested_description\": \"improved text\", \"confidence\": 0.0}}]\n"
        f"Only include tools where improvement is clear (confidence > 0.85). Output ONLY JSON."
    )
    tool_raw  = _call_llm(tool_prompt)
    tool_sugs = _parse_json_response(tool_raw)
    if isinstance(tool_sugs, list) and auto_apply:
        for sug in tool_sugs:
            if not isinstance(sug, dict):
                continue
            tid  = sug.get("tool_id", "")
            val  = sug.get("suggested_description", "")
            conf = float(sug.get("confidence", 0))
            if conf >= 0.85 and tid and val:
                try:
                    from tool_registry import update_tool, get_tool
                    t = get_tool(tid)
                    if t and not t.get("builtin"):
                        update_tool(tid, {"description": val})
                        results["changes"].append(f"Tool '{tid}' description updated (conf={conf:.0%})")
                except Exception as exc:
                    logger.warning("Tool update failed: %s", exc)

    # ── Step 4: Log ───────────────────────────────────────────────────────────
    _log_cycle_entry(trigger, results["changes"], results["proposals"], results["best_practices_updated"], run_context)

    logger.info(
        "Cycle [%s] complete: %d changes, %d proposals queued.",
        trigger, len(results["changes"]), len(results["proposals"])
    )
    return results


def _log_cycle_entry(trigger, changes, proposals, bp_updated, run_context=None):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    run_tag = f"[{trigger}]"
    if run_context:
        run_tag += f" triggered by job '{run_context.get('job_id','?')}' ({run_context.get('topic','')[:40]})"
    entry = (
        f"\n## Cycle: {ts} {run_tag}\n"
        f"- Best practices updated: {bp_updated}\n"
        f"- Auto-applied changes:   {len(changes)}\n"
        f"- Proposals queued:       {len(proposals)}\n"
    )
    if changes:
        entry += "\n### Auto-applied:\n" + "\n".join(f"- {c}" for c in changes) + "\n"
    if proposals:
        entry += "\n### Queued for review:\n" + "\n".join(f"- {p}" for p in proposals) + "\n"
    with open(IMPROVEMENT_LOG, "a", encoding="utf-8") as f:
        f.write(entry)


# ─────────────────────────────────────────────────────────────────────────────
# Broadcast + Telegram
# ─────────────────────────────────────────────────────────────────────────────

def _broadcast_results(results: dict) -> None:
    trigger = results.get("trigger", "scheduled")
    _broadcast({
        "type":    "agent_activity",
        "agent":   "system",
        "label":   "🔄 Self-Improver",
        "message": (
            f"🔄 [{trigger}] Cycle complete. "
            f"Auto-applied: {len(results['changes'])} | "
            f"Proposals queued: {len(results['proposals'])} | "
            f"Best practices: {'updated' if results['best_practices_updated'] else 'unchanged'}"
        ),
        "ts": time.time(),
    })


def _notify_telegram(results: dict) -> None:
    try:
        from telegram_bot import notify_message
        trigger = results.get("trigger", "scheduled")
        summary = (
            f"🧬 Self-evolution cycle [{trigger}]\n"
            f"Auto-applied: {len(results['changes'])}\n"
            f"Proposals queued for review: {len(results['proposals'])}\n"
            f"Best practices: {'updated' if results['best_practices_updated'] else 'unchanged'}\n"
        )
        if results["changes"]:
            summary += "\nAuto-applied:\n" + "\n".join(f"• {c}" for c in results["changes"][:5])
        if results["proposals"]:
            summary += "\nPending human review:\n" + "\n".join(f"• {p}" for p in results["proposals"][:3])
        notify_message(summary)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Public API (called from main.py)
# ─────────────────────────────────────────────────────────────────────────────

def get_best_practices() -> str:
    return BEST_PRACTICES_PATH.read_text(encoding="utf-8") if BEST_PRACTICES_PATH.exists() else ""


def get_proposals() -> str:
    return PROPOSALS_PATH.read_text(encoding="utf-8") if PROPOSALS_PATH.exists() else ""


def get_log() -> str:
    return IMPROVEMENT_LOG.read_text(encoding="utf-8") if IMPROVEMENT_LOG.exists() else ""


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
        except Exception as exc:
            logger.exception("Self-improver cycle failed: %s", exc)
        finally:
            _lock.release()

    threading.Thread(target=_run, daemon=True, name="self-improver-manual").start()


def start_scheduler() -> None:
    global _thread
    if _thread is None or not _thread.is_alive():
        _thread = threading.Thread(target=_scheduler_loop, daemon=True, name="self-improver-scheduler")
        _thread.start()
        logger.info("Self-improver scheduler started.")


def _scheduler_loop() -> None:
    cfg           = load_config()
    interval_secs = int(cfg.get("interval_hours", 6)) * 3600
    last_run      = 0.0
    logger.info("Self-improver scheduler active (interval: %sh)", cfg.get("interval_hours"))
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
                except Exception as exc:
                    logger.error("Scheduled cycle failed: %s", exc, exc_info=True)
                finally:
                    _lock.release()
            cfg           = load_config()
            interval_secs = int(cfg.get("interval_hours", 6)) * 3600
        time.sleep(60)


# ─────────────────────────────────────────────────────────────────────────────
# Init
# ─────────────────────────────────────────────────────────────────────────────

def _init_best_practices() -> None:
    if not BEST_PRACTICES_PATH.exists():
        BEST_PRACTICES_PATH.write_text(
            "# Best Practices — Multi-Agent Orchestration\n\n"
            "> Auto-maintained by the self-improvement service.\n\n"
            "## Getting Started\n\n"
            "1. Use `llama3.2:3b` or larger for complex multi-step research tasks.\n"
            "2. `phi3:mini` works well for quick queries and simple summaries.\n"
            "3. Keep research topics specific — broad topics produce weaker reports.\n"
            "4. Custom agents run after the Writer and receive the full report as context.\n"
            "5. Filesystem access must be explicitly granted before agents can read files.\n",
            encoding="utf-8",
        )


_init_best_practices()
load_config()
