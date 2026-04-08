# Design Document

## Product definition
This project is a local-first AI operations console for orchestrating multiple specialized agents that collaborate on research, quick answers, file analysis, retrieval over user documents, and optional real-time web retrieval. The README positions the experience around transparency, control, extensibility, and live observability rather than a simple black-box chat interface.

## Objectives
- Deliver trustworthy multi-agent outputs with visible execution state and clear phase progression.
- Keep the core AI stack local through Ollama and CrewAI, with optional integrations separated behind explicit configuration.
- Support operator-controlled extensibility with custom agents, custom tools, and editable markdown-based behavior definitions.
- Preserve operability on constrained hardware such as an M1 MacBook Air 8 GB, which the README names as the optimization target.

## Personas
- **Operator**: runs jobs, reviews reports, adjusts models, and monitors the system.
- **Builder**: creates custom agents and tools, edits `SKILLS.md` and `TOOL.md`, and tunes knowledge-base behavior.
- **Admin**: configures filesystem access, reviews audit logs, manages Telegram and self-improver settings, and approves spawn requests.

## Core user journeys

### 1. Run research
The operator selects Research mode, enters a topic, launches the workflow, watches the boardroom and feed update in real time, and downloads the final report. The README states that research jobs run through Coordinator, Researcher, Analyst, and Writer, with custom agents executing afterward.

### 2. Ask a quick question
The operator uses Quick Query for direct questions or live data requests. Queries with real-time intent are classified and routed to providers such as Yahoo Finance, wttr.in, WorldTimeAPI, ExchangeRate-API, DuckDuckGo, or Wikipedia.

### 3. Analyze files
The operator uploads documents and triggers File Analysis mode. Agents read uploaded files, analyze them, and produce a structured report.

### 4. Extend the system
The builder creates a custom agent or tool in the managers, which persists into JSON definitions and markdown sidecar files. Spawn-request workflows let the system suggest new agents or tools for human approval.

### 5. Ground outputs in private knowledge
The operator ingests text or files into the RAG knowledge base, tests search quality, and then benefits from automatic knowledge-base retrieval in later jobs. The README documents chunking, embeddings via `nomic-embed-text`, a keyword fallback, and persistent vector storage in `ragstore.json`.

## Functional requirements

### Job system
- Support Research, Quick Query, and File Analysis modes.
- Persist job results in multiple formats including TXT, CSV, JSON, HTML, LOG, and Markdown.
- Append metadata including model and sampling information to saved reports.

### Multi-agent runtime
- Include built-in Coordinator, Researcher, Analyst, Writer, and File System agents.
- Allow custom agents to be created, edited, activated, deactivated, and persisted across restarts.
- Ensure role deduplication so no two agents share the same role.

### Tooling
- Include built-in tools for live search, KB search, summarization, calculators, file reads, data analysis, and filesystem actions.
- Support runtime-created custom Python tools with persistent `TOOL.md` definitions.
- Allow tool spawn requests with human approval.

### Knowledge base
- Ingest PDF, DOCX, TXT, MD, CSV, JSON, HTML, and LOG content into searchable chunks.
- Support semantic embeddings with a documented fallback to keyword-frequency pseudo-embeddings.
- Expose direct KB testing through UI and API.

### Filesystem access
- Let admins define path-based read, write, and edit permissions.
- Persist filesystem configuration and log every access decision in an audit trail.

### Integrations
- Support Telegram bot control and report delivery.
- Support scheduled self-improvement cycles that rewrite `BESTPRACTICES.md` and propose or apply selected improvements.

## Non-functional requirements
- **Transparency**: runtime activity must be visible in the UI through scene animation, state badges, and feed entries.
- **Resilience**: when live search is disabled, the system should return honest disabled-state messages instead of fabricated real-time data.
- **Performance**: the product should remain usable on Apple Silicon laptops with modest memory budgets.
- **Persistence**: configuration and user-defined entities must survive process restarts via on-disk JSON and markdown files.
- **Extensibility**: new tools and agents should be loaded without invasive code edits to the core runtime.

## UI design principles
- Use the 3D boardroom as a situational awareness surface, not the only control surface.
- Keep operational controls close to data with context drawers and inspector panels.
- Prioritize readable event streams, explicit approval states, and quick report access.
- Distinguish active, inactive, pending-approval, and error states consistently across cards, feed items, and overlays.

## Event model
The README documents a WebSocket stream with job, agent, spawn, and config events. The implementation should formalize those into a typed frontend event bus so the boardroom, feed, and detail panels are all driven by the same source of truth.

## Risk areas
- Runtime-compiled custom tools increase flexibility but require stronger validation and isolation.
- Long-running multi-agent jobs may outlast UI attention spans without compact progress summaries and resumable report access.
- Feature breadth can overwhelm users unless navigation, state hierarchy, and overlay behavior stay disciplined.

## Recommended deliverables in repo
- `docs/architecture-plan.md`
- `docs/design-document.md`
- `docs/ui-overlay-design.md`
- `templates/orchestration-ui-template.html`
These files translate the README-defined system into maintainable project documentation and a concrete UI direction.
