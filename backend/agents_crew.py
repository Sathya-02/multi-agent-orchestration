"""
agents_crew.py — Dynamic agent builder
Reads from agent_registry, skips inactive agents, and merges any
fields overridden in SKILLS.md before building CrewAI Agent objects.
"""
from crewai import Agent
from langchain_ollama import ChatOllama
from model_config import get_llm_config
from agent_registry import get_active_agents, read_skills_file
from tools import make_tools
from tool_registry import get_active_tools, instantiate_tool
from fs_tools import FSReadTool, FSWriteTool, FSEditTool, FSListTool

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


def build_agents() -> dict[str, Agent]:
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
