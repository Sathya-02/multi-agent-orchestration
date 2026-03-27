"""
tools/definitions.py — Built-in tool catalogue
================================================
THIS IS THE FILE TO EDIT when you want to:
  - Change a tool's description (affects how agents choose to use it)
  - Add a new built-in tool class
  - Disable a built-in tool (set active: False)
  - Change which module/class a tool resolves to

Custom tools created through the UI are stored separately in
data/custom_tools.json and backend/tools/<id>/TOOL.md.
"""

# ┌─────────────────────────────────────────────────────────────────┐
# │  Field        │ Purpose                                         │
# ├─────────────────────────────────────────────────────────────────┤
# │  id           │ Internal key used in agent tool lists           │
# │  display_name │ Human-readable name shown in UI                  │
# │  description  │ What the LLM reads to decide when to call it   │
# │  tags         │ Category tags for filtering in the UI           │
# │  class_name   │ Python class in tools/builtin.py                │
# │  active       │ Set False to disable globally                   │
# └─────────────────────────────────────────────────────────────────┘

BUILTIN_TOOLS: list[dict] = [

    # ── Web Search (smart real-time router) ───────────────────────────────
    {
        "id": "web_search",
        "display_name": "Web Search",
        "description": (
            "Search the web for real-time and current information. "
            "ALWAYS call this tool for: today's date, current day of the week, "
            "stock prices, share prices, weather in any location, latest news, "
            "current events, live exchange rates, and anything that changes. "
            "NEVER guess or use placeholder text for real-time data. "
            "Input: plain-English query — e.g. 'Infosys stock price today', "
            "'weather in Chennai', 'USD to INR rate', 'latest AI news'."
        ),
        "tags": ["search", "realtime", "news", "weather", "stocks"],
        "class_name": "WebSearchTool",
        "active": True,
    },

    # ── Knowledge Base (RAG) ──────────────────────────────────────────────
    {
        "id": "knowledge_base_search",
        "display_name": "Knowledge Base Search",
        "description": (
            "Search the local knowledge base for relevant information from "
            "ingested documents. Use this BEFORE web_search when answering "
            "questions about topics covered in uploaded documents, company docs, "
            "or previously indexed knowledge. "
            "Input: a natural-language query."
        ),
        "tags": ["rag", "knowledge", "documents"],
        "class_name": "KnowledgeBaseSearchTool",
        "active": True,
    },

    # ── Data Analyser ─────────────────────────────────────────────────────
    {
        "id": "data_analyser",
        "display_name": "Data Analyser",
        "description": (
            "Analyse data or text and extract key insights: main theme, "
            "sentiment, confidence score, and recommended action. "
            "Input: text or data string to analyse."
        ),
        "tags": ["analysis", "insights"],
        "class_name": "DataAnalysisTool",
        "active": True,
    },

    # ── Summariser ────────────────────────────────────────────────────────
    {
        "id": "summariser",
        "display_name": "Summariser",
        "description": (
            "Summarise long content into concise bullet points. "
            "Input: text to summarise."
        ),
        "tags": ["summary", "condensing"],
        "class_name": "SummaryTool",
        "active": True,
    },

    # ── File Reader ───────────────────────────────────────────────────────
    {
        "id": "read_uploaded_file",
        "display_name": "File Reader",
        "description": (
            "Read the content of an uploaded file from the uploads/ folder. "
            "Supports PDF, DOCX, TXT, CSV, XLSX, JSON. "
            "Input: filename — e.g. 'report.pdf', 'data.csv'."
        ),
        "tags": ["files", "pdf", "documents"],
        "class_name": "FileReadTool",
        "active": True,
    },

    # ── Calculator ────────────────────────────────────────────────────────
    {
        "id": "calculator",
        "display_name": "Calculator",
        "description": (
            "Evaluate mathematical expressions and perform calculations. "
            "Supports: arithmetic, sqrt(), percentages (15% of 3200), powers. "
            "Input: a mathematical expression as a string."
        ),
        "tags": ["maths", "calculation"],
        "class_name": "MathTool",
        "active": True,
    },

    # ── Spawn Agent ───────────────────────────────────────────────────────
    {
        "id": "request_new_agent",
        "display_name": "Request New Agent",
        "description": (
            "Request creation of a new specialised agent when the current team "
            "lacks a needed capability. The request requires human approval. "
            "Input: JSON string with keys: role, goal, backstory, reason."
        ),
        "tags": ["spawn", "agents", "meta"],
        "class_name": "SpawnAgentTool",
        "active": True,
    },

    # ── Spawn Tool ────────────────────────────────────────────────────────
    {
        "id": "request_new_tool",
        "display_name": "Request New Tool",
        "description": (
            "Request creation of a new custom tool when a needed capability "
            "is not available. The request requires human approval. "
            "Input: JSON with keys: name, display_name, description, code, reason."
        ),
        "tags": ["spawn", "tools", "meta"],
        "class_name": "SpawnToolTool",
        "active": True,
    },

    # ── Filesystem tools (used only by fs_agent) ──────────────────────────
    {
        "id": "fs_read_file",
        "display_name": "FS Read File",
        "description": "Read any file in an ACL-approved folder. Input: absolute file path.",
        "tags": ["filesystem"],
        "class_name": "FSReadTool",
        "active": True,
    },
    {
        "id": "fs_list_dir",
        "display_name": "FS List Directory",
        "description": "List files and subdirectories in an approved folder. Input: absolute path.",
        "tags": ["filesystem"],
        "class_name": "FSListTool",
        "active": True,
    },
    {
        "id": "fs_write_file",
        "display_name": "FS Write File",
        "description": "Create a new file in an approved folder (write permission required). Input: JSON with path and content.",
        "tags": ["filesystem"],
        "class_name": "FSWriteTool",
        "active": True,
    },
    {
        "id": "fs_edit_file",
        "display_name": "FS Edit File",
        "description": "Overwrite or append to an existing file in an approved folder (edit permission required).",
        "tags": ["filesystem"],
        "class_name": "FSEditTool",
        "active": True,
    },
]
