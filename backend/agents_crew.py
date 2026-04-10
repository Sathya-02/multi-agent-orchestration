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
  7. _broadcast is fire-and-forget — removed fut.result(timeout=2)
  8. coordinator + all roles now include summariser so the LLM can always
     produce a Final Answer without looping on tool calls indefinitely.
     max_iter reduced 8→5 so a stuck agent times out faster.
     ChatOllama num_ctx=4096 + num_predict=1024 prevent silent hangs caused
     by the model waiting for more context or producing unbounded tokens.
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
# ---------------------------------------------------------------------------
# IMPORTANT: Every role MUST include 'summariser' so the LLM always has
# a tool it can call to produce a Final Answer.  Without it the agent
# loops on web_search until max_iter is exhausted.
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

# Default max_iter — lower is faster to fail-safe when the LLM loops.
# 8 iterations × ~20 s per Ollama call = 160 s frozen before giving up.
# 4 iterations × ~20 s = 80 s — still generous but snappier.
DEFAULT_MAX_ITER = 4


def build_agents(mode: str = "research") -> dict[str, Agent]:
    base_cfg = get_llm_config()

    # Ensure safe context / generation limits so Ollama never silently hangs
    # waiting for more input or emitting an unbounded stream.
    base_cfg.setdefault("num_ctx", 4096)      # context window
    base_cfg.setdefault("num_predict", 1024)  # max tokens to generate
    base_cfg.setdefault("temperature", 0.2)   # more deterministic = fewer loop-backs

    llm = ChatOllama(**base_cfg)

    agents = {}
    for defn in get_active_agents():
        aid = defn["id"]

        skills   = read_skills_file(aid) or {}
        role     = skills.get("role")      or defn["role"]
        goal     = skills.get("goal")      or defn["goal"]
        backstory = skills.get("backstory") or defn["backstory"]
        max_iter = int(skills.get("max_iter") or defn.get("max_iter") or DEFAULT_MAX_ITER)

        skill_tools = skills.get("tools")
        reg_tools   = defn.get("tools")
        tool_names  = skill_tools or reg_tools or ROLE_TOOLS.get(aid, DEFAULT_TOOLS)

        # Always ensure summariser is present so agent can always produce Final Answer
        if "summariser" not in tool_names:
            tool_names = list(tool_names) + ["summariser"]

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
# Task descriptions
# ──────────────────────────────────────────────────────────────────────────────

def _build_task_descriptions(topic: str, file_context: str) -> dict[str, tuple[str, str]]:
    """
    Returns {agent_id: (description, expected_output)} pairs.

    expected_output is deliberately short and concrete — the LLM uses it as
    the target for its Final Answer, so vague expected_output causes looping.
    """
    return {
        "coordinator": (
            f"Plan the research for: '{topic}'.{file_context}\n"
            "Output a numbered list of: (1) 3-5 key questions to investigate, "
            "(2) the best sources to check, (3) the report structure. "
            "Be concise. Do NOT delegate. Do NOT use tools unless you need "
            "a web search to clarify the scope. Write your plan directly.",
            "A numbered research plan with key questions, sources, and report structure.",
        ),
        "researcher": (
            f"Research the topic: '{topic}'.{file_context}\n"
            "Use web_search and knowledge_base_search to gather information. "
            "Return a structured bullet-point summary with key findings and sources.",
            "A structured bullet-point research summary with key findings and sources.",
        ),
        "analyst": (
            f"Analyse the research on: '{topic}'.{file_context}\n"
            "Identify the top 3-5 patterns, insights, or risks. "
            "Use data_analyser if helpful. Be concise and direct.",
            "A concise analysis listing the top 3-5 patterns, insights, or risks.",
        ),
        "writer": (
            f"Write a professional markdown report on: '{topic}'.{file_context}\n"
            "Sections: Executive Summary, Key Findings, Analysis, Recommendations. "
            "Use clear headings. Do not pad — be concise.",
            "A professional markdown report with Executive Summary, Key Findings, Analysis, and Recommendations.",
        ),
    }


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

    task_descs = _build_task_descriptions(topic, file_context)

    # ── Query mode: single agent fast path ──────────────────────────────────
    if mode == "query":
        agent_id = next(iter(agents_map))
        agent    = agents_map[agent_id]
        label    = _label(agent_id)

        _emit_activity(broadcast_fn, agent_id, label, f"💡 Answering: {topic}", phase=True)
        _emit_working(broadcast_fn, agent_id, label, "Thinking…")

        task = Task(
            description=topic,
            expected_output="A clear, direct answer in 1-3 sentences.",
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
        desc_pair = task_descs.get(
            aid,
            (
                f"Work on the topic: '{topic}'. Provide a thorough response.",
                "A detailed, well-structured written response.",
            ),
        )
        desc, expected = desc_pair

        _emit_activity(
            broadcast_fn, aid, label,
            f"🟡 {label} queued",
            phase=True,
        )

        task = Task(
            description=desc,
            expected_output=expected,
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
        memory=False,
        step_callback=_crew_step_callback,
        verbose=True,
    )

    logger.info("Kicking off crew — %d agents / %d tasks", len(agent_list), len(tasks))
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
