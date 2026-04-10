"""
agents_crew.py — Dynamic agent builder + job runner

Fix history:
  1. agent_activity events fire DURING execution via step/task callbacks
  2. allow_delegation=False prevents CrewAI 0.51 hierarchical hang
  3. Process.sequential enforced
  4. step_callback handles list signature (CrewAI 0.51)
  5. memory=False — skips RAGStorage / ChromaDB / embedchain init
  6. OTEL_SDK_DISABLED + CREWAI_DISABLE_TELEMETRY set in main.py before
     any crewai import so crew.kickoff() doesn't open an HTTP span to
     telemetry.crewai.com:4319 (which times out ~10 s offline)
  7. _broadcast is fire-and-forget — removed fut.result(timeout=2) which
     blocked the worker thread 2 s per message (10+ s total freeze before
     kickoff was ever called)
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

PHASE_ORDER = ["coordinator", "researcher", "analyst", "writer"]


def build_agents(mode: str = "research") -> dict[str, Agent]:
    cfg = get_llm_config()
    llm = ChatOllama(**cfg)

    agents = {}
    for defn in get_active_agents():
        aid = defn["id"]

        skills    = read_skills_file(aid) or {}
        role      = skills.get("role")      or defn["role"]
        goal      = skills.get("goal")      or defn["goal"]
        backstory  = skills.get("backstory") or defn["backstory"]
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
            allow_delegation = False,
            max_iter         = max_iter,
        )
    return agents


# ──────────────────────────────────────────────────────────────────────────────
# Broadcast helpers
# ──────────────────────────────────────────────────────────────────────────────

def _broadcast(broadcast_fn: Optional[Callable], msg: dict) -> None:
    """
    FIX 3: Fire-and-forget — never block the worker thread on broadcast.

    Previous code called fut.result(timeout=2) which blocked the thread
    2 seconds per message. With 5 agents × 2 events emitted before kickoff,
    that was 10+ seconds of solid blocking *before* any LLM call, making
    the coordinator appear permanently frozen.

    broadcast_fn returns a concurrent.futures.Future from
    run_coroutine_threadsafe. We schedule it and move on immediately;
    the event loop will deliver it asynchronously.
    """
    if broadcast_fn is None:
        return
    try:
        broadcast_fn(msg)   # schedule on event loop — do NOT await or .result()
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
    _broadcast(broadcast_fn, {
        "type": "agent_working",
        "agent": agent_id,
        "label": label,
        "thought": thought,
        "ts": time.time(),
    })


# ──────────────────────────────────────────────────────────────────────────────
# CrewAI callback factories
# ──────────────────────────────────────────────────────────────────────────────

def _make_step_callback(
    broadcast_fn: Optional[Callable],
    agent_id: str,
    label: str,
) -> Callable:
    def _cb(step_output: Any) -> None:
        try:
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


# ──────────────────────────────────────────────────────────────────────────────
# Main job runner
# ──────────────────────────────────────────────────────────────────────────────

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
    uploaded_files = uploaded_files or []
    report_dir = report_dir or Path("reports")
    report_dir.mkdir(parents=True, exist_ok=True)

    logger.info("run_crew started — topic=%r mode=%s model=%s", topic, mode, model)

    agents_map = build_agents(mode=mode)
    if not agents_map:
        raise RuntimeError(
            "No active agents found. Please activate at least one agent via the Agents panel."
        )

    all_defns = {d["id"]: d for d in get_active_agents()}

    def _label(aid: str) -> str:
        d = all_defns.get(aid, {})
        return d.get("label") or d.get("role") or aid

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

    # ── Query mode: single agent fast path ──────────────────────────────────
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
            memory=False,
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

    _current: Dict[str, Any] = {"aid": ordered_ids[0] if ordered_ids else ""}

    def _crew_step_callback(step_output: Any) -> None:
        aid   = _current["aid"]
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

    if ordered_ids:
        first_aid   = ordered_ids[0]
        first_label = _label(first_aid)
        _emit_activity(
            broadcast_fn, first_aid, first_label,
            f"🔍 {first_label} is starting…",
            phase=True,
        )
        _emit_working(broadcast_fn, first_aid, first_label, "Thinking…")

    crew = Crew(
        agents=agent_list,
        tasks=tasks,
        process=Process.sequential,
        memory=False,       # no ChromaDB / embedchain / OpenAI embedding init
        step_callback=_crew_step_callback,
        verbose=True,
    )

    logger.info("Kicking off crew with %d agents / %d tasks", len(agent_list), len(tasks))
    result_obj  = crew.kickoff()
    result_text = str(result_obj) if result_obj else "No output produced."

    report_filename = f"report_{uuid.uuid4().hex[:8]}.md"
    report_path     = report_dir / report_filename
    report_path.write_text(result_text, encoding="utf-8")
    logger.info("Report saved: %s", report_path)

    for aid in ordered_ids:
        label = _label(aid)
        _emit_activity(
            broadcast_fn, aid, label,
            f"✅ {label} complete",
            phase=False,
            task_result=True,
        )

    return result_text, report_filename, "md", 0, 0
