"""
tasks_crew.py — Dynamic task pipeline builder
Supports modes:
  research      — full 4-agent pipeline (default)
  query         — single-agent quick answer (simple Q&A / maths)
  file          — file-aware pipeline with read_uploaded_file context
  architectural — auto-detected; deep design / architecture reports
  diagram       — auto-detected; flow diagrams, timelines, mind maps, etc.
"""
from crewai import Task
from typing import Optional
from datetime import datetime
import re


# ── Real-time query detection ───────────────────────────────────────────────────────
_REALTIME_PATTERNS = re.compile(
    r"\b(today|current date|what day|what date|date today|day today|"
    r"what time|current time|right now|this moment|"
    r"weather|forecast|temperature|rain|humidity|"
    r"exchange rate|currency|usd|eur|gbp|inr|forex|"
    r"stock price|share price|stock of|shares of|currently trading|"
    r"market cap|nifty|sensex|nasdaq|nyse|dow jones|s&p|"
    r"infosys|tcs|reliance|wipro|hdfc|icici|apple|google|amazon|"
    r"microsoft|tesla|nvidia|meta|infy|"
    r"latest|breaking|recent news|news about|"
    r"live score|match result|today.s game|"
    r"who is currently|current president|current ceo)\b",
    re.IGNORECASE,
)

# ── Diagram / visual output detection ──────────────────────────────────────────
# Checked BEFORE _ARCH_PATTERNS so "flow diagram" routes here, not arch mode.
_DIAGRAM_PATTERNS = re.compile(
    r"(flow\s*diagram|flow\s*chart|flowchart|mind\s*map|mind-map"
    r"|timeline|gantt|gantt\s*chart|sequence\s*diagram|entity\s*diagram"
    r"|process\s*map|process\s*flow|state\s*machine|state\s*diagram"
    r"|decision\s*tree|cause.effect|fishbone|swimlane|swim\s*lane"
    r"|tree\s*diagram|hierarchy\s*diagram|org\s*chart|network\s*diagram"
    r"|draw\s*(me\s*)?(a\s*)?(diagram|chart|map|flow|tree|graph)"
    r"|create\s*(a\s*)?(diagram|chart|map|flow|timeline|tree|graph)"
    r"|generate\s*(a\s*)?(diagram|chart|map|flow|timeline|tree|graph)"
    r"|make\s*(a\s*)?(diagram|chart|map|flow|timeline|tree|graph)"
    r"|show\s*(me\s*)?(a\s*)?(diagram|chart|map|flow|timeline|tree|graph)"
    r"|visuali[sz]e|visuali[sz]ation|visual\s*representation)",
    re.IGNORECASE,
)

# ── Architectural / design topic detection ────────────────────────────────────
_ARCH_PATTERNS = re.compile(
    r"\b(architect(ure|ural)?|system design|high.level design|low.level design"
    r"|hld|lld|class diagram|sequence diagram|er diagram|data flow"
    r"|microservice|monolith|serverless|event.driven|cqrs|event sourcing"
    r"|component diagram|deployment diagram|api design|api contract"
    r"|database schema|schema design|data model|domain model"
    r"|design pattern|patterns?|uml|dfd"
    r"|infrastructure|cloud architecture|aws|azure|gcp design"
    r"|scalab|resilien|fault.toleran|load.balanc|cach(e|ing)?"
    r"|service mesh|kubernetes|docker compose|ci.?cd pipeline)\b",
    re.IGNORECASE,
)


def _needs_realtime(topic: str) -> bool:
    return bool(_REALTIME_PATTERNS.search(topic))


def _is_diagram(topic: str) -> bool:
    """Return True if the topic explicitly asks for a diagram/visual/chart output."""
    return bool(_DIAGRAM_PATTERNS.search(topic))


def _is_architectural(topic: str) -> bool:
    """Return True if the topic asks for architecture/design output (and not a diagram)."""
    if _is_diagram(topic):
        return False
    return bool(_ARCH_PATTERNS.search(topic))


def _now_context() -> str:
    now = datetime.now()
    return (
        f"[SYSTEM INFO — Current date/time: "
        f"{now.strftime('%A, %d %B %Y')} | "
        f"Time: {now.strftime('%H:%M:%S')} | "
        f"Day: {now.strftime('%A')} | "
        f"Week: {now.strftime('%W')} of {now.year}]"
    )


def _distinct_agents(agents: dict, phase_order: list) -> list:
    seen: set = set()
    result = []
    for name in phase_order:
        agent = agents.get(name)
        if agent is not None and id(agent) not in seen:
            seen.add(id(agent))
            result.append((name, agent))
    for name, agent in agents.items():
        if name not in phase_order and id(agent) not in seen:
            seen.add(id(agent))
            result.append((name, agent))
    return result


CORE_PHASES = ["coordinator", "researcher", "analyst", "writer"]


# ─────────────────────────────────────────────────────────────────────────────
# Writer task descriptions
# ─────────────────────────────────────────────────────────────────────────────

_NORMAL_WRITER_DESC = """
Write a structured research report on '{topic}' using the analysis above.

You MUST follow this EXACT structure (use these section headers verbatim):

## Introduction
<2-3 paragraphs giving context and background on the topic>

## Key Findings
<bullet list of at least 5 factual findings, each starting with '-'>

## Analysis
<2-3 paragraphs interpreting the findings, identifying patterns and implications>

## Conclusion
<1-2 paragraphs summarising outcomes and recommendations>

Rules:
- Do NOT include any FORMAT: line. The report wrapper is handled externally.
- Use plain prose. No markdown decorations outside section headers.
- Do not use placeholder text like [insert here] or (TBD).
- Every claim must come from the researcher/analyst findings above.
"""

_ARCH_WRITER_DESC = """
Write an ARCHITECTURAL DESIGN DOCUMENT on '{topic}' using the research above.

You MUST follow this EXACT structure:

## Overview
<1-2 paragraphs describing the system's purpose, scope, and goals>

## Component Architecture
<Describe the main components/services/modules and their responsibilities>

ASCII Component Diagram:
```
[ Component A ] ---> [ Component B ]
        |                    |
        v                    v
[ Component C ] <--- [ Component D ]
```
<Brief explanation of each component>

## Data Flow
<Step-by-step numbered list describing how data moves through the system>

1. ...
2. ...
3. ...

## Technology Stack
| Layer         | Technology    | Justification        |
|---------------|---------------|----------------------|
| Frontend      | ...           | ...                  |
| Backend       | ...           | ...                  |
| Database      | ...           | ...                  |
| Messaging     | ...           | ...                  |
| Infra/Deploy  | ...           | ...                  |

## API / Interface Contracts
<Define key API endpoints or interface contracts between components>

## Scalability & Resilience
<How does the design scale? What fault-tolerance mechanisms are present?>

## Risks & Mitigations
| Risk                  | Likelihood | Impact | Mitigation              |
|-----------------------|------------|--------|-------------------------|
| ...                   | High/Med/Low | H/M/L | ...                   |

Rules:
- Do NOT include any FORMAT: line.
- ASCII diagrams MUST be inside triple-backtick code blocks.
- Tables MUST use proper Markdown pipe syntax.
- Do not use placeholder text like [insert here] or (TBD).
- Every decision should be justified based on the research findings.
"""

_DIAGRAM_WRITER_DESC = """
Create a detailed DIAGRAM for: '{topic}'

You MUST produce the diagram using ASCII art inside a code block, then explain it.
Follow this EXACT structure:

## Diagram Title
{topic}

## Legend
```
Symbols used:
  [ Node ]      = Process / State / Entity
  ( Node )      = Start / End point
  < Node >      = Decision point
  [ Node ] ---> [ Node ]   = Flow / Transition
  [ Node ] ---> < Decision? >
                 Yes |       | No
                     v       v
              [ Path A ] [ Path B ]
  ~~~          = Optional / parallel path
  [[ Node ]]   = Sub-process / grouped step
```

## Main Diagram
```
(Start)
   |
   v
[ Step 1: ... ]
   |
   v
< Decision? >
  Yes |    | No
      v    v
 [A]     [B]
  |       |
  +---+---+
      |
      v
[ Step N: ... ]
   |
   v
(End)
```

## Milestones / Key Stages
| # | Stage / Node        | Description                        | Era / Time       |
|---|---------------------|------------------------------------|------------------|
| 1 | ...                 | ...                                | ...              |

## Key Transitions
<Numbered list explaining the most important flow transitions in the diagram>

1. ...
2. ...
3. ...

## Notes
<Any important context, caveats, or alternative paths not shown in the main diagram>

Rules:
- The ASCII diagram MUST be inside triple-backtick code blocks.
- Every node in the diagram must appear in the Milestones table.
- Do NOT write a normal prose report. This output is a DIAGRAM, not an essay.
- Do NOT include any FORMAT: line.
- Do not use placeholder text like [...] or (TBD) in the final diagram.
"""


def _writer_task_desc(topic: str) -> str:
    """Return the appropriate writer task description based on topic type."""
    if _is_diagram(topic):
        return _DIAGRAM_WRITER_DESC.format(topic=topic)
    if _is_architectural(topic):
        return _ARCH_WRITER_DESC.format(topic=topic)
    return _NORMAL_WRITER_DESC.format(topic=topic)


def _writer_expected_output(topic: str) -> str:
    if _is_diagram(topic):
        return (
            "A complete ASCII diagram inside a code block, with: Diagram Title, "
            "Legend, Main Diagram (ASCII art, all nodes filled), "
            "Milestones table, Key Transitions list, Notes. "
            "No prose report. No placeholder text."
        )
    if _is_architectural(topic):
        return (
            "Architectural design document with: Overview, Component Architecture "
            "(with ASCII diagram), Data Flow, Technology Stack table, API Contracts, "
            "Scalability & Resilience, Risks & Mitigations table."
        )
    return (
        "Structured research report with sections: Introduction, Key Findings "
        "(min 5 bullet points), Analysis, Conclusion. Plain prose. No placeholders."
    )


def build_tasks(
    topic: str,
    agents: dict,
    mode: str = "research",
    uploaded_files: Optional[list[str]] = None,
) -> list[Task]:

    coord  = agents.get("coordinator")
    res    = agents.get("researcher")
    ana    = agents.get("analyst")
    wri    = agents.get("writer")

    now_ctx     = _now_context()
    realtime    = _needs_realtime(topic)
    diagram_mode = _is_diagram(topic)
    arch_mode   = _is_architectural(topic)  # already returns False when diagram_mode=True

    rt_instruction = (
        "\n\n*** MANDATORY: This query requires LIVE real-time data. ***\n"
        "Step 1: Call the web_search tool RIGHT NOW with this exact query: "
        f"'{topic}'\n"
        "Step 2: Read the tool output carefully.\n"
        "Step 3: Write your answer using ONLY the data from the tool output.\n"
        "Step 4: Include the source and any price/value returned by the tool.\n"
        "FORBIDDEN: Do NOT use training knowledge for this answer. "
        "Do NOT write 'as of my last update'. "
        "Do NOT write any placeholder like '[current price]'. "
        "If the tool returns no data, say exactly: "
        "'Real-time data unavailable — enable web search in Settings.'"
    ) if realtime else ""

    # ── Quick query mode ────────────────────────────────────────────────────────────────
    if mode == "query":
        responder = res or wri or coord
        if realtime:
            description = (
                f"{now_ctx}\n\n"
                f"TASK: Answer this query using LIVE data: '{topic}'\n"
                f"{rt_instruction}\n\n"
                "Your response format:\n"
                "Line 1: The exact value/answer from the tool\n"
                "Line 2-3: Key supporting details from the tool output\n"
                "Line 4: Source and timestamp from the tool\n"
                "Do NOT add commentary about training data limitations."
            )
            expected = "The live data value from web_search tool, with source. No training-data guesses."
        else:
            description = (
                f"{now_ctx}\n\n"
                f"Answer the following query directly and completely: '{topic}'.\n"
                "Rules:\n"
                "- Mathematical expressions: use the calculator tool.\n"
                "- General knowledge questions: answer from training knowledge.\n"
                "- If uncertain, say so clearly."
            )
            expected = "A direct, complete, accurate answer."
        return [Task(description=description, expected_output=expected, agent=responder)]

    # ── File analysis mode ────────────────────────────────────────────────────────────────
    if mode == "file":
        file_list = ", ".join(uploaded_files) if uploaded_files else "the uploaded file"
        file_task = Task(
            description=(
                f"Read and extract the full content from: {file_list}. "
                "Use the read_uploaded_file tool for each file. "
                "Provide a complete structured summary of what the files contain."
            ),
            expected_output="Full extracted content and structured summary of the uploaded file(s).",
            agent=res or coord,
        )
        analysis_task = Task(
            description=(
                f"Based on the file contents extracted, answer this question: '{topic}'. "
                "Identify key data points, patterns, and insights relevant to the question. "
                "Support every claim with direct evidence from the file."
            ),
            expected_output="Detailed analysis answering the question using evidence from the files.",
            agent=ana or res,
            context=[file_task],
        )
        report_task = Task(
            description=_writer_task_desc(topic),
            expected_output=_writer_expected_output(topic),
            agent=wri or coord,
            context=[analysis_task],
        )
        return _dedup_tasks([file_task, analysis_task, report_task])

    # ── Full research pipeline ───────────────────────────────────────────────────────────
    distinct = _distinct_agents(agents, CORE_PHASES)

    def _slot(index: int):
        return distinct[index][1] if index < len(distinct) else None

    d_coord = _slot(0)
    d_res   = _slot(1)
    d_ana   = _slot(2)
    d_wri   = _slot(3)

    file_context = ""
    if uploaded_files:
        file_context = (
            f" Uploaded files are available for reference: {', '.join(uploaded_files)}. "
            "Use read_uploaded_file to access them if relevant."
        )

    # ── Coordinator task ─────────────────────────────────────────────────────────
    coord_desc = (
        f"{now_ctx}\n\n"
        f"Analyse the topic: '{topic}'.{file_context}{rt_instruction} "
    )
    if diagram_mode:
        coord_desc += (
            "This topic requires a DIAGRAM output — NOT a prose report. "
            "Break it into 3 focused questions to gather the content for the diagram: "
            "(1) What are the main nodes/stages/entities to show? "
            "(2) What are the key transitions, flows, or relationships between them? "
            "(3) What time periods, decisions, or branches are involved? "
            "Output a numbered list with 1-sentence justification each."
        )
    elif arch_mode:
        coord_desc += (
            "This is an ARCHITECTURAL / DESIGN topic. "
            "Break it into 3 focused design questions covering: "
            "(1) component decomposition, "
            "(2) data flow and API contracts, "
            "(3) technology choices and scalability. "
            "Output a numbered list with 1-sentence justification each."
        )
    else:
        coord_desc += (
            "Break it into 3 focused research questions. "
            "Output a numbered list of questions with 1-sentence justification each."
        )

    t1 = Task(
        description=coord_desc,
        expected_output="3 numbered questions with justification.",
        agent=d_coord,
    )

    if d_res is None:
        t_solo = Task(
            description=(
                f"{now_ctx}\n\n"
                f"Research and produce a full "
                f"{'diagram' if diagram_mode else ('architectural design document' if arch_mode else 'report')} on: "
                f"'{topic}'.{file_context}{rt_instruction}\n"
                + _writer_task_desc(topic)
            ),
            expected_output=_writer_expected_output(topic),
            agent=d_coord,
        )
        return [t_solo]

    # ── Researcher task ──────────────────────────────────────────────────────────
    if diagram_mode:
        res_desc = (
            f"{now_ctx}\n\n"
            f"Research all the key stages, nodes, milestones, and transitions for "
            f"the diagram topic: '{topic}'.{file_context}\n"
            "Use web_search to find: major phases/eras/steps, key events or components, "
            "decision points, and chronological or logical order. "
            "Compile as a numbered list of nodes/stages with brief descriptions (minimum 6). "
            "For each node include: name, what it represents, "
            "what comes before it, and what comes after it."
        )
    elif arch_mode:
        res_desc = (
            f"{now_ctx}\n\n"
            f"Research existing architectural patterns and best practices for: '{topic}'.{file_context}\n"
            "Use web_search to find: component models, technology comparisons, "
            "real-world implementation examples, and known pitfalls. "
            "Compile as numbered findings (minimum 5). Be specific — no placeholders."
        )
    else:
        res_desc = (
            f"{now_ctx}\n\n"
            f"Using the research questions, gather key facts and data about: '{topic}'.{file_context}{rt_instruction}\n"
            "Use web_search to find information. "
            "If the topic involves current/real-time data, call web_search to get live results. "
            "Compile findings as bullet points (minimum 5 points). "
            "Never write placeholder text — only include facts you actually retrieved."
        )

    t2 = Task(
        description=res_desc,
        expected_output=(
            "Numbered list of nodes/stages/milestones with before/after links (min 6). No placeholders."
            if diagram_mode
            else "Numbered/bulleted list of factual findings (min 5). No placeholders."
        ),
        agent=d_res,
        context=[t1],
    )

    if d_ana is None:
        t2_extended = Task(
            description=(
                res_desc
                + "\n\nThen arrange the findings into a logical diagram structure: "
                "determine the correct order, identify decision points, and note branches. "
                "\n\n" + _writer_task_desc(topic)
                if diagram_mode
                else res_desc
                + "\n\nThen analyse the findings: identify the top 3 insights, "
                "any risks or gaps, and rate overall confidence (0-100%). "
                "\n\n" + _writer_task_desc(topic)
            ),
            expected_output=_writer_expected_output(topic),
            agent=d_res,
            context=[t1],
        )
        return _dedup_tasks([t1, t2_extended])

    # ── Analyst task ────────────────────────────────────────────────────────────
    if diagram_mode:
        ana_desc = (
            "Structure the researched nodes/stages into a logical diagram layout. "
            "Determine: (1) the correct sequential or branching order of all nodes, "
            "(2) all decision points and their Yes/No branches, "
            "(3) any parallel or optional paths, "
            "(4) start node and end node(s). "
            "Output a structured outline: ordered node list with connection arrows "
            "(e.g. Node A -> Node B, Node B -[Yes]-> Node C, Node B -[No]-> Node D). "
            "This outline will be used by the Writer to draw the ASCII diagram."
        )
    elif arch_mode:
        ana_desc = (
            "Analyse the architectural research findings. "
            "Identify: (1) the best-fit architectural pattern for this system, "
            "(2) component boundaries and integration points, "
            "(3) top 3 technology recommendations with rationale, "
            "(4) risks and trade-offs. "
            "Rate overall design confidence (0-100%)."
        )
    else:
        ana_desc = (
            "Analyse the research findings. Identify the top 3 insights, "
            "any risks or gaps, and rate overall confidence (0-100%)."
        )

    t3 = Task(
        description=ana_desc,
        expected_output=(
            "Ordered node list with connection arrows and decision branches for the diagram."
            if diagram_mode
            else "Structured analysis: 3 insights/decisions, risks/gaps, confidence score."
        ),
        agent=d_ana,
        context=[t2],
    )

    writer_desc     = _writer_task_desc(topic)
    writer_expected = _writer_expected_output(topic)

    if d_wri is None:
        t3_extended = Task(
            description=ana_desc + "\n\n" + writer_desc,
            expected_output=writer_expected,
            agent=d_ana,
            context=[t2],
        )
        tasks_core = _dedup_tasks([t1, t2, t3_extended])
    else:
        t4 = Task(
            description=writer_desc,
            expected_output=writer_expected,
            agent=d_wri,
            context=[t3],
        )
        tasks_core = _dedup_tasks([t1, t2, t3, t4])

    # ── Extra / custom agents ─────────────────────────────────────────────────────────
    CORE_IDS = {"coordinator", "researcher", "analyst", "writer", "fs_agent"}
    extra = [(aid, a) for aid, a in agents.items() if aid not in CORE_IDS]

    prev_context = [tasks_core[-1]]
    extra_tasks  = []
    seen_extra: set = set()
    for aid, ea in extra:
        if id(ea) in seen_extra:
            continue
        seen_extra.add(id(ea))
        agent_goal = getattr(ea, "goal", "") or ""
        task_desc = (
            f"You are the {ea.role}. Your goal: {agent_goal}\n\n"
            f"Based on the research and output above, apply your expertise to "
            f"'{topic}'. Produce a focused critique, enhancement, or specialist "
            f"contribution that adds value beyond the existing output. "
            f"Be specific — reference actual content from the output above."
        )
        t_extra = Task(
            description     = task_desc,
            expected_output = (
                f"A focused specialist contribution from {ea.role}: "
                "specific insights, critiques, or enhancements referencing the output content."
            ),
            agent   = ea,
            context = prev_context,
        )
        extra_tasks.append(t_extra)
        prev_context = [t_extra]

    return tasks_core + extra_tasks


# ─────────────────────────────────────────────────────────────────────────────
def _dedup_tasks(tasks: list) -> list:
    if not tasks:
        return tasks
    result = [tasks[0]]
    for task in tasks[1:]:
        prev = result[-1]
        if task.agent is not None and task.agent is prev.agent:
            prev.description = (
                prev.description.rstrip()
                + "\n\nADDITIONAL GOAL:\n"
                + task.description.strip()
            )
            prev.expected_output = task.expected_output
            if task.context:
                existing_ctx = list(prev.context or [])
                for ctx_task in task.context:
                    if ctx_task not in existing_ctx and ctx_task is not prev:
                        existing_ctx.append(ctx_task)
                prev.context = existing_ctx or None
        else:
            result.append(task)
    return result
