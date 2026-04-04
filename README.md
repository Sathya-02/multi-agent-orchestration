# 🤖 Multi Agent Orchestration

> A fully local, offline multi-agent AI system with a real-time 3D executive boardroom, live web search with stock prices, RAG knowledge base, Telegram bot control, and autonomous self-improvement — no cloud API keys required.

**CrewAI · Ollama · FastAPI · WebSockets · React 18 · Three.js · Vite · python-telegram-bot**  
Optimized for **MacBook Air M1 8 GB** · Version **7.0.0**

---

## What This Is

Five built-in AI agents collaborate to research topics, answer questions with real-time data, analyse uploaded files, and read/write local files. Everything runs locally via Ollama. No internet connection required for the core pipeline — web search and Telegram are opt-in.

The system has three major additions over the base multi-agent pattern:

**🌐 Real-time Web Search** — agents automatically detect when a query needs live data (stock prices, weather, exchange rates, current date/time, news) and route to the appropriate provider — Yahoo Finance for stocks, wttr.in for weather, WorldTimeAPI for time, ExchangeRate-API for currency, DuckDuckGo for everything else. All providers require zero API keys.

**📚 RAG / Knowledge Base** — upload your own documents (PDF, DOCX, TXT, CSV, JSON, HTML) and agents will search them using vector similarity before answering. Uses Ollama's `nomic-embed-text` for semantic embeddings. Falls back to keyword search if embeddings are unavailable. Results are injected into agent context automatically.

**🔄 Autonomous Self-Improvement** — a background scheduler reads all agent and tool definitions, reviews recent job activity, and uses the LLM to rewrite `BEST_PRACTICES.md` and optionally update agent goals and tool descriptions — entirely hands-free.

```