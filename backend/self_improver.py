"""
self_improver.py — Autonomous Agent Evolution with Human-in-Loop

Evolution pipeline:
  1. After each job (debounced) OR on schedule:
     - Reads each agent's SKILLS.md + recent job activity + evolution lineage
     - Asks LLM to evaluate and suggest patches (goal/backstory/max_iter/tools)
  2. confidence >= 0.88 + safe_to_auto_apply → patch SKILLS.md immediately
     confidence 0.70-0.87              → queue as structured JSON proposal
  3. UI shows pending proposals; human clicks Approve or Reject
     Approve → _apply_skills_patch() writes SKILLS.md + updates agent registry
     Reject  → logged with reason; agent never re-suggested same change
  4. Every change (auto or human) appended to evolution_history.json
     → fed back into next LLM prompt as lineage context

Legacy features preserved:
  - BEST_PRACTICES.md update each cycle
  - Tool description improvements
  - IMPROVEMENT_LOG.md + IMPROVEMENT_PROPOSALS.md (legacy flat files)
  - Telegram notification
  - Background scheduler + per-run debounced trigger
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
PROPOSALS_PATH       = BASE_DIR / "IMPROVEMENT_PROPOSALS.md"   # legacy flat file
IMPROVEMENT_LOG      = BASE_DIR / "IMPROVEMENT_LOG.md"
ACTIVITY_LOG_PATH    = BASE_DIR / "activity_log.jsonl"
CONFIG_PATH          = BASE_DIR / "self_improver_config.json"
PROPOSALS_JSON       = BASE_DIR / "proposals_pending.json"     # structured store
EVOLUTION_HISTORY    = BASE_DIR / "evolution_history.json"     # lineage

_DEFAULT_CONFIG = {
    "enabled":              True,
    "interval_hours":       6,
    "run_trigger":          True,
    "run_trigger_debounce": 300,
    "max_activity_entries": 50,
    "auto_apply_safe":      True,
    "notify_telegram":      True,
    "model_override":       "",
    "min_confidence":       0.7,
    "auto_apply_threshold": 0.88,   # confidence floor for immediate SKILLS.md write
}

_config:        dict = {}
_lock           = threading.Lock()
_thread:        Optional[threading.Thread] = None
_last_cycle_ts: float = 0.0
_broadcast_fn:  Optional[Callable] = None


# ─────────────────────────────────────────────────────────────────────────────
# Broadcast injection
# ─────────────────────────────────────────────────────────────────────────────

def set_broadcast_fn(fn: Callable) -> None:
    global _broadcast_fn
    _broadcast_fn = fn


def _broadcast(msg: dict) -> None:
    if _broadcast_fn:
        try:
            _broadcast_fn(msg)
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# Structured proposals store
# ─────────────────────────────────────────────────────────────────────────────

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
    return [p for p in _load_proposals() if p.get("status") == "pending"]


def get_all_proposals() -> list:
    return _load_proposals()


# ─────────────────────────────────────────────────────────────────────────────
# Evolution history (lineage)
# ─────────────────────────────────────────────────────────────────────────────

def _load_history() -> list:
    if EVOLUTION_HISTORY.exists():
        try:
            return json.loads(EVOLUTION_HISTORY.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def _append_history(entry: dict) -> None:
    history = _load_history()
    history.append(entry)
    if len(history) > 500:
        history = history[-500:]
    EVOLUTION_HISTORY.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")


def get_evolution_history(agent_id: Optional[str] = None) -> list:
    history = _load_history()
    if agent_id:
        return [h for h in history if h.get("agent_id") == agent_id]
    return history


def _gather_evolution_context(agent_id: str) -> str:
    """Return a human-readable summary of the last 5 changes for this agent."""
    entries = [h for h in _load_history() if h.get("agent_id") == agent_id][-5:]
    if not entries:
        return "No previous evolution changes recorded for this agent."
    lines = []
    for e in entries:
        ts     = e.get("ts", "?")
        field  = e.get("field", "?")
        reason = e.get("reason", "")[:120]
        src    = e.get("source", "?")   # auto_applied | human_approved
        lines.append(f"  [{ts}] {field} changed ({src}): {reason}")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# SKILLS.md patch engine
# ─────────────────────────────────────────────────────────────────────────────

def _patch_skills_yaml(current_text: str, patches: dict) -> str:
    """
    Apply field patches to SKILLS.md text.
    patches = {"goal": "new text", "backstory": "new text", "max_iter": 5}
    Preserves all unrelated content; appends evolution timestamp at end.
    """
    result = current_text
    for field, new_value in patches.items():
        if field == "max_iter":
            result = re.sub(r"(max_iter\s*:\s*)\d+", f"\\g<1>{new_value}", result)

        elif field in ("goal", "backstory", "role"):
            new_lines = "\n".join(f"  {ln}" for ln in str(new_value).strip().splitlines())
            block_pat = re.compile(
                rf"^([ \t]*{re.escape(field)}\s*:\s*[>|]?\s*\n)((?:[ \t]+.+\n?)*)",
                re.MULTILINE,
            )
            if block_pat.search(result):
                result = block_pat.sub(f"\\g<1>{new_lines}\n", result, count=1)
            else:
                result += f"\n{field}: >\n{new_lines}\n"

        elif field == "tools" and isinstance(new_value, list):
            tools_block = "tools:\n" + "\n".join(f"  - {t}" for t in new_value) + "\n"
            tools_pat   = re.compile(r"^tools\s*:\s*\n((?:[ \t]+.+\n?)*)", re.MULTILINE)
            if tools_pat.search(result):
                result = tools_pat.sub(tools_block, result, count=1)
            else:
                result += f"\n{tools_block}"

    # Append / refresh evolution stamp
    ts     = datetime.now().strftime("%Y-%m-%d %H:%M")
    result = re.sub(r"\n# \[evolved .*?\]\n?", "", result)
    result = result.rstrip() + f"\n# [evolved {ts} by self-improver]\n"
    return result


def _apply_skills_patch(agent_id: str, patches: dict, reason: str, source: str) -> bool:
    """
    Write patches into the agent's SKILLS.md and update the agent registry.
    source: 'auto_applied' | 'human_approved'
    """
    try:
        from agent_registry import AGENTS_DIR, update_agent, get_agent
    except Exception as e:
        logger.warning(f"_apply_skills_patch: agent_registry import failed: {e}")
        return False

    skills_path = AGENTS_DIR / agent_id / "SKILLS.md"
    current     = skills_path.read_text(encoding="utf-8") if skills_path.exists() else ""
    patched     = _patch_skills_yaml(current, patches)
    skills_path.parent.mkdir(parents=True, exist_ok=True)
    skills_path.write_text(patched, encoding="utf-8")

    # Also mirror scalar fields into the agent registry JSON
    registry_fields = {k: v for k, v in patches.items() if k in ("goal", "backstory", "role")}
    if registry_fields:
        try:
            update_agent(agent_id, registry_fields)
        except Exception as e:
            logger.warning(f"Registry update failed for {agent_id}: {e}")

    # Record lineage
    for field, val in patches.items():
        _append_history({
            "ts":       datetime.now().isoformat(),
            "agent_id": agent_id,
            "field":    field,
            "reason":   reason,
            "source":   source,
            "snippet":  str(val)[:200],
        })

    logger.info(f"SKILLS.md patched for agent '{agent_id}' ({source}): {list(patches.keys())}")
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Human-in-loop: approve / reject
# ─────────────────────────────────────────────────────────────────────────────

def approve_proposal(proposal_id: str) -> dict:
    proposals = _load_proposals()
    prop      = next((p for p in proposals if p["id"] == proposal_id), None)
    if not prop:
        return {"error": "proposal not found"}
    if prop.get("status") != "pending":
        return {"error": f"proposal already {prop.get('status')}"}

    ok = _apply_skills_patch(
        prop["agent_id"],
        prop["patches"],
        prop["reason"],
        "human_approved",
    )
    prop["status"]      = "approved"
    prop["approved_ts"] = datetime.now().isoformat()
    _save_proposals(proposals)

    _broadcast({"type": "agents_updated"})
    _broadcast({
        "type":        "si_proposal_applied",
        "agent":       prop["agent_id"],
        "patches":     list(prop["patches"].keys()),
        "proposal_id": proposal_id,
    })

    return {"ok": ok, "applied": [f"{prop['agent_id']}: {list(prop['patches'].keys())}"]}


def reject_proposal(proposal_id: str, reason: str = "") -> dict:
    proposals = _load_proposals()
    prop      = next((p for p in proposals if p["id"] == proposal_id), None)
    if not prop:
        return {"error": "proposal not found"}
    prop["status"]       = "rejected"
    prop["rejected_ts"]  = datetime.now().isoformat()
    prop["reject_reason"]= reason
    _save_proposals(proposals)
    logger.info(f"Proposal {proposal_id} rejected. Reason: {reason}")
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
        logger.warning(f"Activity log write failed: {e}")

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
        except Exception as e:
            logger.exception(f"Per-run cycle failed: {e}")
        finally:
            _lock.release()

    threading.Thread(target=_run, daemon=True, name="si-per-run").start()


def _read_recent_activity(n: int = 50) -> list:
    if not ACTIVITY_LOG_PATH.exists():
        return []
    lines  = ACTIVITY_LOG_PATH.read_text(encoding="utf-8").splitlines()
    recent = []
    for line in lines[-n:]:
        try:
            recent.append(json.loads(line))
        except Exception:
            pass
    return recent


# ─────────────────────────────────────────────────────────────────────────────
# Context gathering
# ─────────────────────────────────────────────────────────────────────────────

def _gather_agent_context() -> str:
    from agent_registry import AGENTS_DIR, get_all_agents
    sections = []
    for agent in get_all_agents():
        aid = agent["id"]
        p   = AGENTS_DIR / aid / "SKILLS.md"
        txt = p.read_text(encoding="utf-8") if p.exists() else "[No SKILLS.md]"
        sections.append(f"### Agent: {agent.get('role', aid)} ({aid})\n{txt}")
    return "\n\n".join(sections)


def _gather_tool_context() -> str:
    from tool_registry import TOOLS_DIR, get_all_tools
    sections = []
    for tool in get_all_tools():
        if tool.get("builtin"):
            sections.append(
                f"### Tool: {tool.get('display_name', tool['name'])} ({tool['id']}) [built-in]\n"
                f"Description: {tool.get('description', '')}"
            )
        else:
            tid = tool["id"]
            p   = TOOLS_DIR / tid / "TOOL.md"
            txt = p.read_text(encoding="utf-8") if p.exists() else "[No TOOL.md]"
            sections.append(f"### Tool: {tool.get('display_name', tool['name'])} ({tid}) [custom]\n{txt}")
    return "\n\n".join(sections)


def _read_best_practices() -> str:
    return BEST_PRACTICES_PATH.read_text(encoding="utf-8") if BEST_PRACTICES_PATH.exists() else ""


# ─────────────────────────────────────────────────────────────────────────────
# LLM call
# ─────────────────────────────────────────────────────────────────────────────

def _call_llm(prompt: str) -> str:
    from model_config import get_active_model
    try:
        import requests as req
        model   = _config.get("model_override") or get_active_model()
        payload = {
            "model":   model,
            "prompt":  prompt,
            "stream":  False,
            "options": {"num_predict": 1400, "temperature": 0.5},
        }
        resp = req.post("http://localhost:11434/api/generate", json=payload, timeout=120)
        if resp.status_code == 200:
            return resp.json().get("response", "").strip()
        return f"[LLM error: HTTP {resp.status_code}]"
    except Exception as e:
        return f"[LLM call failed: {e}]"


# ─────────────────────────────────────────────────────────────────────────────
# Per-agent evolution (new)
# ─────────────────────────────────────────────────────────────────────────────

def _evolve_agents(activity_summary: str, trigger: str, run_context: Optional[dict]) -> dict:
    """
    Evaluate each agent individually and generate targeted SKILLS.md patches.
    Returns {"changes": [...], "proposals": [...]} for the summary log.
    """
    changes   = []
    proposals = []
    threshold = float(_config.get("auto_apply_threshold", 0.88))
    min_conf  = float(_config.get("min_confidence", 0.7))

    try:
        from agent_registry import AGENTS_DIR, get_all_agents
    except Exception as e:
        logger.warning(f"_evolve_agents: cannot import agent_registry: {e}")
        return {"changes": changes, "proposals": proposals}

    for agent in get_all_agents():
        aid   = agent["id"]
        label = agent.get("role", aid)
        sp    = AGENTS_DIR / aid / "SKILLS.md"
        current_skills = sp.read_text(encoding="utf-8") if sp.exists() else "[No SKILLS.md]"
        lineage        = _gather_evolution_context(aid)

        evo_prompt = (
            f"You are an AI agent evolution engine.\n"
            f"\nAGENT: {label} (id={aid})"
            f"\nCURRENT SKILLS.md:\n{current_skills}"
            f"\nRECENT JOB PERFORMANCE:\n{activity_summary}"
            f"\nEVOLUTION LINEAGE (previous changes to this agent):\n{lineage}"
            f"\n\nYour task: analyse whether this agent's SKILLS.md should be updated"
            f" based on the job performance evidence above."
            f"\n\nOutput ONLY a JSON object with these keys:"
            f"\n{{\"patches\": {{\"goal\": \"new text\"}}, \"reason\": \"evidence-based reason\","
            f" \"confidence\": 0.0, \"safe_to_auto_apply\": true}}"
            f"\n\nRules:"
            f"\n- confidence is 0.0-1.0; be conservative (most runs → 0.5-0.7)"
            f"\n- safe_to_auto_apply=true only for goal/backstory/max_iter with confidence >= {threshold}"
            f"\n- If no change is needed output: {{\"patches\": {{}}, \"confidence\": 0, \"reason\": \"no change needed\"}}"
            f"\n- Do NOT suggest the same change already in the lineage"
            f"\nOutput ONLY JSON."
        )

        resp = _call_llm(evo_prompt)
        sug  = _parse_json_obj(resp)
        if not isinstance(sug, dict) or not sug.get("patches"):
            continue

        patches = sug["patches"]
        conf    = float(sug.get("confidence", 0))
        safe    = bool(sug.get("safe_to_auto_apply", False))
        reason  = sug.get("reason", "")

        if conf < min_conf:
            continue

        if safe and conf >= threshold and _config.get("auto_apply_safe", True):
            # ── Auto-apply immediately ────────────────────────────────────
            ok = _apply_skills_patch(aid, patches, reason, "auto_applied")
            if ok:
                changes.append(f"Agent '{aid}' SKILLS.md auto-patched (conf={conf:.0%}): {list(patches.keys())}")
                _broadcast({
                    "type":    "agent_activity",
                    "agent":   "system",
                    "label":   "🧬 Self-Improver",
                    "message": f"✅ Auto-evolved agent '{label}': {list(patches.keys())} (conf={conf:.0%})",
                    "ts":      time.time(),
                })
        else:
            # ── Queue as pending human-review proposal ────────────────────
            prop_id = hashlib.sha1(
                f"{aid}{reason}{datetime.now().isoformat()}".encode()
            ).hexdigest()[:8]

            current_snap = sp.read_text(encoding="utf-8") if sp.exists() else ""
            proposal = {
                "id":                      prop_id,
                "created_at":              datetime.now().isoformat(),
                "agent_id":                aid,
                "agent_label":             label,
                "patches":                 patches,
                "reason":                  reason,
                "confidence":              conf,
                "trigger":                 trigger,
                "job_context":             {
                    "job_id": run_context.get("job_id", "") if run_context else "",
                    "topic":  run_context.get("topic",  "") if run_context else "",
                },
                "current_skills_snapshot": current_snap,
                "status":                  "pending",
            }
            existing = _load_proposals()
            existing.append(proposal)
            _save_proposals(existing)
            proposals.append(f"AGENT {aid} (conf={conf:.0%}): {reason[:100]}")

            _broadcast({
                "type":    "si_proposal_queued",
                "agent":   aid,
                "label":   label,
                "fields":  list(patches.keys()),
                "conf":    conf,
                "id":      prop_id,
            })

    return {"changes": changes, "proposals": proposals}


# ─────────────────────────────────────────────────────────────────────────────
# Core improvement cycle
# ─────────────────────────────────────────────────────────────────────────────

def _run_improvement_cycle(run_context: Optional[dict] = None) -> dict:
    ts      = datetime.now().strftime("%Y-%m-%d %H:%M")
    trigger = "per-run" if run_context else "scheduled"
    run_ctx_str = ""

    if run_context:
        job_id   = run_context.get("job_id", "unknown")
        topic    = run_context.get("topic",  "unknown")[:80]
        status   = run_context.get("status", "unknown")
        model    = run_context.get("model",  "unknown")
        duration = run_context.get("duration_secs", "?")
        run_ctx_str = (
            f"\n\nTRIGGERING JOB:\n"
            f"  Job ID: {job_id}\n  Topic: {topic}\n"
            f"  Status: {status}\n  Model: {model}\n  Duration: {duration}s"
        )

    logger.info(f"Self-improvement cycle [{trigger}] starting at {ts}")
    results = {
        "ts": ts, "trigger": trigger,
        "changes": [], "proposals": [],
        "best_practices_updated": False,
    }

    activity  = _read_recent_activity(_config.get("max_activity_entries", 50))
    agent_ctx = _gather_agent_context()
    tool_ctx  = _gather_tool_context()
    best_prac = _read_best_practices()

    # Activity summary string
    if activity:
        lines = []
        for ev in activity[-20:]:
            lines.append(
                f"- Job {ev.get('job_id','?')}: {ev.get('status','?')} | "
                f"'{ev.get('topic','?')[:60]}' | model={ev.get('model','?')} | "
                f"{ev.get('duration_secs','?')}s"
            )
        activity_summary = "\n".join(lines)
    else:
        activity_summary = "No recent activity recorded yet."

    # ── 1. Best practices ────────────────────────────────────────────────────
    bp_prompt = (
        f"You are a self-improvement AI for a multi-agent research platform.\n"
        f"Cycle type: {trigger.upper()} | Timestamp: {ts}{run_ctx_str}\n\n"
        f"CURRENT BEST PRACTICES:\n{best_prac or 'None documented yet.'}\n\n"
        f"RECENT JOB ACTIVITY:\n{activity_summary}\n\n"
        f"Your task:\n"
        f"1. Identify 2-4 SPECIFIC, ACTIONABLE best practices from the evidence above.\n"
        f"2. Do NOT repeat existing ones verbatim — evolve or extend them.\n"
        f"Output a Markdown document starting with:\n"
        f"# Best Practices — Multi-Agent Orchestration\n"
        f"## Last updated: {ts} ({trigger} cycle)\n\nMax 800 words."
    )
    bp_response = _call_llm(bp_prompt)
    if bp_response and not bp_response.startswith("[LLM"):
        BEST_PRACTICES_PATH.write_text(bp_response, encoding="utf-8")
        results["best_practices_updated"] = True
        logger.info("BEST_PRACTICES.md updated.")

    # ── 2. Per-agent evolution (NEW) ─────────────────────────────────────────
    evo = _evolve_agents(activity_summary, trigger, run_context)
    results["changes"]  += evo["changes"]
    results["proposals"] += evo["proposals"]

    # ── 3. Tool description improvements (legacy) ────────────────────────────
    tool_prompt = (
        f"You are reviewing tool descriptions for AI agents.\n"
        f"Cycle triggered by: {trigger.upper()} at {ts}{run_ctx_str}\n\n"
        f"TOOLS:\n{tool_ctx[:2000]}\n\n"
        f"For each CUSTOM tool, evaluate if the description tells an LLM:\n"
        f"- What it does, what input it expects, what it returns.\n\n"
        f"Output a JSON array:\n"
        f'[{{"tool_id": "my_tool", "suggested_description": "improved text", "confidence": 0.0}}]\n\n'
        f"Only tools where improvement is CLEAR (confidence > 0.85). Output ONLY JSON."
    )
    tool_suggestions = _parse_json_response(_call_llm(tool_prompt))
    if isinstance(tool_suggestions, list):
        for sug in tool_suggestions:
            if not isinstance(sug, dict): continue
            tid  = sug.get("tool_id", "")
            val  = sug.get("suggested_description", "")
            conf = float(sug.get("confidence", 0))
            if conf >= 0.85 and tid and val and _config.get("auto_apply_safe"):
                from tool_registry import update_tool, get_tool
                t = get_tool(tid)
                if t and not t.get("builtin"):
                    update_tool(tid, {"description": val})
                    results["changes"].append(f"Tool '{tid}' description updated (conf={conf:.0%})")

    # ── 4. Write legacy flat proposals file + improvement log ────────────────
    if results["proposals"]:
        existing  = PROPOSALS_PATH.read_text(encoding="utf-8") if PROPOSALS_PATH.exists() else ""
        new_block = f"\n## Proposals — {ts} [{trigger}]\n\n" + "\n\n".join(results["proposals"]) + "\n"
        PROPOSALS_PATH.write_text(existing + new_block, encoding="utf-8")

    run_tag   = f"[{trigger}]"
    if run_context:
        run_tag += f" job='{run_context.get('job_id','?')}' topic='{run_context.get('topic','')[:40]}'"

    log_entry = (
        f"\n## Cycle: {ts} {run_tag}\n"
        f"- Best practices updated: {results['best_practices_updated']}\n"
        f"- Auto-applied changes:   {len(results['changes'])}\n"
        f"- Proposals queued:       {len(results['proposals'])}\n"
    )
    if results["changes"]:
        log_entry += "\n### Changes applied:\n" + "\n".join(f"- {c}" for c in results["changes"]) + "\n"

    with open(IMPROVEMENT_LOG, "a", encoding="utf-8") as f:
        f.write(log_entry)

    logger.info(f"Cycle [{trigger}] done: {len(results['changes'])} changes, {len(results['proposals'])} proposals.")
    return results


# ─────────────────────────────────────────────────────────────────────────────
# JSON parse helpers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_json_response(text: str) -> list:
    """Extract and parse a JSON *array* from LLM response."""
    if not text or text.startswith("[LLM"): return []
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m: return []
    try:    return json.loads(m.group(0))
    except: return []


def _parse_json_obj(text: str) -> dict:
    """Extract and parse a JSON *object* from LLM response."""
    if not text or text.startswith("[LLM"): return {}
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m: return {}
    try:    return json.loads(m.group(0))
    except: return {}


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
            f"🔄 [{trigger}] Cycle complete — "
            f"Changes: {len(results['changes'])} | "
            f"Proposals: {len(results['proposals'])} | "
            f"BP: {'updated' if results['best_practices_updated'] else 'unchanged'}"
        ),
        "ts": time.time(),
    })


def _notify_telegram(results: dict) -> None:
    try:
        from telegram_bot import notify_message
        trigger = results.get("trigger", "scheduled")
        summary = (
            f"🔄 Self-improvement [{trigger}]\n"
            f"Changes: {len(results['changes'])}\n"
            f"Proposals: {len(results['proposals'])}\n"
            f"Best practices: {'updated' if results['best_practices_updated'] else 'unchanged'}\n"
        )
        if results["changes"]:
            summary += "\nChanges:\n" + "\n".join(f"• {c}" for c in results["changes"][:5])
        notify_message(summary)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler
# ─────────────────────────────────────────────────────────────────────────────

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
                    results  = _run_improvement_cycle()
                    last_run = time.time()
                    _broadcast_results(results)
                    cfg = load_config()
                    if cfg.get("notify_telegram"): _notify_telegram(results)
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
        logger.info("Self-improver scheduler started.")


def trigger_improvement_cycle() -> None:
    """Manual non-blocking trigger."""
    def _run():
        if not _lock.acquire(blocking=False):
            logger.info("Self-improver busy — manual trigger skipped.")
            return
        try:
            results = _run_improvement_cycle()
            _broadcast_results(results)
            cfg = _config or load_config()
            if cfg.get("notify_telegram"): _notify_telegram(results)
        except Exception as e:
            logger.exception(f"Manual cycle failed: {e}")
        finally:
            _lock.release()
    threading.Thread(target=_run, daemon=True, name="si-manual").start()


# Legacy aliases
def start(interval_hours=None):
    cfg = load_config()
    if not cfg.get("enabled", True): return False
    if interval_hours:
        cfg["interval_hours"] = interval_hours
        save_config(cfg)
    start_scheduler()
    return True

def run_now() -> dict:
    load_config()
    return _run_improvement_cycle()


# ─────────────────────────────────────────────────────────────────────────────
# Init
# ─────────────────────────────────────────────────────────────────────────────

def _init_best_practices() -> None:
    if not BEST_PRACTICES_PATH.exists():
        BEST_PRACTICES_PATH.write_text(
            "# Best Practices — Multi-Agent Orchestration\n\n"
            "> Auto-maintained by the self-improvement service.\n\n"
            "## Getting Started\n\n"
            "1. Use `llama3.2:3b` or larger for complex research tasks.\n"
            "2. Keep research topics specific — broad topics produce weaker reports.\n"
            "3. Custom agents run after the Writer and receive the full report as context.\n"
            "4. Filesystem access must be explicitly granted before agents can read files.\n",
            encoding="utf-8",
        )

_init_best_practices()
load_config()
