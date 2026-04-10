"""
agents_crew.py — Dynamic agent builder + job runner
Reads from agent_registry, skips inactive agents, and merges any
fields overridden in SKILLS.md before building CrewAI Agent objects.

Exports:
    build_agents(mode)  — returns dict[agent_id, Agent]
    run_crew(...)       — orchestrates a full job and returns results
"""
import logging
import time
import uuid
from pathlib import Path
from typing import Callable, Dict, List, Optional, Any

from crewai import Agent, Crew, Task
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

# Minimum recommended model for each mode.
MODE_MODEL_HINT: dict[str, str] = {
    "research": "llama3.2:3b or larger",
    "analysis": "llama3.2:3b or larger",
    "code":     "llama3.2:3b or larger",
    "query":    "phi3:mini is fine",
}

# Phase order for broadcast events
PHASE_ORDER = ["coordinator", "researcher", "analyst", "writer"]


def build_agents(mode: str = "research") -> dict[str, Agent]:
    """
    Build a fresh dict of agent_id → CrewAI Agent.

    For each agent:
      1. Start with the registry definition.
      2. Overlay any fields found in SKILLS.md (role/goal/backstory/tools/config).
      3. Skip agents with active=False.
    """
    cfg = get_llm_config()
    llm = ChatOllama(**cfg)

    agents = {}
    for defn in get_active_agents():
        aid = defn["id"]

        # ── Merge SKILLS.md overrides ─────────────────────────────────────
        skills = read_skills_file(aid) or {}
        role      = skills.get("role")      or defn["role"]
        goal      = skills.get("goal")      or defn["goal"]
        backstory = skills.get("backstory") or defn["backstory"]
        max_iter  = skills.get("max_iter")  or int(defn.get("max_iter", 10))
        allow_del = skills.get("allow_delegation")
        if allow_del is None:
            allow_del = defn.get("allow_delegation", False)

        # Tool list: SKILLS.md > registry tools > role default > global default
        skill_tools = skills.get("tools")
        reg_tools   = defn.get("tools")
        tool_names  = skill_tools or reg_tools or ROLE_TOOLS.get(aid, DEFAULT_TOOLS)

        # ── Instantiate tools ─────────────────────────────────────────────
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
            allow_delegation = allow_del,
            max_iter         = max_iter,
        )
    return agents


def _broadcast(broadcast_fn: Optional[Callable], msg: dict) -> None:
    """Fire-and-forget broadcast, swallowing any errors."""
    if broadcast_fn is None:
        return
    try:
        broadcast_fn(msg)
    except Exception as exc:
        logger.debug("broadcast error (ignored): %s", exc)


def _emit_phase(broadcast_fn: Optional[Callable], agent_id: str, label: str, message: str, phase: bool = False) -> None:
    _broadcast(broadcast_fn, {
        "type": "agent_activity",
        "agent": agent_id,
        "label": label,
        "message": message,
        "phase": phase,
        "ts": time.time(),
    })


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

    This is the function imported by main.py:
        from agents_crew import run_crew
    """
    uploaded_files = uploaded_files or []
    report_dir = report_dir or Path("reports")
    report_dir.mkdir(parents=True, exist_ok=True)

    logger.info("run_crew started — topic=%r mode=%s model=%s", topic, mode, model)

    # ── Build agents ──────────────────────────────────────────────────────
    agents_map = build_agents(mode=mode)

    if not agents_map:
        raise RuntimeError(
            "No active agents found. Please activate at least one agent via the Agents panel."
        )

    # ── Single-agent query shortcut ───────────────────────────────────────
    if mode == "query":
        agent_id = next(iter(agents_map))
        agent = agents_map[agent_id]
        defn = next((d for d in get_active_agents() if d["id"] == agent_id), {})
        label = defn.get("label") or defn.get("role", agent_id)

        _emit_phase(broadcast_fn, agent_id, label, f"Answering: {topic}", phase=True)

        task = Task(
            description=topic,
            expected_output="A clear, direct answer to the query.",
            agent=agent,
        )
        crew = Crew(agents=[agent], tasks=[task], verbose=True)
        result_obj = crew.kickoff()
        result_text = str(result_obj) if result_obj else ""

        # Save report
        report_filename = f"report_{uuid.uuid4().hex[:8]}.md"
        (report_dir / report_filename).write_text(result_text, encoding="utf-8")

        _emit_phase(broadcast_fn, agent_id, label, "✅ Done", phase=False)
        return result_text, report_filename, "md", 0, 0

    # ── Full pipeline (research / file / analysis) ────────────────────────
    # Build tasks in phase order, only for agents that exist
    available_ids = list(agents_map.keys())
    phase_ids = [p for p in PHASE_ORDER if p in available_ids]

    # Also include any custom agents not in PHASE_ORDER
    extra_ids = [aid for aid in available_ids if aid not in PHASE_ORDER]
    ordered_ids = phase_ids + extra_ids

    # Build task descriptions per agent role
    file_context = ""
    if uploaded_files and upload_dir:
        names = ", ".join(uploaded_files)
        file_context = f"\n\nUploaded files available: {names} (in {upload_dir})"

    task_descriptions: dict[str, str] = {
        "coordinator": (
            f"You are the Coordinator. Plan and delegate research on the topic: '{topic}'.{file_context}\n"
            "Identify the key research questions, delegate sub-tasks to researcher/analyst/writer agents, "
            "and ensure the final output is coherent and complete."
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
            "Use the research and analysis results to produce a well-structured, "
            "comprehensive markdown report with executive summary, key findings, and recommendations."
        ),
    }

    tasks = []
    agent_list = []
    for aid in ordered_ids:
        agent = agents_map[aid]
        defn = next((d for d in get_active_agents() if d["id"] == aid), {})
        label = defn.get("label") or defn.get("role", aid)

        desc = task_descriptions.get(aid, f"Work on the topic: '{topic}'. Provide a thorough response.")
        expected = "A detailed, well-structured written response."

        # Broadcast phase start
        _emit_phase(broadcast_fn, aid, label, f"Starting: {topic}", phase=True)

        task = Task(
            description=desc,
            expected_output=expected,
            agent=agent,
        )
        tasks.append(task)
        agent_list.append(agent)

    # ── Kick off crew ─────────────────────────────────────────────────────
    crew = Crew(agents=agent_list, tasks=tasks, verbose=True)

    logger.info("Kicking off crew with %d agents / %d tasks", len(agent_list), len(tasks))
    result_obj = crew.kickoff()
    result_text = str(result_obj) if result_obj else "No output produced."

    # ── Save report ───────────────────────────────────────────────────────
    report_filename = f"report_{uuid.uuid4().hex[:8]}.md"
    report_path = report_dir / report_filename
    report_path.write_text(result_text, encoding="utf-8")
    logger.info("Report saved: %s", report_path)

    # Broadcast completion for each phase
    for aid in ordered_ids:
        defn = next((d for d in get_active_agents() if d["id"] == aid), {})
        label = defn.get("label") or defn.get("role", aid)
        _emit_phase(broadcast_fn, aid, label, "✅ Complete", phase=False)

    return result_text, report_filename, "md", 0, 0
