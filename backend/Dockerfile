# ════════════════════════════════════════════════════════════════════════
# Dockerfile — Multi Agent Orchestration Backend
# ════════════════════════════════════════════════════════════════════════
#
# Build:   docker build -t mao-backend .
# Run:     docker run -p 8000:8000 --env-file .env mao-backend
#
# This image contains ONLY the FastAPI backend.
# Ollama runs as a sidecar container (see docker-compose.yml).
# ════════════════════════════════════════════════════════════════════════

FROM python:3.11-slim

# ── System deps ───────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gcc \
        g++ \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory ────────────────────────────────────────────────────
WORKDIR /app

# ── Python dependencies (cached layer) ───────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Optional dependencies (install if available) ─────────────────────────
# duckduckgo-search and yfinance are best-effort — system works without them
RUN pip install --no-cache-dir duckduckgo-search yfinance || true

# ── Application code ──────────────────────────────────────────────────────
COPY . .

# ── Create persistent data directories ───────────────────────────────────
# These will be overridden by Docker volumes in production
RUN mkdir -p reports uploads knowledge_base data agents tools logs

# ── Non-root user (security best practice) ───────────────────────────────
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# ── Health check ─────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

# ── Expose port ──────────────────────────────────────────────────────────
EXPOSE 8000

# ── Startup ──────────────────────────────────────────────────────────────
# PYTHONWARNINGS=ignore suppresses harmless CrewAI/Pydantic v1→v2 warnings
CMD ["sh", "-c", "PYTHONWARNINGS=ignore uvicorn main:app --host 0.0.0.0 --port 8000"]
