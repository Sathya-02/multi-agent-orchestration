"""
agents_crew.py — Dynamic agent builder + job runner

Fix history:
  19. [FIX] tokens always zero — extract token_usage from CrewAI CrewOutput
  20. [FIX] ChatOpenAI/OPENAI_API_KEY error when Ollama model selected.
      crewai==0.51.0 does not have crewai.LLM (added in 0.80+).
      Now uses ChatOllama from langchain_ollama as the llm= arg.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

from crewai import Agent, Crew, Process, Task

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Safety net: crewai 0.51 internally imports openai and validates the key
# even when using Ollama.  Set a dummy value so the validator passes.
# ---------------------------------------------------------------------------
if not os.environ.get("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = "sk-dummy-not-used"

# ---------------------------------------------------------------------------
# Constants / tunables
# ---------------------------------------------------------------------------

DEFAULT_MAX_ITER   = 15
DEFAULT_VERBOSE    = True
DEFAULT_GOAL       = "Complete the assigned task thoroughly and accurately."
DEFAULT_BACKSTORY  = "A capable AI assistant focused on delivering high-quality results."

PHASE_ORDER = [
    "researcher",
    "analyst",
    "writer",
    "critic",
    "coordinator",
]

_LIMIT_SENTINELS = [
    "max iterations",
    "iteration limit",
    "time limit",
    "max_iter",
    "agent stopped",
    "agentstopped",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _topic_slug(topic: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^\w\s-]", "", topic.lower())
    slug = re.sub(r"[\s_-]+", "_", slug).strip("_")
    return slug[:max_len].strip("_")


def _build_report_text(
    topic: str,
    job_id: str,
    generated: datetime,
    model: str,
    active_labels: list[str],
    body: str,
    temperature: float,
    num_ctx: int,
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
    metadata = (
        f"\n{'-' * 60}\n"
        f"[End of report — job {job_id}]\n"
    )
    return header + "\n" + clean_body + metadata


def _is_sentinel(text: str) -> bool:
    low = text.lower()
    return any(s in low for s in _LIMIT_SENTINELS)


# ---------------------------------------------------------------------------
# LLM config helper
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


# ---------------------------------------------------------------------------
# Build a ChatOllama LLM instance (crewai 0.51 uses langchain BaseChatModel)
# ---------------------------------------------------------------------------

def _build_ollama_llm(model: str, temperature: float, num_ctx: int, num_predict: int):
    """
    crewai 0.51.0 accepts any langchain BaseChatModel as the llm= argument.
    crewai.LLM was only introduced in crewai 0.80+, so we use ChatOllama
    from langchain_ollama (already in requirements.txt).
    """
    ollama_kwargs = dict(
        model       = model,
        base_url    = "http://localhost:11434",
        temperature = temperature,
        num_ctx     = num_ctx,
        num_predict = num_predict,
    )

    # Primary: langchain_ollama (preferred, already pinned in requirements.txt)
    try:
        from langchain_ollama import ChatOllama
        return ChatOllama(**ollama_kwargs)
    except ImportError:
        pass

    # Fallback: langchain_community
    try:
        from langchain_community.chat_models import ChatOllama  # type: ignore
        return ChatOllama(**ollama_kwargs)
    except ImportError:
        pass

    logger.error(
        "Neither langchain_ollama nor langchain_community is installed. "
        "Run: pip install langchain-ollama"
    )
    return None


# ---------------------------------------------------------------------------
# Broadcast helpers
# ---------------------------------------------------------------------------

def _emit_activity(
    broadcast_fn: Optional[Callable],
    agent_id: str,
    label: str,
    text: str,
    *,
    phase: bool = False,
    task_result: bool = False,
) -> None:
    if broadcast_fn is None:
        return
    try:
        broadcast_fn({
            "type":        "agent_activity",
            "agent_id":    agent_id,
            "label":       label,
            "text":        text,
            "phase":       phase,
            "task_result": task_result,
        })
    except Exception as exc:
        logger.debug("_emit_activity error: %s", exc)


def _emit_working(
    broadcast_fn: Optional[Callable],
    agent_id: str,
    label: str,
    text: str,
) -> None:
    if broadcast_fn is None:
        return
    try:
        broadcast_fn({
            "type":     "agent_working",
            "agent_id": agent_id,
            "label":    label,
            "text":     text,
        })
    except Exception as exc:
        logger.debug("_emit_working error: %s", exc)


# ---------------------------------------------------------------------------
# Step / task callbacks
# ---------------------------------------------------------------------------

def _make_step_callback(
    broadcast_fn: Optional[Callable],
    agents_map: dict,
    labels_map: dict,
    ordered_ids: list,
) -> Callable:
    role_to_id: dict[str, str] = {}
    for aid, agent in agents_map.items():
        role_to_id[agent.role.lower()] = aid

    state = {"current": ordered_ids[0] if ordered_ids else ""}

    def _cb(step_output: Any) -> None:
        items = step_output if isinstance(step_output, list) else [step_output]
        for item in items:
            agent_str = ""
            try:
                raw_agent = getattr(item, "agent", None)
                if raw_agent is None:
                    agent_str = ""
                elif hasattr(raw_agent, "role"):
                    agent_str = str(raw_agent.role).strip().lower()
                else:
                    agent_str = str(raw_agent).strip().lower()
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

            aid   = state["current"]
            label = labels_map.get(aid, aid)

            text = ""
            try:
                if hasattr(item, "log") and item.log:
                    text = str(item.log).strip()
                elif hasattr(item, "return_values"):
                    text = str(item.return_values.get("output", "")).strip()
                elif hasattr(item, "text") and item.text:
                    text = str(item.text).strip()
                else:
                    text = str(item).strip()
            except Exception:
                pass

            if not text:
                raw_str = ""
                try:
                    raw_str = str(item).lower()
                except Exception:
                    pass
                if any(s in raw_str for s in _LIMIT_SENTINELS):
                    _emit_activity(
                        broadcast_fn, aid, label,
                        f"\u26a0\ufe0f {label} hit iteration limit — partial result only",
                        phase=False,
                    )
                    logger.warning("Agent %s hit iteration/time limit", aid)
                continue

            if len(text) > 350:
                text = text[:347] + "\u2026"

            _emit_working(broadcast_fn, aid, label, text)
            _emit_activity(broadcast_fn, aid, label, text, phase=False)

    return _cb


def _make_task_callback(
    broadcast_fn: Optional[Callable],
    agent_id: str,
    label: str,
) -> Callable:
    def _cb(task_output: Any) -> None:
        try:
            if hasattr(task_output, "raw"):
                text = str(task_output.raw).strip()
            elif hasattr(task_output, "result"):
                text = str(task_output.result).strip()
            else:
                text = str(task_output).strip()

            if _is_sentinel(text):
                logger.warning("Agent %s task output was a limit sentinel: %s", agent_id, text)
                _emit_activity(
                    broadcast_fn, agent_id, label,
                    f"\u26a0\ufe0f {label} hit iteration/time limit before finishing. "
                    f"Consider using a larger model or reducing task complexity.",
                    phase=False, task_result=False,
                )
                return

            if len(text) > 400:
                text = text[:397] + "\u2026"
            _emit_activity(
                broadcast_fn, agent_id, label,
                f"\u2705 {label} task done: {text[:200]}",
                phase=False, task_result=True,
            )
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
    uploaded_files: list[str] | None = None,
    upload_dir: Path | None = None,
    report_dir: Path | None = None,
    agent_dir: Path | None = None,
    tool_dir: Path | None = None,
    broadcast_fn: Optional[Callable] = None,
    spawn_requests: list | None = None,
    spawn_enabled: bool = False,
) -> tuple[str, str, str, int, int]:
    """
    Run the CrewAI pipeline and return
    (full_report, report_filename, format, tokens_in, tokens_out).
    """
    import json

    generated = datetime.utcnow()
    job_id    = str(uuid.uuid4())[:8]

    report_dir = report_dir or Path("reports")
    report_dir.mkdir(parents=True, exist_ok=True)

    # ── Build Ollama LLM (ChatOllama via langchain_ollama) ─────────────────
    llm_cfg     = get_llm_config()
    temperature = llm_cfg.get("temperature", 0.1)
    num_ctx     = llm_cfg.get("num_ctx", 4096)
    num_predict = llm_cfg.get("num_predict", 1024)

    llm = _build_ollama_llm(model, temperature, num_ctx, num_predict)
    if llm is None:
        raise RuntimeError(
            "Could not build Ollama LLM. "
            "Ensure langchain-ollama is installed and Ollama is running."
        )

    logger.info("Using Ollama model: %s  temp=%.2f  ctx=%d", model, temperature, num_ctx)

    # ── Load agent definitions ────────────────────────────────────────────
    agents_map: dict[str, Agent] = {}
    labels_map: dict[str, str]   = {}

    def _label(aid: str) -> str:
        return labels_map.get(aid, aid)

    if agent_dir and Path(agent_dir).exists():
        for p in sorted(Path(agent_dir).glob("*.json")):
            try:
                d = json.loads(p.read_text())
                if not d.get("enabled", True):
                    continue
                aid = d.get("name") or p.stem
                role      = d.get("role",      aid.replace("_", " ").title())
                goal      = d.get("goal",      DEFAULT_GOAL)
                backstory = d.get("backstory", DEFAULT_BACKSTORY)

                agents_map[aid] = Agent(
                    role      = role,
                    goal      = goal,
                    backstory = backstory,
                    llm       = llm,
                    verbose   = DEFAULT_VERBOSE,
                    max_iter  = DEFAULT_MAX_ITER,
                    allow_delegation = False,
                )
                labels_map[aid] = role
            except Exception as exc:
                logger.warning("Skipping agent file %s: %s", p, exc)

    # Fallback: at least one default agent
    if not agents_map:
        default_aid = "researcher"
        agents_map[default_aid] = Agent(
            role      = "Researcher",
            goal      = f"Research the topic thoroughly: {topic}",
            backstory = "An experienced researcher skilled at finding and synthesising information.",
            llm       = llm,
            verbose   = DEFAULT_VERBOSE,
            max_iter  = DEFAULT_MAX_ITER,
            allow_delegation = False,
        )
        labels_map[default_aid] = "Researcher"

    # ── Build tasks ───────────────────────────────────────────────────────
    tasks: list[Task] = []
    for aid, agent in agents_map.items():
        label = labels_map.get(aid, aid)
        task_desc = (
            f"You are the {label}. Your job is to {agent.goal}\n\n"
            f"Topic / request: {topic}\n\n"
            f"Mode: {mode}\n"
            f"Produce a detailed, well-structured response."
        )
        if uploaded_files and upload_dir:
            paths = [str(Path(upload_dir) / fn) for fn in uploaded_files]
            task_desc += f"\n\nRelevant uploaded files: {', '.join(paths)}"

        t = Task(
            description     = task_desc,
            expected_output = f"A thorough, well-structured output from the {label}.",
            agent           = agent,
            callback        = _make_task_callback(broadcast_fn, aid, label),
        )
        tasks.append(t)

    agents_with_tasks: set = {task.agent for task in tasks if task.agent is not None}

    available_ids = list(agents_map.keys())
    phase_ids     = [p for p in PHASE_ORDER if p in available_ids]
    extra_ids     = [a for a in available_ids if a not in PHASE_ORDER]
    ordered_ids   = phase_ids + extra_ids

    agent_list = [agents_map[aid] for aid in ordered_ids if aid in agents_map]

    if ordered_ids:
        first_aid   = ordered_ids[0]
        first_label = labels_map.get(first_aid, first_aid)
        _emit_activity(
            broadcast_fn, first_aid, first_label,
            f"\U0001f50d {first_label} is starting\u2026",
            phase=True,
        )
        _emit_working(broadcast_fn, first_aid, first_label, "Thinking\u2026")

    step_cb = _make_step_callback(broadcast_fn, agents_map, labels_map, ordered_ids)

    crew = Crew(
        agents        = agent_list,
        tasks         = tasks,
        process       = Process.sequential,
        memory        = False,
        step_callback = step_cb,
        verbose       = True,
    )

    logger.info("Kicking off crew — %d agents / %d tasks", len(agent_list), len(tasks))

    try:
        result_obj = crew.kickoff()
    except Exception as crew_exc:
        err_str = str(crew_exc)
        logger.error("crew.kickoff() raised: %s", err_str)
        active_aids = [aid for aid in ordered_ids if agents_map.get(aid) in agents_with_tasks]
        if not active_aids:
            active_aids = ordered_ids[:1]
        for aid in active_aids:
            label = labels_map.get(aid, aid)
            if any(s in err_str.lower() for s in _LIMIT_SENTINELS):
                _emit_activity(
                    broadcast_fn, aid, label,
                    f"\u26a0\ufe0f {label} stopped: agent hit iteration/time limit. "
                    f"Try a larger model or simpler task.",
                    phase=False,
                )
            else:
                _emit_activity(
                    broadcast_fn, aid, label,
                    f"\u274c {label} failed: {err_str[:200]}",
                    phase=False,
                )
        raise

    result_text = str(result_obj) if result_obj else "No output produced."

    # ── Build report ─────────────────────────────────────────────────────
    active_labels = [_label(aid) for aid in ordered_ids if agents_map.get(aid) in agents_with_tasks]
    slug            = _topic_slug(topic)
    ts_str          = generated.strftime("%Y%m%d_%H%M%S")
    report_filename = f"report_{ts_str}_{slug}.txt"
    report_path     = report_dir / report_filename

    full_report = _build_report_text(
        topic         = topic,
        job_id        = job_id,
        generated     = generated,
        model         = model,
        active_labels = active_labels,
        body          = result_text,
        temperature   = temperature,
        num_ctx       = num_ctx,
    )

    report_path.write_text(full_report, encoding="utf-8")
    logger.info("Report saved: %s", report_path)

    for aid in ordered_ids:
        if agents_map.get(aid) in agents_with_tasks:
            label = labels_map.get(aid, aid)
            _emit_activity(
                broadcast_fn, aid, label,
                f"\u2705 {label} complete",
                phase=False, task_result=True,
            )

    # ── Extract token usage from CrewAI result ───────────────────────────
    t_in  = 0
    t_out = 0
    try:
        tu = getattr(result_obj, "token_usage", None) or getattr(result_obj, "usage", None)
        if tu is not None:
            t_in  = int(getattr(tu, "prompt_tokens",     0) or 0)
            t_out = int(getattr(tu, "completion_tokens", 0) or 0)
            # Ollama may only expose total_tokens — split 50/50 as fallback
            if t_in == 0 and t_out == 0:
                total = int(getattr(tu, "total_tokens", 0) or 0)
                t_in  = total // 2
                t_out = total - t_in
    except Exception:
        pass

    return full_report, report_filename, "txt", t_in, t_out
