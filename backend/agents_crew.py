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
  8. Tasks are built by tasks_crew.build_tasks() which owns all task
     descriptions, context chaining, and format instructions.
     agents_crew only owns: agent construction, callbacks, and kickoff.
  9. summariser guaranteed in every agent's tool list so LLM can always
     produce a Final Answer without looping.
 10. max_iter=4, num_ctx=4096, num_predict=512, temperature=0.2 to prevent
     Ollama silent hangs and reduce loop-backs on small models.
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
DEFAULT_MAX_ITER = 4


# ---------------------------------------------------------------------------
# Agent construction
# ---------------------------------------------------------------------------

def build_agents(mode: str = "research") -> dict[str, Agent]:
    base_cfg = get_llm_config()
    # Clamp generation params so Ollama never silently hangs
    base_cfg.setdefault("num_ctx", 4096)
    base_cfg.setdefault("num_predict", 512)
    base_cfg.setdefault("temperature", 0.2)

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


# ---------------------------------------------------------------------------
# CrewAI step_callback factory
# ---------------------------------------------------------------------------

def _make_step_callback(
    broadcast_fn: Optional[Callable],
    agents_map: dict,          # aid -> Agent
    labels_map: dict,          # aid -> display label
    ordered_ids: list,
) -> Callable:
    """
    Single step_callback shared across the whole Crew.

    CrewAI 0.51 passes either:
      - A single AgentFinish / AgentAction object
      - A list of the above

    We extract the agent role from the item, map it back to the agent id,
    then emit agent_working + agent_activity events.
    """
    # Build reverse map: role string -> agent_id
    role_to_id: dict[str, str] = {}
    for aid, agent in agents_map.items():
        role_to_id[agent.role.lower()] = aid

    # Track which agent is currently active
    state = {"current": ordered_ids[0] if ordered_ids else ""}

    def _cb(step_output: Any) -> None:
        items = step_output if isinstance(step_output, list) else [step_output]
        for item in items:
            # Try to detect which agent produced this step
            agent_str = ""
            try:
                agent_str = str(getattr(item, "agent", "") or "").strip().lower()
            except Exception:
                pass

            if agent_str:
                matched = role_to_id.get(agent_str)
                if matched:
                    state["current"] = matched
                else:
                    # Partial match
                    for role, aid in role_to_id.items():
                        if agent_str in role or role in agent_str:
                            state["current"] = aid
                            break

            aid   = state["current"]
            label = labels_map.get(aid, aid)

            # Extract text from item
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
                continue
            if len(text) > 350:
                text = text[:347] + "…"

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
            if len(text) > 400:
                text = text[:397] + "…"
            _emit_activity(
                broadcast_fn, agent_id, label,
                f"✅ {label} task done: {text[:200]}",
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
    from tasks_crew import build_tasks  # Import here to avoid circular imports

    uploaded_files = uploaded_files or []
    report_dir = report_dir or Path("reports")
    report_dir.mkdir(parents=True, exist_ok=True)

    logger.info("run_crew started — topic=%r mode=%s model=%s", topic, mode, model)

    # ---- Build agents -------------------------------------------------------
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

    # ---- Emit "queued" activity for every agent ----------------------------
    for aid, label in labels_map.items():
        _emit_activity(broadcast_fn, aid, label, f"🟡 {label} queued", phase=True)

    # ---- Build tasks via tasks_crew (single source of truth) ---------------
    tasks = build_tasks(
        topic          = topic,
        agents         = agents_map,
        mode           = mode,
        uploaded_files = uploaded_files,
    )

    # Attach per-task callback so we emit a completion event for each task
    for task in tasks:
        if task.agent:
            aid   = next((k for k, v in agents_map.items() if v is task.agent), "")
            label = labels_map.get(aid, str(task.agent.role))
            task.callback = _make_task_callback(broadcast_fn, aid, label)

    # ---- Ordered agent list for step_callback ------------------------------
    available_ids = list(agents_map.keys())
    phase_ids     = [p for p in PHASE_ORDER if p in available_ids]
    extra_ids     = [a for a in available_ids if a not in PHASE_ORDER]
    ordered_ids   = phase_ids + extra_ids

    agent_list = [agents_map[aid] for aid in ordered_ids if aid in agents_map]

    # ---- Announce first agent starting ------------------------------------
    if ordered_ids:
        first_aid   = ordered_ids[0]
        first_label = labels_map.get(first_aid, first_aid)
        _emit_activity(
            broadcast_fn, first_aid, first_label,
            f"🔍 {first_label} is starting…",
            phase=True,
        )
        _emit_working(broadcast_fn, first_aid, first_label, "Thinking…")

    # ---- Build and kick off the crew ---------------------------------------
    step_cb = _make_step_callback(broadcast_fn, agents_map, labels_map, ordered_ids)

    crew = Crew(
        agents       = agent_list,
        tasks        = tasks,
        process      = Process.sequential,
        memory       = False,
        step_callback = step_cb,
        verbose      = True,
    )

    logger.info("Kicking off crew — %d agents / %d tasks", len(agent_list), len(tasks))
    result_obj  = crew.kickoff()
    result_text = str(result_obj) if result_obj else "No output produced."

    # ---- Save report -------------------------------------------------------
    report_filename = f"report_{uuid.uuid4().hex[:8]}.md"
    report_path     = report_dir / report_filename
    report_path.write_text(result_text, encoding="utf-8")
    logger.info("Report saved: %s", report_path)

    # ---- Emit completion for all agents ------------------------------------
    for aid in ordered_ids:
        label = labels_map.get(aid, aid)
        _emit_activity(
            broadcast_fn, aid, label,
            f"✅ {label} complete",
            phase=False, task_result=True,
        )

    return result_text, report_filename, "md", 0, 0
