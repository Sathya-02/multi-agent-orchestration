"""
agents_crew.py — Dynamic agent builder + job runner

Fixes:
  - agent_activity events now fire DURING execution (not before crew.kickoff)
  - Uses CrewAI task callbacks to emit per-agent start/finish
  - broadcast_fn.result() called to ensure messages reach the WS loop
  - agent_working events emitted so 3D board room animates
  - allow_delegation forced False to prevent coordinator hang in CrewAI 0.51
  - step_callback handles both list and single-item signatures (CrewAI 0.51)
  - Process.sequential enforced to avoid hierarchical manager LLM deadlock

Exports:
    build_agents(mode)  — returns dict[agent_id, Agent]
    run_crew(...)       — orchestrates a full job and returns results
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

ROLE_TOOLS: dict[str, list[str]] = {
    "coordinator": ["web_search", "request_new_agent"],
    "researcher":  ["web_search", "knowledge_base_search", "summariser", "read_uploaded_file", "calculator"],
    "analyst":     ["data_analyser", "knowledge_base_search", "summariser", "read_uploaded_file", "calculator"],
    "writer":      ["summariser"],
    "fs_agent":    ["fs_read_file", "fs_list_dir", "fs_write_file", "fs_edit_file"],
}
DEFAULT_TOOLS = ["web_search", "summariser", "read_uploaded_file", "calculator"]

FS_TOOL_MAP = {
    "fs_read_file":  FSReadTool,
    "fs_list_dir":   FSListTool,
    "fs_write_file": FSWriteTool,
    "fs_edit_file":  FSEditTool,
}

MODE_MODEL_HINT: dict[str, str] = {
    "research": "llama3.2:3b or larger",
    "analysis": "llama3.2:3b or larger",
    "code":     "llama3.2:3b or larger",
    "query":    "phi3:mini is fine",
}

PHASE_ORDER = ["coordinator", "researcher", "analyst", "writer"]


def build_agents(mode: str = "research") -> dict[str, Agent]:
    """
    Build a fresh dict of agent_id → CrewAI Agent.
    Merges SKILLS.md overrides, skips inactive agents.

    FIX: allow_delegation is forced to False for ALL agents regardless of
    registry or skills file setting.  In CrewAI 0.51 with Process.sequential,
    allow_delegation=True on the coordinator causes it to attempt to delegate
    to other agents via an internal manager LLM call that never resolves
    (because there is no manager agent configured), hanging the entire job.
    """
    cfg = get_llm_config()
    llm = ChatOllama(**cfg)

    agents = {}
    for defn in get_active_agents():
        aid = defn["id"]

        skills    = read_skills_file(aid) or {}
        role      = skills.get("role")      or defn["role"]
        goal      = skills.get("goal")      or defn["goal"]
        backstory = skills.get("backstory") or defn["backstory"]
        max_iter  = skills.get("max_iter")  or int(defn.get("max_iter", 8))

        skill_tools = skills.get("tools")
        reg_tools   = defn.get("tools")
        tool_names  = skill_tools or reg_tools or ROLE_TOOLS.get(aid, DEFAULT_TOOLS)

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
            # CRITICAL FIX: always False in sequential mode.
            # allow_delegation=True with Process.sequential causes CrewAI 0.51
            # to hang waiting for an internal manager LLM that never responds.
            allow_delegation = False,
            max_iter         = max_iter,
        )
    return agents


# ───────────────────────────────────────────────────────────────────
# Broadcast helpers
# ───────────────────────────────────────────────────────────────────

def _broadcast(broadcast_fn: Optional[Callable], msg: dict) -> None:
    """
    Call broadcast_fn(msg) and wait for the Future to complete.
    broadcast_fn in main.py returns a concurrent.futures.Future
    (from run_coroutine_threadsafe). We call .result(timeout=2) to
    ensure the WS message is actually sent before we continue.
    """
    if broadcast_fn is None:
        return
    try:
        fut = broadcast_fn(msg)
        # If broadcast_fn returns a Future, block briefly to flush it
        if fut is not None and hasattr(fut, "result"):
            try:
                fut.result(timeout=2)
            except Exception:
                pass
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
    """Emit an agent_activity WS event — shows in Activity Feed and animates agent cards."""
    _broadcast(broadcast_fn, {
        "type": "agent_activity",
        "agent": agent_id,
        "label": label,
        "message": message,
        "phase": phase,
        "task_result": task_result,
        "ts": time.time(),
    })


def _emit_working(
    broadcast_fn: Optional[Callable],
    agent_id: str,
    label: str,
    thought: str = "",
) -> None:
    """Emit an agent_working event — animates the 3D boardroom and sets currentWorker."""
    _broadcast(broadcast_fn, {
        "type": "agent_working",
        "agent": agent_id,
        "label": label,
        "thought": thought,
        "ts": time.time(),
    })


# ───────────────────────────────────────────────────────────────────
# CrewAI step callback factory
# ───────────────────────────────────────────────────────────────────

def _make_step_callback(
    broadcast_fn: Optional[Callable],
    agent_id: str,
    label: str,
) -> Callable:
    """
    Returns a callback compatible with CrewAI 0.51 step_callback.
    Called after every LLM step (thought, action, observation).

    FIX: CrewAI 0.51 passes a LIST of step outputs to step_callback,
    not a single object. Handle both list and single-object signatures.
    """
    def _cb(step_output: Any) -> None:
        try:
            # CrewAI 0.51 passes a list; earlier versions pass a single object
            items = step_output if isinstance(step_output, list) else [step_output]
            for item in items:
                if hasattr(item, "log"):
                    text = str(item.log).strip()
                elif hasattr(item, "return_values"):
                    text = str(item.return_values.get("output", "")).strip()
                elif hasattr(item, "text"):
                    text = str(item.text).strip()
                else:
                    text = str(item).strip()

                if not text:
                    continue

                # Truncate very long thoughts for the feed
                if len(text) > 300:
                    text = text[:297] + "…"

                _emit_working(broadcast_fn, agent_id, label, text)
                _emit_activity(broadcast_fn, agent_id, label, text, phase=False)
        except Exception as exc:
            logger.debug("step_callback error: %s", exc)

    return _cb


def _make_task_callback(
    broadcast_fn: Optional[Callable],
    agent_id: str,
    label: str,
) -> Callable:
    """
    Returns a callback compatible with CrewAI’s task callbacks.
    Called when a Task finishes.
    """
    def _cb(task_output: Any) -> None:
        try:
            if hasattr(task_output, "raw"):
                text = str(task_output.raw).strip()
            elif hasattr(task_output, "result"):
                text = str(task_output.result).strip()
            else:
                text = str(task_output).strip()

            if len(text) > 400:
                text = text[:397] + "…"

            _emit_activity(
                broadcast_fn, agent_id, label,
                f"✅ {label} finished: {text}",
                phase=False,
                task_result=True,
            )
        except Exception as exc:
            logger.debug("task_callback error: %s", exc)

    return _cb


# ───────────────────────────────────────────────────────────────────
# Main job runner
# ───────────────────────────────────────────────────────────────────

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
    """
    Orchestrate a full multi-agent job.

    Returns:
        (result_text, report_filename, report_format, tokens_in, tokens_out)
    """
    uploaded_files = uploaded_files or []
    report_dir = report_dir or Path("reports")
    report_dir.mkdir(parents=True, exist_ok=True)

    logger.info("run_crew started — topic=%r mode=%s model=%s", topic, mode, model)

    # Build agents
    agents_map = build_agents(mode=mode)
    if not agents_map:
        raise RuntimeError(
            "No active agents found. Please activate at least one agent via the Agents panel."
        )

    # Lookup helper: agent_id → human label
    all_defns = {d["id"]: d for d in get_active_agents()}
    def _label(aid: str) -> str:
        d = all_defns.get(aid, {})
        return d.get("label") or d.get("role") or aid

    # Build task descriptions
    file_context = ""
    if uploaded_files and upload_dir:
        names = ", ".join(uploaded_files)
        file_context = f"\n\nUploaded files available: {names} (in {upload_dir})"

    task_descriptions: dict[str, str] = {
        "coordinator": (
            f"You are the Research Coordinator. Your job is to plan the research on: '{topic}'.{file_context}\n"
            "Write a concise research plan outlining: (1) the key questions to investigate, "
            "(2) the primary sources to consult, and (3) the expected structure of the final report. "
            "Do NOT delegate. Do NOT ask for more information. Produce the plan directly."
        ),
        "researcher": (
            f"Research the topic: '{topic}'.{file_context}\n"
            "Use available tools to gather comprehensive, up-to-date information. "
            "Return a structured research summary with sources and key findings."
        ),
        "analyst": (
            f"Analyse the research findings on: '{topic}'.{file_context}\n"
            "Identify patterns, insights, risks, and opportunities. "
            "Provide a data-driven analysis with clear conclusions."
        ),
        "writer": (
            f"Write a professional report on: '{topic}'.{file_context}\n"
            "Use the research and analysis to produce a well-structured markdown report "
            "with executive summary, key findings, and recommendations."
        ),
    }

    # ── Query mode: single agent fast path ──────────────────────────────────────
    if mode == "query":
        agent_id = next(iter(agents_map))
        agent    = agents_map[agent_id]
        label    = _label(agent_id)

        _emit_activity(broadcast_fn, agent_id, label, f"💡 Answering: {topic}", phase=True)
        _emit_working(broadcast_fn, agent_id, label, "Thinking…")

        task = Task(
            description=topic,
            expected_output="A clear, direct answer to the query.",
            agent=agent,
            callback=_make_task_callback(broadcast_fn, agent_id, label),
        )
        crew = Crew(
            agents=[agent],
            tasks=[task],
            process=Process.sequential,
            step_callback=_make_step_callback(broadcast_fn, agent_id, label),
            verbose=True,
        )
        result_obj  = crew.kickoff()
        result_text = str(result_obj) if result_obj else ""

        report_filename = f"report_{uuid.uuid4().hex[:8]}.md"
        (report_dir / report_filename).write_text(result_text, encoding="utf-8")
        _emit_activity(broadcast_fn, agent_id, label, "✅ Done", task_result=True)
        return result_text, report_filename, "md", 0, 0

    # ── Full pipeline ────────────────────────────────────────────────────────
    available_ids = list(agents_map.keys())
    phase_ids     = [p for p in PHASE_ORDER if p in available_ids]
    extra_ids     = [a for a in available_ids if a not in PHASE_ORDER]
    ordered_ids   = phase_ids + extra_ids

    tasks      = []
    agent_list = []

    for aid in ordered_ids:
        agent = agents_map[aid]
        label = _label(aid)
        desc  = task_descriptions.get(
            aid, f"Work on the topic: '{topic}'. Provide a thorough response."
        )

        # Emit a "phase started" event immediately when the task is queued
        _emit_activity(
            broadcast_fn, aid, label,
            f"🟡 {label} queued",
            phase=True,
        )

        task = Task(
            description=desc,
            expected_output="A detailed, well-structured written response.",
            agent=agent,
            callback=_make_task_callback(broadcast_fn, aid, label),
        )
        tasks.append(task)
        agent_list.append(agent)

    # Wire a per-step callback on the Crew level.
    # We track the "current" agent by watching step output agent attribute.
    _current: Dict[str, Any] = {"aid": ordered_ids[0] if ordered_ids else ""}

    def _crew_step_callback(step_output: Any) -> None:
        """
        Called by CrewAI after every LLM step across all agents.

        FIX: CrewAI 0.51 passes a LIST to step_callback, not a single object.
        Unwrap the list before processing.
        """
        aid = _current["aid"]
        # Unwrap list (CrewAI 0.51 wraps steps in a list)
        items = step_output if isinstance(step_output, list) else [step_output]
        for item in items:
            try:
                if hasattr(item, "agent") and item.agent:
                    aid = str(item.agent)
                    _current["aid"] = aid
            except Exception:
                pass

            label = _label(aid)

            try:
                if hasattr(item, "log"):
                    text = str(item.log).strip()
                elif hasattr(item, "return_values"):
                    text = str(item.return_values.get("output", "")).strip()
                elif hasattr(item, "text"):
                    text = str(item.text).strip()
                else:
                    text = str(item).strip()

                if not text:
                    continue
                if len(text) > 300:
                    text = text[:297] + "…"

                _emit_working(broadcast_fn, aid, label, text)
                _emit_activity(broadcast_fn, aid, label, text, phase=False)
            except Exception as exc:
                logger.debug("crew step_callback error: %s", exc)

    # Emit working state for first agent before kickoff
    if ordered_ids:
        first_aid   = ordered_ids[0]
        first_label = _label(first_aid)
        _emit_activity(
            broadcast_fn, first_aid, first_label,
            f"🔍 {first_label} is starting…",
            phase=True,
        )
        _emit_working(broadcast_fn, first_aid, first_label, "Thinking…")

    # FIX: Always use Process.sequential.
    # The default (hierarchical) process requires a manager_llm to be
    # configured on the Crew. Without it, CrewAI 0.51 silently hangs
    # after the first agent emits its plan, waiting for manager approval
    # that never arrives.
    crew = Crew(
        agents=agent_list,
        tasks=tasks,
        process=Process.sequential,
        step_callback=_crew_step_callback,
        verbose=True,
    )

    logger.info("Kicking off crew with %d agents / %d tasks", len(agent_list), len(tasks))
    result_obj  = crew.kickoff()
    result_text = str(result_obj) if result_obj else "No output produced."

    # Save report
    report_filename = f"report_{uuid.uuid4().hex[:8]}.md"
    report_path     = report_dir / report_filename
    report_path.write_text(result_text, encoding="utf-8")
    logger.info("Report saved: %s", report_path)

    # Final completion broadcast for all agents
    for aid in ordered_ids:
        label = _label(aid)
        _emit_activity(
            broadcast_fn, aid, label,
            f"✅ {label} complete",
            phase=False,
            task_result=True,
        )

    return result_text, report_filename, "md", 0, 0
