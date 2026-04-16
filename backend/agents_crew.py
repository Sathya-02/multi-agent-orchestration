"""
agents_crew.py — Dynamic agent builder + job runner

Fix history:
  19. [FIX] tokens always zero — extract token_usage from CrewAI CrewOutput
  20. [FIX] ChatOpenAI/OPENAI_API_KEY error — use ChatOllama (crewai 0.51)
  21. [FIX] tokens still zero — set model_name on ChatOllama so crewai's
      TokenCalcHandler wires up; read from crew.usage_metrics not result_obj
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

from crewai import Agent, Crew, Process, Task

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Safety net: crewai 0.51 validates OPENAI_API_KEY at import time even when
# Ollama is used.  Dummy value satisfies the validator.
# ---------------------------------------------------------------------------
if not os.environ.get("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = "sk-dummy-not-used"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_MAX_ITER  = 15
DEFAULT_VERBOSE   = True
DEFAULT_GOAL      = "Complete the assigned task thoroughly and accurately."
DEFAULT_BACKSTORY = "A capable AI assistant focused on delivering high-quality results."

PHASE_ORDER = ["researcher", "analyst", "writer", "critic", "coordinator"]

_LIMIT_SENTINELS = [
    "max iterations", "iteration limit", "time limit",
    "max_iter", "agent stopped", "agentstopped",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _topic_slug(topic: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^\w\s-]", "", topic.lower())
    slug = re.sub(r"[\s_-]+", "_", slug).strip("_")
    return slug[:max_len].strip("_")


def _build_report_text(
    topic: str, job_id: str, generated: datetime, model: str,
    active_labels: list, body: str, temperature: float, num_ctx: int,
) -> str:
    header = (
        f"# Report: {topic}\n"
        f"Job ID    : {job_id}\n"
        f"Generated : {generated.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        f"Model     : {model}\n"
        f"Agents    : {', '.join(active_labels) or 'n/a'}\n"
        f"Temp      : {temperature}   ctx: {num_ctx}\n"
        f"{'-' * 60}\n"
    )
    clean_body = re.sub(r"\n{3,}", "\n\n", body.strip())
    return header + "\n" + clean_body + f"\n{'-' * 60}\n[End of report — job {job_id}]\n"


def _is_sentinel(text: str) -> bool:
    return any(s in text.lower() for s in _LIMIT_SENTINELS)


# ---------------------------------------------------------------------------
# LLM / settings helpers
# ---------------------------------------------------------------------------

def get_llm_config() -> dict:
    try:
        from settings import load_settings
        s = load_settings()
        return {
            "temperature": s.get("temperature", 0.1),
            "num_ctx":     s.get("num_ctx", 4096),
            "num_predict": s.get("num_predict", 1024),
        }
    except Exception:
        return {"temperature": 0.1, "num_ctx": 4096, "num_predict": 1024}


def _build_ollama_llm(model: str, temperature: float, num_ctx: int, num_predict: int):
    """
    Build a ChatOllama instance for crewai 0.51.

    KEY: crewai 0.51 checks hasattr(self.llm, 'model_name') to wire up
    TokenCalcHandler (the tiktoken callback that counts tokens).  ChatOllama
    exposes .model not .model_name, so we set model_name manually after
    construction so the callback IS registered and tokens are counted.
    """
    ollama_kwargs = dict(
        model       = model,
        base_url    = "http://localhost:11434",
        temperature = temperature,
        num_ctx     = num_ctx,
        num_predict = num_predict,
    )

    llm = None

    try:
        from langchain_ollama import ChatOllama
        llm = ChatOllama(**ollama_kwargs)
    except ImportError:
        pass

    if llm is None:
        try:
            from langchain_community.chat_models import ChatOllama  # type: ignore
            llm = ChatOllama(**ollama_kwargs)
        except ImportError:
            pass

    if llm is None:
        raise RuntimeError(
            "Could not import ChatOllama. "
            "Run: pip install langchain-ollama"
        )

    # ★ Critical fix: crewai 0.51 TokenCalcHandler checks model_name to wire
    # up tiktoken counting.  ChatOllama uses .model, not .model_name.
    if not getattr(llm, "model_name", None):
        llm.model_name = model

    return llm


# ---------------------------------------------------------------------------
# Broadcast helpers
# ---------------------------------------------------------------------------

def _emit_activity(
    broadcast_fn, agent_id: str, label: str, text: str,
    *, phase: bool = False, task_result: bool = False,
) -> None:
    if not broadcast_fn:
        return
    try:
        broadcast_fn({
            "type": "agent_activity", "agent_id": agent_id,
            "label": label, "text": text,
            "phase": phase, "task_result": task_result,
        })
    except Exception as exc:
        logger.debug("_emit_activity error: %s", exc)


def _emit_working(broadcast_fn, agent_id: str, label: str, text: str) -> None:
    if not broadcast_fn:
        return
    try:
        broadcast_fn({"type": "agent_working", "agent_id": agent_id,
                      "label": label, "text": text})
    except Exception as exc:
        logger.debug("_emit_working error: %s", exc)


# ---------------------------------------------------------------------------
# Step / task callbacks
# ---------------------------------------------------------------------------

def _make_step_callback(broadcast_fn, agents_map, labels_map, ordered_ids):
    role_to_id = {agent.role.lower(): aid for aid, agent in agents_map.items()}
    state = {"current": ordered_ids[0] if ordered_ids else ""}

    def _cb(step_output: Any) -> None:
        items = step_output if isinstance(step_output, list) else [step_output]
        for item in items:
            agent_str = ""
            try:
                raw = getattr(item, "agent", None)
                agent_str = (str(raw.role) if hasattr(raw, "role") else str(raw or "")).strip().lower()
            except Exception:
                pass

            if agent_str:
                matched = role_to_id.get(agent_str)
                if matched:
                    state["current"] = matched
                else:
                    for role, aid in role_to_id.items():
                        if agent_str in role or role in agent_str:
                            state["current"] = aid
                            break

            aid, label = state["current"], labels_map.get(state["current"], state["current"])

            text = ""
            try:
                if getattr(item, "log", None):      text = str(item.log).strip()
                elif hasattr(item, "return_values"): text = str(item.return_values.get("output", "")).strip()
                elif getattr(item, "text", None):   text = str(item.text).strip()
                else:                                text = str(item).strip()
            except Exception:
                pass

            if not text:
                if any(s in str(item).lower() for s in _LIMIT_SENTINELS):
                    _emit_activity(broadcast_fn, aid, label,
                                   f"\u26a0\ufe0f {label} hit iteration limit", phase=False)
                    logger.warning("Agent %s hit iteration/time limit", aid)
                continue

            if len(text) > 350:
                text = text[:347] + "\u2026"
            _emit_working(broadcast_fn, aid, label, text)
            _emit_activity(broadcast_fn, aid, label, text, phase=False)

    return _cb


def _make_task_callback(broadcast_fn, agent_id: str, label: str):
    def _cb(task_output: Any) -> None:
        try:
            text = str(getattr(task_output, "raw",
                   getattr(task_output, "result", task_output))).strip()
            if _is_sentinel(text):
                logger.warning("Agent %s hit sentinel: %s", agent_id, text)
                _emit_activity(broadcast_fn, agent_id, label,
                               f"\u26a0\ufe0f {label} hit iteration/time limit.",
                               phase=False, task_result=False)
                return
            if len(text) > 400:
                text = text[:397] + "\u2026"
            _emit_activity(broadcast_fn, agent_id, label,
                           f"\u2705 {label} task done: {text[:200]}",
                           phase=False, task_result=True)
        except Exception as exc:
            logger.debug("task_callback error: %s", exc)
    return _cb


# ---------------------------------------------------------------------------
# Main job runner
# ---------------------------------------------------------------------------

def run_crew(
    topic: str,
    mode: str = "research",
    model: str = "phi3:mini",
    uploaded_files: list | None = None,
    upload_dir: Path | None = None,
    report_dir: Path | None = None,
    agent_dir: Path | None = None,
    tool_dir: Path | None = None,
    broadcast_fn: Optional[Callable] = None,
    spawn_requests: list | None = None,
    spawn_enabled: bool = False,
) -> tuple:
    """Return (full_report, report_filename, format, tokens_in, tokens_out)."""
    import json

    generated = datetime.utcnow()
    job_id    = str(uuid.uuid4())[:8]

    report_dir = report_dir or Path("reports")
    report_dir.mkdir(parents=True, exist_ok=True)

    # ── LLM ───────────────────────────────────────────────────────────────
    llm_cfg     = get_llm_config()
    temperature = llm_cfg.get("temperature", 0.1)
    num_ctx     = llm_cfg.get("num_ctx", 4096)
    num_predict = llm_cfg.get("num_predict", 1024)

    llm = _build_ollama_llm(model, temperature, num_ctx, num_predict)
    logger.info("LLM ready: model=%s model_name=%s", model, getattr(llm, "model_name", "?"))

    # ── Load agents ───────────────────────────────────────────────────────
    agents_map: dict[str, Agent] = {}
    labels_map: dict[str, str]   = {}

    if agent_dir and Path(agent_dir).exists():
        for p in sorted(Path(agent_dir).glob("*.json")):
            try:
                d = json.loads(p.read_text())
                if not d.get("enabled", True):
                    continue
                aid       = d.get("name") or p.stem
                role      = d.get("role",      aid.replace("_", " ").title())
                goal      = d.get("goal",      DEFAULT_GOAL)
                backstory = d.get("backstory", DEFAULT_BACKSTORY)
                agents_map[aid] = Agent(
                    role=role, goal=goal, backstory=backstory, llm=llm,
                    verbose=DEFAULT_VERBOSE, max_iter=DEFAULT_MAX_ITER,
                    allow_delegation=False,
                )
                labels_map[aid] = role
            except Exception as exc:
                logger.warning("Skipping agent %s: %s", p, exc)

    if not agents_map:
        agents_map["researcher"] = Agent(
            role="Researcher",
            goal=f"Research the topic thoroughly: {topic}",
            backstory="An experienced researcher skilled at finding and synthesising information.",
            llm=llm, verbose=DEFAULT_VERBOSE, max_iter=DEFAULT_MAX_ITER,
            allow_delegation=False,
        )
        labels_map["researcher"] = "Researcher"

    # ── Build tasks ───────────────────────────────────────────────────────
    tasks: list[Task] = []
    for aid, agent in agents_map.items():
        label = labels_map.get(aid, aid)
        desc  = (
            f"You are the {label}. Your job is to {agent.goal}\n\n"
            f"Topic / request: {topic}\n\nMode: {mode}\n"
            f"Produce a detailed, well-structured response."
        )
        if uploaded_files and upload_dir:
            paths = [str(Path(upload_dir) / fn) for fn in uploaded_files]
            desc += f"\n\nRelevant uploaded files: {', '.join(paths)}"
        tasks.append(Task(
            description=desc,
            expected_output=f"A thorough, well-structured output from the {label}.",
            agent=agent,
            callback=_make_task_callback(broadcast_fn, aid, label),
        ))

    agents_with_tasks = {t.agent for t in tasks if t.agent}
    available_ids     = list(agents_map.keys())
    phase_ids         = [p for p in PHASE_ORDER if p in available_ids]
    extra_ids         = [a for a in available_ids if a not in PHASE_ORDER]
    ordered_ids       = phase_ids + extra_ids
    agent_list        = [agents_map[aid] for aid in ordered_ids if aid in agents_map]

    if ordered_ids:
        fid, flabel = ordered_ids[0], labels_map.get(ordered_ids[0], ordered_ids[0])
        _emit_activity(broadcast_fn, fid, flabel, f"\U0001f50d {flabel} is starting\u2026", phase=True)
        _emit_working(broadcast_fn, fid, flabel, "Thinking\u2026")

    crew = Crew(
        agents=agent_list, tasks=tasks,
        process=Process.sequential, memory=False,
        step_callback=_make_step_callback(broadcast_fn, agents_map, labels_map, ordered_ids),
        verbose=True,
    )

    logger.info("Kicking off crew — %d agents / %d tasks", len(agent_list), len(tasks))

    try:
        result_obj = crew.kickoff()
    except Exception as crew_exc:
        err_str = str(crew_exc)
        logger.error("crew.kickoff() raised: %s", err_str)
        active_aids = [aid for aid in ordered_ids if agents_map.get(aid) in agents_with_tasks] or ordered_ids[:1]
        for aid in active_aids:
            label = labels_map.get(aid, aid)
            msg = (
                f"\u26a0\ufe0f {label} stopped: agent hit iteration/time limit. Try a larger model."
                if any(s in err_str.lower() for s in _LIMIT_SENTINELS)
                else f"\u274c {label} failed: {err_str[:200]}"
            )
            _emit_activity(broadcast_fn, aid, label, msg, phase=False)
        raise

    result_text = str(result_obj) if result_obj else "No output produced."

    # ── Build report ─────────────────────────────────────────────────────
    active_labels   = [labels_map.get(aid, aid) for aid in ordered_ids if agents_map.get(aid) in agents_with_tasks]
    slug            = _topic_slug(topic)
    ts_str          = generated.strftime("%Y%m%d_%H%M%S")
    report_filename = f"report_{ts_str}_{slug}.txt"
    report_path     = report_dir / report_filename

    full_report = _build_report_text(
        topic=topic, job_id=job_id, generated=generated, model=model,
        active_labels=active_labels, body=result_text,
        temperature=temperature, num_ctx=num_ctx,
    )
    report_path.write_text(full_report, encoding="utf-8")
    logger.info("Report saved: %s", report_path)

    for aid in ordered_ids:
        if agents_map.get(aid) in agents_with_tasks:
            label = labels_map.get(aid, aid)
            _emit_activity(broadcast_fn, aid, label, f"\u2705 {label} complete",
                           phase=False, task_result=True)

    # ── Token usage ─────────────────────────────────────────────────────
    # crewai 0.51: tokens are on crew.usage_metrics (UsageMetrics), NOT on
    # result_obj.token_usage.  They are populated by TokenCalcHandler which
    # only wires up when llm.model_name is set (fixed in _build_ollama_llm).
    t_in  = 0
    t_out = 0
    try:
        um = getattr(crew, "usage_metrics", None)
        if um is None:
            # fallback: manually call calculate_usage_metrics
            um = crew.calculate_usage_metrics()
        if um:
            t_in  = int(getattr(um, "prompt_tokens",     0) or 0)
            t_out = int(getattr(um, "completion_tokens", 0) or 0)
            if t_in == 0 and t_out == 0:
                total = int(getattr(um, "total_tokens", 0) or 0)
                t_in  = total // 2
                t_out = total - t_in
        logger.info("Token usage — in: %d  out: %d", t_in, t_out)
    except Exception as exc:
        logger.warning("Could not read usage_metrics: %s", exc)

    return full_report, report_filename, "txt", t_in, t_out
