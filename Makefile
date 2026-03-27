# ════════════════════════════════════════════════════════════════
# Makefile — Multi Agent Orchestration
# ════════════════════════════════════════════════════════════════
# Usage:
#   make setup       — first-time local setup
#   make dev         — start all services locally (no Docker)
#   make docker      — start with Docker Compose (local)
#   make docker-down — stop Docker services
#   make pull-models — pull required Ollama models
#   make clean       — remove generated runtime files

.PHONY: setup dev docker docker-cloud docker-down pull-models clean lint

# ── Local development ─────────────────────────────────────────────────────

setup:
	@echo "▶ Setting up backend..."
	cd backend && python3.11 -m venv venv
	cd backend && ./venv/bin/pip install --upgrade pip setuptools wheel
	cd backend && ./venv/bin/pip install -r requirements.txt
	cd backend && ./venv/bin/pip install pypdf python-docx openpyxl psutil requests
	@echo "▶ Patching CrewAI telemetry (Python 3.11 compat)..."
	cd backend && sed -i '' 's/import pkg_resources/import importlib.metadata as pkg_resources/' \
		venv/lib/python3.11/site-packages/crewai/telemetry/telemetry.py 2>/dev/null || true
	@echo "▶ Setting up frontend..."
	cd frontend && npm install
	@echo "▶ Installing optional packages..."
	cd backend && ./venv/bin/pip install duckduckgo-search yfinance python-telegram-bot==20.7 || true
	@echo "✅ Setup complete. Run: make dev"

dev:
	@echo "▶ Starting Ollama + Backend + Frontend..."
	@echo "   Open http://localhost:5173 in your browser"
	@( ollama serve & \
	   sleep 3 && \
	   cd backend && PYTHONWARNINGS=ignore ./venv/bin/uvicorn main:app \
	     --host 0.0.0.0 --port 8000 --reload & \
	   sleep 2 && \
	   cd frontend && npm run dev )

backend:
	cd backend && PYTHONWARNINGS=ignore ./venv/bin/uvicorn main:app \
		--host 0.0.0.0 --port 8000 --reload

frontend:
	cd frontend && npm run dev

pull-models:
	@echo "▶ Pulling recommended Ollama models..."
	ollama pull phi3:mini
	ollama pull llama3.2:3b
	ollama pull nomic-embed-text
	@echo "✅ Models ready"

# ── Docker ────────────────────────────────────────────────────────────────

docker:
	@echo "▶ Starting with Docker Compose (local)..."
	@[ -f .env ] || cp .env.example .env
	docker compose --env-file .env up -d --build
	@echo "✅ Running at http://localhost:3000"
	@echo "   Pull a model: make docker-pull MODEL=phi3:mini"

docker-pull:
	docker compose exec ollama ollama pull $(MODEL)

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f backend

docker-cloud:
	@echo "▶ Deploying to cloud..."
	@[ -f .env.cloud ] || (echo "❌ Create .env.cloud from .env.cloud.example first"; exit 1)
	docker compose -f docker-compose.yml -f docker-compose.cloud.yml \
		--env-file .env.cloud up -d --build
	@echo "✅ Cloud deployment started"

docker-scale:
	docker compose -f docker-compose.yml -f docker-compose.cloud.yml \
		--env-file .env.cloud up -d --scale worker=$(N)

# ── Utilities ─────────────────────────────────────────────────────────────

clean:
	rm -rf backend/reports/* backend/uploads/* backend/logs/*
	rm -f backend/data/*.json backend/data/*.jsonl
	find backend -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	find frontend -name "node_modules" -prune -o -name "dist" -exec rm -rf {} + 2>/dev/null || true
	@echo "✅ Runtime files cleaned"

lint:
	cd backend && ./venv/bin/python -m py_compile \
		settings.py main.py agent_registry.py agents_crew.py tasks_crew.py \
		tools.py tool_registry.py rag_engine.py web_search_tool.py \
		telegram_bot.py self_improver.py
	@echo "✅ Backend syntax OK"
