"""
tasks_crew.py — Dynamic task pipeline builder
Supports three modes:
  research  — full 4-agent pipeline (default)
  query     — single-agent quick answer (simple Q&A / maths)
  file      — file-aware pipeline with read_uploaded_file context
"""
from crewai import Task
from typing import Optional
from datetime import datetime
import re


# ── Real-time query detection ─────────────────────────────────────────────
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

    # ── Quick query / maths mode ──────────────────────────────────────────
    if mode == "query":
        responder = res or wri or coord
        if realtime:
            # For real-time queries: ONLY the tool result matters
            description = (
                f"{now_ctx}\n\n"
                f"TASK: Answer this query using LIVE data: '{topic}'\n"
                f"{rt_instruction}\n\n"
                "Your response format:\n"
                "Line 1: The exact value/answer from the tool (e.g. 'Infosys (INFY): ₹1,842.50 ▲+12.30 (+0.67%)')\n"
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

    # ── File analysis mode ────────────────────────────────────────────────
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
                "FORMAT: md      ← narrative reports and summaries\n"
                "FORMAT: html    ← structured output with tables\n"
                "FORMAT: csv     ← primarily tabular data\n"
                "FORMAT: json    ← structured/API-style data\n"
                "FORMAT: txt     ← plain prose\n\n"
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
        return [file_task, analysis_task, report_task]

    # ── Full research pipeline (default) ─────────────────────────────────
    all_agents = list(agents.values())
    coord  = coord or all_agents[0]
    res    = res   or (all_agents[1] if len(all_agents) > 1 else coord)
    ana    = ana   or (all_agents[2] if len(all_agents) > 2 else res)
    wri    = wri   or (all_agents[3] if len(all_agents) > 3 else ana)

    file_context = ""
    if uploaded_files:
        file_context = (
            f" Uploaded files are available for reference: {', '.join(uploaded_files)}. "
            "Use read_uploaded_file to access them if relevant."
        )

    t1 = Task(
        description=(
            f"{now_ctx}\n\n"
            f"Analyse the research topic: '{topic}'.{file_context}{rt_instruction} "
            "Break it into 3 focused research questions. "
            "Output a numbered list of questions with 1-sentence justification each."
        ),
        expected_output="3 numbered research questions with justification.",
        agent=coord,
    )
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
        agent=res,
        context=[t1],
    )
    t3 = Task(
        description=(
            "Analyse the research findings. Identify the top 3 insights, "
            "any risks or gaps, and rate overall confidence (0–100%)."
        ),
        expected_output="Structured analysis: 3 insights, risks/gaps, confidence score.",
        agent=ana,
        context=[t2],
    )
    t4 = Task(
        description=(
            f"Write a report on '{topic}' based on the analysis. "
            "IMPORTANT: The very first line MUST be the FORMAT declaration.\n"
            "Choose the BEST format based on content type:\n"
            "FORMAT: txt     ← DEFAULT — plain prose, summaries, general research\n"
            "FORMAT: csv     ← ONLY if output is a data table, comparison, or ranking\n"
            "FORMAT: json    ← ONLY if output is structured key/value or API-style data\n"
            "FORMAT: html    ← ONLY if output has complex tables or rich structure\n"
            "FORMAT: log     ← ONLY if output is a timeline or event log\n"
            "FORMAT: md      ← if markdown formatting genuinely adds value\n\n"
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
        agent=wri,
        context=[t3],
    )

    # ── Core pipeline ──────────────────────────────────────────────────────
    tasks = [t1, t2, t3, t4]

    # ── Custom / extra agents — each gets a dedicated task ─────────────────
    # Exclude the four core agents AND fs_agent (file ops run separately).
    CORE_IDS = {"coordinator", "researcher", "analyst", "writer", "fs_agent"}
    extra = [(aid, a) for aid, a in agents.items() if aid not in CORE_IDS]

    prev_context = [t4]
    for aid, ea in extra:
        # Build a role-specific description from the agent's own goal
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
        tasks.append(t_extra)
        prev_context = [t_extra]   # chain: each extra agent sees the previous extra output

    return tasks
