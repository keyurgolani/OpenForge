# OpenForge

**Self-hosted AI workspace and knowledge management platform.**

Organize your knowledge, have AI-powered conversations grounded in your own knowledge base, and perform semantic search across everything — all running locally, with no data leaving your machine.

---

## Features

- 📝 **Multi-type knowledge** — Notes, fleeting thoughts, bookmarks, and code gists
- 🔍 **Semantic search** — Vector similarity search using a local embedding model (BAAI/bge-small-en-v1.5)
- 💬 **RAG-powered chat** — Conversations that retrieve relevant knowledge as context before answering
- 🤖 **AI features** — Auto-summarize, extract insights (todos, deadlines, highlights, tags), generate titles
- 🔌 **Multi-provider LLM** — OpenAI, Anthropic, Google Gemini, Groq, Ollama (local), DeepSeek, and more
- 🏠 **Self-hosted** — Docker-based single-container deployment, all data stays on your server
- 🔒 **API key encryption** — Provider keys encrypted at rest using Fernet symmetric encryption
- ⌨️ **Command palette** — `Cmd+K` for instant navigation, search, and creation
- ✏️ **CodeMirror Editor** — Full markdown editor with vim mode, syntax highlighting

---

## v2 Features (OpenForge v2)

- 🤖 **Agent Mode** — ReAct loop with tool calling for autonomous actions (filesystem, web search, code execution)
- 👷 **Human-in-the-Loop (HITL)** — Approval workflow for high-risk tool calls with auto-expire
- ⚡ **LLM Router** — Complexity-based routing to appropriate model tiers (simple → fast, complex → capable)
- 🏛️ **LLM Council** — Multi-model deliberation with chairman judging for best response
- 🔎 **Hybrid Search** — BM25 + dense vectors with RRF fusion for better keyword matching
- 📦 **Celery Workers** — Distributed task queue for async agent execution
- 🔧 **MCP Server** — Model Context Protocol server for external tool integration

---

## Architecture (v2)
---

## Quick Start (5 commands)

```bash
# 1. Clone the repository
git clone https://github.com/youruser/openforge.git && cd openforge

# 2. Copy the example environment file
cp .env.example .env

# 3. Set a secure database password
# Edit .env and set DB_PASSWORD to something strong

# 4. Start all services
docker compose up -d

# 5. Open your browser
open http://localhost:3000
```

The onboarding wizard will guide you through adding an LLM provider and creating your first workspace.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DB_PASSWORD` | `changeme` | **Required** — PostgreSQL password |
| `PORT` | `3000` | Port to expose the app on |
| `WORKSPACE_ROOT` | `/workspace` | Internal path for workspace files |
| `WORKSPACE_HOST_PATH` | `./data/workspace` | Host path for workspace volume mount |
| `UPLOADS_HOST_PATH` | `./data/uploads` | Host path for uploads volume mount |
| `POSTGRES_DATA_PATH` | `./data/postgres` | Host path for PostgreSQL data |
| `QDRANT_DATA_PATH` | `./data/qdrant` | Host path for Qdrant vector data |
| `ENCRYPTION_KEY` | *(auto-generated)* | Fernet key for encrypting API keys — **set this for persistence** |
| `LOG_LEVEL` | `warning` | Log verbosity: `debug`, `info`, `warning`, `error` |

> ⚠️ **Set `ENCRYPTION_KEY`** before first run if you want API keys to survive container restarts. Generate one with: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

---

## Development Setup

**Prerequisites:** Node.js 20+, Python 3.11+, Docker

```bash
# Start databases
docker compose up postgres qdrant -d

# Backend (in one terminal)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn openforge.main:app --reload --port 3000

# Frontend (in another terminal)
cd frontend
npm install
npm run dev   # → http://localhost:5173 (proxies /api to port 3000)
```

---

## Testing

Backend tests include unit tests plus API integration tests, with a coverage gate.

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
PYTHONPATH=backend python3 -m pytest
```

The backend pytest configuration enforces:
- strict pytest config/markers
- coverage reporting for key API/service/schema/utility modules
- minimum coverage threshold: **70%**

---

## Architecture (v2)

```
Frontend (React 19 + Vite + Tailwind)
    ↕ HTTP + WebSocket
Backend (FastAPI + Python 3.11)
    ├── PostgreSQL 16          — workspaces, knowledge, conversations, messages, HITL requests
    ├── Qdrant                 — hybrid search (dense + sparse/BM25 vectors, 384-dim)
    ├── Redis 7                — message broker, pub/sub events
    ├── Celery Workers        — async task execution (agent loop, knowledge processing)
    └── Tool Server            — tool execution with MCP support
```

The chat pipeline: user message → embed query → Qdrant hybrid search (BM25 + dense) → agent loop with tool calling → stream from LLM via WebSocket → persist response + source citations.

---

## v2 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` |
| `TOOL_SERVER_URL` | Tool server URL | `http://localhost:3001` |
| `HITL_TIMEOUT_HOURS` | HITL request expiration time | `24` |
| `EMBEDDING_DIMENSION` | Vector embedding dimension | `384` |

### Scaling

Scale Celery workers based on load:
```bash
docker compose up --scale celery-worker=4
```

### Migration from v1

If upgrading from v1, you'll need to:

1. **Re-embed knowledge for BM25**: Run the migration task to add sparse vectors:
   ```bash
   docker compose exec celery-worker celery -A openforge.worker.tasks migrate_knowledge_to_hybrid
   ```

2. **New database tables**: Run migrations for HITL tables.
   ```bash
   docker compose exec openforge alembic upgrade head
   ```

---

## Roadmap

- **v1.1**: Mobile PWA polish, bulk knowledge import (markdown files, Notion export)
- **v2**: Agent loop with tool use (web search, calculator, file tools)
- **v3**: Continuous learning from conversation feedback, shared workspaces (multi-user)

---

## License

MIT — see [LICENSE](./LICENSE)

## Contributing

PRs welcome! Please open an issue first for significant changes.
