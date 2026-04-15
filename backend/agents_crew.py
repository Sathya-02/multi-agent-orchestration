"""
agents_crew.py — Dynamic agent builder + job runner

Fix history:
  ... (see git log for full history)
 18. [FIX] DEFAULT_MAX_ITER raised 8 → 15; num_predict raised 512 → 1024;
     temperature lowered 0.2 → 0.1 to stop 'iteration limit' sentinel from
     appearing as task output. _make_task_callback now intercepts sentinel
     strings and emits a warning instead of broadcasting garbage results.
"""
import logging
import time
import uuid
from pathlib import Path
from typing import Callable, Dict, List, Optional, Any

from crewai import Agent, Crew, Task, Process
from langchain_ollama import ChatOllama
from model_config import get_llm_config
from agent_registry import get_active_agents, read_skills_file
from tools import make_tools
from tool_registry import get_active_tools, instantiate_tool
from fs_tools import FSReadTool, FSWriteTool, FSEditTool, FSListTool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool lists per role
# summariser MUST be in every role so the LLM always has a path to Final Answer
# ---------------------------------------------------------------------------
ROLE_TOOLS: dict[str, list[str]] = {
    "coordinator": ["web_search", "summariser", "request_new_agent"],
    "researcher":  ["web_search", "knowledge_base_search", "summariser",
                    "read_uploaded_file", "calculator"],
    "analyst":     ["data_analyser", "knowledge_base_search", "summariser",
                    "read_uploaded_file", "calculator"],
    "writer":      ["summariser", "read_uploaded_file"],
    "fs_agent":    ["fs_read_file", "fs_list_dir", "fs_write_file", "fs_edit_file",
                    "summariser"],
}
DEFAULT_TOOLS = ["web_search", "summariser", "read_uploaded_file", "calculator"]

FS_TOOL_MAP = {
    "fs_read_file":  FSReadTool,
    "fs_list_dir":   FSListTool,
    "fs_write_file": FSWriteTool,
    "fs_edit_file":  FSEditTool,
}

PHASE_ORDER = ["coordinator", "researcher", "analyst", "writer"]

# FIX #18 — raised from 8 → 15 so agents on small models (phi3:mini, mistral)
# have enough headroom to reach a Final Answer without hitting the limit.
DEFAULT_MAX_ITER = 15

# Sentinel substrings emitted by CrewAI when an agent exhausts its budget
_LIMIT_SENTINELS = (
    "iteration limit",
    "time limit",
    "max iterations",
    "max_iterations",
    "agent stopped due to",
    "stopped due to iteration",
    "stopped due to time",
)


# ---------------------------------------------------------------------------
# Agent construction
# ---------------------------------------------------------------------------

def build_agents(mode: str = "research") -> dict[str, Agent]:
    base_cfg = get_llm_config()
    # FIX #18 — increase num_predict so the LLM can complete multi-step
    # reasoning in a single generation instead of truncating and looping.
    # Lower temperature for more deterministic Final Answer outputs.
    base_cfg["num_ctx"]     = base_cfg.get("num_ctx", 4096)
    base_cfg["num_predict"] = max(base_cfg.get("num_predict", 0) or 0, 1024)
    base_cfg["temperature"] = base_cfg.get("temperature") if base_cfg.get("temperature") is not None else 0.1
    if base_cfg["temperature"] > 0.3:
        base_cfg["temperature"] = 0.1  # clamp high values that cause looping

    llm = ChatOllama(**base_cfg)

    agents = {}
    for defn in get_active_agents():
        aid = defn["id"]

        skills    = read_skills_file(aid) or {}
        role      = skills.get("role")      or defn["role"]
        goal      = skills.get("goal")      or defn["goal"]
        backstory  = skills.get("backstory") or defn["backstory"]
        max_iter  = int(skills.get("max_iter") or defn.get("max_iter") or DEFAULT_MAX_ITER)

        skill_tools = skills.get("tools")
        reg_tools   = defn.get("tools")
        tool_names  = list(skill_tools or reg_tools or ROLE_TOOLS.get(aid, DEFAULT_TOOLS))

        # Always guarantee summariser is present
        if "summariser" not in tool_names:
            tool_names.append("summariser")

        tools = []
        for name in tool_names:
            if name in FS_TOOL_MAP:
                tools.append(FS_TOOL_MAP[name]())
            else:
                tools.extend(make_tools([name]))

        agents[aid] = Agent(
            role             = role,
            goal             = goal,
            backstory        = backstory,
            tools            = tools,
            llm              = llm,
            verbose          = True,
            allow_delegation = False,
            max_iter         = max_iter,
        )
    return agents


# ---------------------------------------------------------------------------
# Broadcast helpers
# ---------------------------------------------------------------------------

def _broadcast(broadcast_fn: Optional[Callable], msg: dict) -> None:
    """Fire-and-forget — never block the worker thread."""
    if broadcast_fn is None:
        return
    try:
        broadcast_fn(msg)
    except Exception as exc:
        logger.debug("broadcast error (ignored): %s", exc)


def _emit_activity(
    broadcast_fn: Optional[Callable],
    agent_id: str,
    label: str,
    message: str,
    phase: bool = False,
    task_result: bool = False,
) -> None:
    _broadcast(broadcast_fn, {
        "type":        "agent_activity",
        "agent":       agent_id,
        "label":       label,
        "message":     message,
        "phase":       phase,
        "task_result": task_result,
        "ts":          time.time(),
    })


def _emit_working(
    broadcast_fn: Optional[Callable],
    agent_id: str,
    label: str,
    thought: str = "",
) -> None:
    _broadcast(broadcast_fn, {
        "type":   "agent_working",
        "agent":  agent_id,
        "label":  label,
        "thought": thought,
        "ts":     time.time(),
    })


def _is_sentinel(text: str) -> bool:
    """Return True if text is a CrewAI iteration/time-limit sentinel string."""
    low = text.lower()
    return any(s in low for s in _LIMIT_SENTINELS)


# ---------------------------------------------------------------------------
# CrewAI step_callback factory
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

            # FIX #18 — if the task output IS a sentinel string (e.g.
            # "Agent stopped due to iteration limit or time limit."),
            # do NOT broadcast it as a valid result. Emit a warning
            # instead so the feed shows the real cause clearly.
            if _is_sentinel(text):
                logger.warning(
                    "Agent %s task output was a limit sentinel: %s", agent_id, text
                )
                _emit_activity(
                    broadcast_fn, agent_id, label,
                    f"\u26a0\ufe0f {label} hit iteration/time limit before finishing. "
                    f"Consider using a larger model or reducing task complexity.",
                    phase=False, task_result=False,
                )
                return  # do NOT emit as task_result

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
    uploaded_files: Optional[List[str]] = None,
    upload_dir: Optional[Path] = None,
    report_dir: Optional[Path] = None,
    agent_dir: Optional[Path] = None,
    tool_dir: Optional[Path] = None,
    broadcast_fn: Optional[Callable] = None,
    spawn_requests: Optional[List[Dict]] = None,
    spawn_enabled: bool = True,
) -> tuple[str, str, str, int, int]:
    from tasks_crew import build_tasks

    uploaded_files = uploaded_files or []
    report_dir = report_dir or Path("reports")
    report_dir.mkdir(parents=True, exist_ok=True)

    logger.info("run_crew started — topic=%r mode=%s model=%s", topic, mode, model)

    agents_map = build_agents(mode=mode)
    if not agents_map:
        raise RuntimeError(
            "No active agents found. Activate at least one agent in the Agents panel."
        )

    all_defns = {d["id"]: d for d in get_active_agents()}

    def _label(aid: str) -> str:
        d = all_defns.get(aid, {})
        return d.get("label") or d.get("role") or aid

    labels_map = {aid: _label(aid) for aid in agents_map}

    for aid, label in labels_map.items():
        _emit_activity(broadcast_fn, aid, label, f"\U0001f7e1 {label} queued", phase=True)

    tasks = build_tasks(
        topic          = topic,
        agents         = agents_map,
        mode           = mode,
        uploaded_files = uploaded_files,
    )

    for task in tasks:
        if task.agent:
            aid   = next((k for k, v in agents_map.items() if v is task.agent), "")
            label = labels_map.get(aid, str(task.agent.role))
            task.callback = _make_task_callback(broadcast_fn, aid, label)

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

    report_filename = f"report_{uuid.uuid4().hex[:8]}.md"
    report_path     = report_dir / report_filename
    report_path.write_text(result_text, encoding="utf-8")
    logger.info("Report saved: %s", report_path)

    for aid in ordered_ids:
        if agents_map.get(aid) in agents_with_tasks:
            label = labels_map.get(aid, aid)
            _emit_activity(
                broadcast_fn, aid, label,
                f"\u2705 {label} complete",
                phase=False, task_result=True,
            )

    return result_text, report_filename, "md", 0, 0
