"""
tasks_crew.py — Dynamic task pipeline builder
Supports three modes:
  research  — full 4-agent pipeline (default)
  query     — single-agent quick answer (simple Q&A / maths)
  file      — file-aware pipeline with read_uploaded_file context

Fix history:
  [FIX] Issue #4 — When fewer than 4 agents are active the original code
        assigned the same Agent object to multiple tasks.  CrewAI 0.51
        sequential mode hangs when the same agent appears in consecutive
        tasks while it is still marked as 'active'.
        New approach: collect distinct agents in phase order, then build
        only as many tasks as there are distinct agents, merging later
        phase goals into earlier tasks when needed.
"""
from crewai import Task
from typing import Optional
from datetime import datetime
import re


# ── Real-time query detection ────────────────────────────────────────────────────
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


def _needs_realtime(topic: str) -> bool:
    """Return True if the topic likely needs live data from web_search."""
    return bool(_REALTIME_PATTERNS.search(topic))


def _now_context() -> str:
    """Return a formatted current date/time string for injection into prompts."""
    now = datetime.now()
    return (
        f"[SYSTEM INFO — Current date/time: "
        f"{now.strftime('%A, %d %B %Y')} | "
        f"Time: {now.strftime('%H:%M:%S')} | "
        f"Day: {now.strftime('%A')} | "
        f"Week: {now.strftime('%W')} of {now.year}]"
    )


def _distinct_agents(agents: dict, phase_order: list) -> list:
    """
    Return a list of (phase_name, Agent) pairs in phase order,
    deduplicating so the same Agent object never appears twice.
    Extra agents (not in phase_order) are appended at the end.

    This prevents CrewAI 0.51 sequential-mode deadlocks that occur when
    the same Agent is assigned to consecutive tasks.
    """
    seen: set = set()
    result = []
    # Core phases first
    for name in phase_order:
        agent = agents.get(name)
        if agent is not None and id(agent) not in seen:
            seen.add(id(agent))
            result.append((name, agent))
    # Extra / custom agents
    for name, agent in agents.items():
        if name not in phase_order and id(agent) not in seen:
            seen.add(id(agent))
            result.append((name, agent))
    return result


CORE_PHASES = ["coordinator", "researcher", "analyst", "writer"]


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

    # Always inject current date/time so agents never guess
    now_ctx   = _now_context()
    realtime  = _needs_realtime(topic)
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

    # ── Quick query / maths mode ────────────────────────────────────────────────────
    if mode == "query":
        responder = res or wri or coord
        if realtime:
            description = (
                f"{now_ctx}\n\n"
                f"TASK: Answer this query using LIVE data: '{topic}'\n"
                f"{rt_instruction}\n\n"
                "Your response format:\n"
                "Line 1: The exact value/answer from the tool (e.g. 'Infosys (INFY): \u20b91,842.50 \u25b2+12.30 (+0.67%)')\n"
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

    # ── File analysis mode ────────────────────────────────────────────────────────
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
            description=(
                f"Write a report answering: '{topic}' using the analysis from the previous task. "
                "IMPORTANT: The very first line of your response MUST be the format declaration.\n"
                "FORMAT: md      \u2190 narrative reports and summaries\n"
                "FORMAT: html    \u2190 structured output with tables\n"
                "FORMAT: csv     \u2190 primarily tabular data\n"
                "FORMAT: json    \u2190 structured/API-style data\n"
                "FORMAT: txt     \u2190 plain prose\n\n"
                "After the FORMAT line, write the full report with Summary, Key Findings, "
                "and Conclusion."
            ),
            expected_output=(
                "First line must be: FORMAT: <md|html|csv|json|txt>\n"
                "Remainder: complete report in that format."
            ),
            agent=wri or coord,
            context=[analysis_task],
        )
        # Deduplicate: skip tasks whose agent is same object as prior task
        raw = [file_task, analysis_task, report_task]
        return _dedup_tasks(raw)

    # ── Full research pipeline (default) ──────────────────────────────────
    #
    # [FIX #4] Use _distinct_agents() to get a deduplicated ordered list
    # so we never assign the same Agent object to consecutive tasks.
    #
    distinct = _distinct_agents(agents, CORE_PHASES)

    # Map phase slot -> Agent (or None if not enough distinct agents)
    def _slot(index: int):
        return distinct[index][1] if index < len(distinct) else None

    d_coord = _slot(0)  # always present (build_agents raises if 0 agents)
    d_res   = _slot(1)
    d_ana   = _slot(2)
    d_wri   = _slot(3)

    file_context = ""
    if uploaded_files:
        file_context = (
            f" Uploaded files are available for reference: {', '.join(uploaded_files)}. "
            "Use read_uploaded_file to access them if relevant."
        )

    # Build all four task descriptions regardless of agent count;
    # _dedup_tasks() will merge/drop phases sharing the same agent.
    t1 = Task(
        description=(
            f"{now_ctx}\n\n"
            f"Analyse the research topic: '{topic}'.{file_context}{rt_instruction} "
            "Break it into 3 focused research questions. "
            "Output a numbered list of questions with 1-sentence justification each."
        ),
        expected_output="3 numbered research questions with justification.",
        agent=d_coord,
    )

    if d_res is None:
        # Only 1 distinct agent — coordinator does everything
        t_solo = Task(
            description=(
                f"{now_ctx}\n\n"
                f"Research, analyse, and write a full report on: '{topic}'.{file_context}{rt_instruction}\n"
                "Use web_search to gather facts. Analyse findings. "
                "Start your final answer with 'FORMAT: txt' on its own line, "
                "then write the complete report."
            ),
            expected_output="FORMAT: txt\n<full research report>",
            agent=d_coord,
        )
        return [t_solo]

    t2 = Task(
        description=(
            f"{now_ctx}\n\n"
            f"Using the research questions, gather key facts and data about: '{topic}'.{file_context}{rt_instruction}\n"
            "Use web_search to find information. "
            "If the topic involves current/real-time data (date, weather, news, prices), "
            "call web_search with the specific query to get live results. "
            "Compile findings as bullet points (minimum 5 points). "
            "Never write placeholder text — only include facts you actually retrieved."
        ),
        expected_output="Bullet-point list of factual findings (min 5 points). No placeholders.",
        agent=d_res,
        context=[t1],
    )

    if d_ana is None:
        # 2 distinct agents — researcher writes the report too
        t2_extended = Task(
            description=(
                f"{now_ctx}\n\n"
                f"Using the research questions, gather key facts and data about: '{topic}'.{file_context}{rt_instruction}\n"
                "Use web_search to find information. Compile findings as bullet points (minimum 5 points). "
                "Then analyse the findings: identify the top 3 insights, any risks or gaps, "
                "and rate overall confidence (0–100%). "
                "Start your final answer with 'FORMAT: txt' on its own line, "
                "then write a complete report."
            ),
            expected_output="FORMAT: txt\n<research findings + analysis + report>",
            agent=d_res,
            context=[t1],
        )
        return _dedup_tasks([t1, t2_extended])

    t3 = Task(
        description=(
            "Analyse the research findings. Identify the top 3 insights, "
            "any risks or gaps, and rate overall confidence (0–100%)."
        ),
        expected_output="Structured analysis: 3 insights, risks/gaps, confidence score.",
        agent=d_ana,
        context=[t2],
    )

    if d_wri is None:
        # 3 distinct agents — analyst writes the report
        t3_extended = Task(
            description=(
                "Analyse the research findings. Identify the top 3 insights, "
                "any risks or gaps, and rate overall confidence (0–100%). "
                "Then write a complete report on the topic. "
                "IMPORTANT: The very first line MUST be the FORMAT declaration.\n"
                "FORMAT: txt     \u2190 DEFAULT — plain prose, summaries, general research\n"
                "FORMAT: md      \u2190 if markdown formatting genuinely adds value\n"
                "After the FORMAT line, write the full report."
            ),
            expected_output=(
                "First line must be: FORMAT: <txt|md>\n"
                "Remainder: complete report."
            ),
            agent=d_ana,
            context=[t2],
        )
        tasks_core = _dedup_tasks([t1, t2, t3_extended])
    else:
        t4 = Task(
            description=(
                f"Write a report on '{topic}' based on the analysis. "
                "IMPORTANT: The very first line MUST be the FORMAT declaration.\n"
                "Choose the BEST format based on content type:\n"
                "FORMAT: txt     \u2190 DEFAULT — plain prose, summaries, general research\n"
                "FORMAT: csv     \u2190 ONLY if output is a data table, comparison, or ranking\n"
                "FORMAT: json    \u2190 ONLY if output is structured key/value or API-style data\n"
                "FORMAT: html    \u2190 ONLY if output has complex tables or rich structure\n"
                "FORMAT: log     \u2190 ONLY if output is a timeline or event log\n"
                "FORMAT: md      \u2190 if markdown formatting genuinely adds value\n\n"
                "After the FORMAT line, write the full report.\n"
                "For 'txt': clear prose paragraphs — this is the DEFAULT for most topics.\n"
                "For 'csv': header row, then one row per finding, commas only, no extra text.\n"
                "For 'json': valid JSON — object with keys: title, summary, findings[].\n"
                "For 'html': complete valid HTML fragment with h2/p/ul/table elements.\n"
                "For 'log': timestamped lines newest-last: [HH:MM] Event description.\n"
                "For 'md': ## headings, bullet lists; include Introduction, Findings, Conclusion."
            ),
            expected_output=(
                "First line must be: FORMAT: <md|html|csv|json|txt>\n"
                "Remainder: complete report in that format."
            ),
            agent=d_wri,
            context=[t3],
        )
        tasks_core = _dedup_tasks([t1, t2, t3, t4])

    # ── Custom / extra agents — each gets a dedicated task ─────────────────────
    # Exclude the four core phases AND fs_agent.
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
            f"Based on the research and report above, apply your expertise to "
            f"'{topic}'. Produce a focused critique, enhancement, or specialist "
            f"analysis that adds value beyond the existing report. "
            f"Be specific — reference actual content from the report."
        )
        t_extra = Task(
            description      = task_desc,
            expected_output  = (
                f"A focused specialist contribution from {ea.role}: "
                "specific insights, critiques, or enhancements referencing the report content."
            ),
            agent   = ea,
            context = prev_context,
        )
        extra_tasks.append(t_extra)
        prev_context = [t_extra]

    return tasks_core + extra_tasks


# ---------------------------------------------------------------------------
# Deduplication helper
# ---------------------------------------------------------------------------

def _dedup_tasks(tasks: list) -> list:
    """
    Remove tasks whose agent object is identical to the immediately
    preceding task's agent.  When that happens, the duplicate task's
    description is appended to the prior task's description so no
    instructions are lost.

    This prevents CrewAI 0.51 sequential-mode deadlocks.
    """
    if not tasks:
        return tasks
    result = [tasks[0]]
    for task in tasks[1:]:
        prev = result[-1]
        if task.agent is not None and task.agent is prev.agent:
            # Merge: append this task's description and update expected_output
            prev.description = (
                prev.description.rstrip()
                + "\n\nADDITIONAL GOAL:\n"
                + task.description.strip()
            )
            prev.expected_output = task.expected_output  # use the later stage's output spec
            # Merge context
            if task.context:
                existing_ctx = list(prev.context or [])
                for ctx_task in task.context:
                    if ctx_task not in existing_ctx and ctx_task is not prev:
                        existing_ctx.append(ctx_task)
                prev.context = existing_ctx or None
        else:
            result.append(task)
    return result
