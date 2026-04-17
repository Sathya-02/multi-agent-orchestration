# 🏆 Best Practices — Multi-Agent Orchestration v7.0.0

> Auto-maintained by the Self-Improver scheduler. Human-editable. Last updated: April 2026.

---

## 1. Model Selection

| Use Case | Recommended Model | Why |
|----------|-------------------|-----|
| General research & quick queries | `phi3:mini` (3.8B) | Fast, low RAM (~2.3 GB), good for summaries |
| Multi-step reasoning, structured output | `llama3.2:3b` (3B) | Better instruction following, structured JSON |
| Self-improver analysis | `llama3.2:3b` | Reliably produces valid JSON improvement arrays |
| Long-form report writing | `llama3.2:3b` or larger | Consistent FORMAT routing and metadata footers |
| RAG semantic embeddings | `nomic-embed-text` | Only supported embedding model — do not swap |

**Rule:** Always set `model_override` to `llama3.2:3b` in Self-Improver settings. `phi3:mini` produces weak analysis JSON and often ignores tool-call instructions.

---

## 2. Agent Design

- **Keep roles unique and specific.** No two agents may share the same role string — the system enforces deduplication.
- **Write goals as action verbs**, e.g. *"Research and synthesise the top 5 data points on…"* rather than vague labels.
- **Backstory = expertise + constraint.** State what the agent is expert in AND what it must NOT do (e.g. "Do not fabricate statistics — always cite the tool result").
- **Limit `max_iter` to 10–15** for custom agents. Higher values cause timeout on M1 8 GB without meaningfully improving output.
- **Set `allow_delegation: false`** for specialist agents (Analyst, Writer, custom agents). Only the Coordinator should delegate.
- **Use SKILLS.md as the source of truth.** Values in `SKILLS.md` override `custom_agents.json`. Edit via the 📄 button in Agent Manager — changes take effect on the next job without restart.

### Built-in Agent Pipeline Order

```
Coordinator → Researcher → Analyst → Writer → [Custom Agents]
```

Custom agents always run **after** the Writer and receive the full prior report as context. Design custom agents to review, augment, or reformat — not to duplicate prior work.

---

## 3. Tool Usage

- **Assign tools explicitly in SKILLS.md.** Listing only needed tools keeps agent context focused and reduces token usage.
- **Never assign `fs_write_file` or `fs_edit_file` to Researcher/Analyst.** Only the File System Agent or purpose-built agents should write to disk.
- **Custom tool code must be pure Python** — no network calls (no `requests`, `urllib`) unless you have confirmed internet access in the execution environment.
- **Always return a string** from custom tool `_run()`. Returning `None` or a non-string will silently fail and produce an empty tool result.
- **Test custom tools in isolation** via the TOOL.md editor before assigning to agents — syntax errors surface cleanly there rather than mid-job.
- **Keep tool descriptions under 150 characters.** Longer descriptions confuse small models during tool selection.

---

## 4. Research Job Topics

- **Keep topics under 10 words** when using `phi3:mini`. Longer prompts cause the model to truncate context mid-pipeline.
- **Be specific, not broad.** `"Impact of AI on software development jobs 2024"` outperforms `"AI"`.
- **Avoid ambiguous pronouns** in follow-up queries. Always name the subject explicitly.
- **For real-time data**, use Quick Query mode (`💬`) — not Research mode. Research mode adds pipeline overhead for data that agents already have.

---

## 5. Web Search

- **Enable web search before running any finance/weather/news queries.** Without it, agents fall back to training data with a clear `[MOCK]` disclaimer.
- **Install both packages for full coverage:**
  ```bash
  pip install duckduckgo-search yfinance
  ```
- **Use ticker symbols directly** for stocks not in `KNOWN_TICKERS`: `"INFY.NS current price"` always works.
- **Add custom tickers to `KNOWN_TICKERS`** in `web_search_tool.py` — company-name matching is case-insensitive but must be in the map.
- **Timeout is 10 s by default.** On slow networks, increase to 15 s in Settings → Web Search → Config.
- **Do not disable web search globally** to save RAM — it costs no memory when not invoked.

---

## 6. RAG / Knowledge Base

- **Pull `nomic-embed-text` before ingesting documents.** Without it, keyword fallback is used and semantic similarity is lost.
  ```bash
  ollama pull nomic-embed-text
  ```
- **Use chunk size 400 / overlap 80 (defaults)** for most documents. Increase chunk size to 600 for technical manuals with dense tables.
- **Lower `min_score` to 0.10** when the knowledge base is small (< 5 documents) — the default 0.25 may exclude all results.
- **Use the 🔍 Test Search tab** before running a job to verify that the KB returns relevant chunks for your expected queries.
- **Do not store duplicate sources.** Delete and re-ingest if you update a document — duplicate chunks lower retrieval quality.
- **Back up `rag_store.json` regularly.** It is the only persistence layer; if deleted, all ingested documents must be re-indexed.

---

## 7. Self-Improver

- **Run on a 6-hour cycle** (default). Shorter cycles increase LLM load; longer cycles miss rapid usage pattern changes.
- **Set `min_confidence` to 0.70** — below this, proposed changes are too speculative to auto-apply.
- **Review `IMPROVEMENT_PROPOSALS.md` weekly.** Structural changes (role renames, tool reassignments) are intentionally held back for human approval.
- **Use `llama3.2:3b` as `model_override`** — it reliably outputs the JSON arrays expected by the improvement parser.
- **Trigger `🔄 Run Now`** after major changes to agents or tools to get immediate feedback.
- **Monitor `IMPROVEMENT_LOG.md`** — each entry shows what changed, why, and the confidence score. A pattern of low-confidence cycles suggests the activity log is too sparse (run more jobs).

---

## 8. Memory & Performance (M1 8 GB)

- **Only run one model at a time.** `ollama ps` shows current VRAM usage — unload unused models with `ollama stop <model>`.
- **Use `gemma2:2b`** when RAM is under pressure — 1.6 GB, capable for simple tasks.
- **Restart Ollama between heavy jobs** if responses start truncating — `pkill ollama && ollama serve`.
- **Close browser tabs with the 3D boardroom** if not actively monitoring — Three.js renders consume ~300 MB of RAM.
- **Keep `max_iter ≤ 10`** for all agents under `phi3:mini`. Higher values can cause OOM-triggered process kills on M1 8 GB.
- **Backend venv activation is mandatory** before any `pip install`. Global Python on macOS will not have the project dependencies.

---

## 9. Filesystem Agent

- **Configure folder permissions with least privilege.** Add Read-only first; enable Write/Edit only when confirmed needed.
- **Always use full `/Users/...` paths** when adding folders on macOS — the `/home/...` symlink is stored alongside but audited separately.
- **Check the Audit Log** (📋 tab) before debugging "access denied" errors — the exact denied path is logged with a timestamp.
- **Output directory** should point to a dedicated folder (e.g. `/Users/you/AgentReports`) — not your Desktop or Documents root.

---

## 10. Telegram Bot

- **Always install into the activated venv:**
  ```bash
  source venv/bin/activate
  pip install "python-telegram-bot==20.7"
  ```
  Other versions may break the asyncio event-loop integration.
- **Use `/query` for real-time data** — it uses the same intent-detection as Quick Query mode in the browser.
- **Set `notify_chat_id`** to receive automatic push notifications on job completion — works for both browser-triggered and Telegram-triggered jobs.
- **Do not run two bot instances** against the same token — only one polling loop can be active.

---

## 11. Custom Agent & Tool Spawn Requests

- **Review spawn requests promptly.** Pending requests block the Coordinator from adding the specialist to running jobs.
- **Approve sparingly.** Each approved agent adds pipeline overhead (one extra LLM call per job). Only approve if the role is genuinely reusable.
- **Reject duplicate-role requests.** The system checks role uniqueness, but similar-but-not-identical roles can slip through — verify before approving.
- **Spawned tools are active immediately** — test them via the TOOL.md editor before the next job to catch runtime errors early.

---

## 12. Report Quality

- **Use `llama3.2:3b` for structured formats (CSV, JSON, HTML).** `phi3:mini` frequently defaults to `.txt` regardless of the FORMAT instruction.
- **Include confidence signals in Analyst backstory:** *"Always end your analysis with `Confidence: XX%` on its own line."* This ensures the metadata footer captures the score.
- **For long reports (> 2000 words),** use `.md` or `.html` format — they preserve headings and structure better than `.txt`.
- **Download and archive important reports** — `backend/reports/` is not version-controlled and can be wiped during a project reset.

---

## 13. Security

- **Never hardcode secrets** (API tokens, passwords) in TOOL.md code blocks or SKILLS.md files — these are stored as plaintext JSON.
- **Use environment variables** for Telegram tokens and any third-party API keys:
  ```bash
  export TELEGRAM_BOT_TOKEN="..."
  export TELEGRAM_ALLOWED_CHAT_IDS="..."
  ```
- **Restrict Filesystem Write/Edit permissions** — a misconfigured agent with edit access to `/Users/you/` can overwrite arbitrary files.
- **Run the backend on `0.0.0.0:8000` only on trusted networks.** There is no authentication layer on the API by default.

---

*This file is rewritten after each Self-Improver cycle based on observed agent activity patterns.*  
*Manual edits are preserved unless the self-improver is configured to overwrite without diff-checking.*
