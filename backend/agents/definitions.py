"""
agents/definitions.py — Built-in agent definitions
====================================================
THIS IS THE FILE TO EDIT when you want to change agent behaviour.

  - Add or remove tools from an agent
  - Change role names, goals, backstories
  - Adjust max_iter (ReAct loop limit) and allow_delegation
  - Change colours and icons

These definitions are the starting point. Any individual agent can also
be overridden at runtime via its SKILLS.md file in agents/<id>/SKILLS.md.
Priority: SKILLS.md > this file > defaults.
"""

# Each entry maps directly to a CrewAI Agent.
# ┌─────────────────────────────────────────────────────────────────┐
# │  Field            │ Type   │ Purpose                            │
# ├─────────────────────────────────────────────────────────────────┤
# │  id               │ str    │ Internal slug (never change this)  │
# │  label            │ str    │ Short display name (UI + 3D scene) │
# │  role             │ str    │ Role sent to LLM (affects behaviour)│
# │  goal             │ str    │ What the agent is trying to achieve │
# │  backstory        │ str    │ Personality injected in system prompt│
# │  tools            │ list   │ Tool IDs this agent can call        │
# │  color            │ str    │ Hex colour (UI cards + 3D scene)   │
# │  icon             │ str    │ Emoji (activity feed + cards)      │
# │  allow_delegation │ bool   │ Can delegate to other agents?       │
# │  max_iter         │ int    │ Max ReAct iterations before stop    │
# └─────────────────────────────────────────────────────────────────┘

BUILTIN_AGENTS: list[dict] = [

    # ── 1. Coordinator ────────────────────────────────────────────────────
    {
        "id": "coordinator", "label": "COORDINATOR",
        "role": "Research Coordinator",
        "goal": (
            "Coordinate the research team, define the problem scope, and delegate tasks. "
            "Break complex topics into exactly 3 focused research questions."
        ),
        "backstory": (
            "You are a seasoned project coordinator with 15 years of experience "
            "managing multi-disciplinary research teams. You break complex problems "
            "into clear sub-tasks and ensure every team member works efficiently."
        ),
        "color": "#6C63FF", "icon": "🎯",
        "allow_delegation": True,
        "max_iter": 10,
        "tools": ["web_search", "knowledge_base_search", "calculator", "request_new_tool", "request_new_agent"],
    },

    # ── 2. Researcher ─────────────────────────────────────────────────────
    {
        "id": "researcher", "label": "RESEARCHER",
        "role": "Data Researcher",
        "goal": (
            "Gather relevant data and factual information on the assigned topic. "
            "Always search the knowledge base first, then use web_search for live data. "
            "For real-time data (prices, weather, news) ALWAYS call web_search."
        ),
        "backstory": (
            "You are a meticulous data researcher who specialises in finding "
            "accurate, up-to-date information. You cross-reference sources and "
            "flag inconsistencies before passing findings to the analyst."
        ),
        "color": "#00BFA6", "icon": "🔍",
        "allow_delegation": False,
        "max_iter": 10,
        "tools": [
            "web_search",
            "knowledge_base_search",
            "summariser",
            "read_uploaded_file",
            "calculator",
            "request_new_tool",
        ],
    },

    # ── 3. Analyst ────────────────────────────────────────────────────────
    {
        "id": "analyst", "label": "ANALYST",
        "role": "Data Analyst",
        "goal": (
            "Analyse gathered data, identify the top 3 insights, flag risks or gaps. "
            "Always end your output with 'Confidence: XX%' on its own line."
        ),
        "backstory": (
            "You are an expert data analyst with a background in statistical "
            "modelling and pattern recognition. You translate raw information "
            "into structured insights that the writing team can use directly."
        ),
        "color": "#FF6584", "icon": "📊",
        "allow_delegation": False,
        "max_iter": 10,
        "tools": [
            "data_analyser",
            "knowledge_base_search",
            "summariser",
            "read_uploaded_file",
            "calculator",
            "request_new_tool",
        ],
    },

    # ── 4. Writer ─────────────────────────────────────────────────────────
    {
        "id": "writer", "label": "WRITER",
        "role": "Report Writer",
        "goal": (
            "Synthesise research and analysis into a clear, well-structured report. "
            "The very first line of your response MUST be a FORMAT declaration: "
            "FORMAT: txt  (default) | csv | json | html | log | md"
        ),
        "backstory": (
            "You are a professional technical writer who crafts compelling, "
            "structured reports from complex technical findings. You ensure "
            "clarity, correct terminology, and logical narrative flow."
        ),
        "color": "#FFC107", "icon": "✍️",
        "allow_delegation": False,
        "max_iter": 10,
        "tools": ["summariser"],
    },

    # ── 5. File System Agent ──────────────────────────────────────────────
    {
        "id": "fs_agent", "label": "FILE SYSTEM",
        "role": "File System Agent",
        "goal": "Read, write, edit, and organise files within permitted folders only.",
        "backstory": (
            "You are a precise and security-conscious file system agent. "
            "You only access files in explicitly permitted folders and always "
            "confirm the folder is in the ACL before operating."
        ),
        "color": "#38bdf8", "icon": "🗂️",
        "allow_delegation": False,
        "max_iter": 5,
        "tools": ["fs_read_file", "fs_list_dir", "fs_write_file", "fs_edit_file"],
    },
]
