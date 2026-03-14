# OpenForge

**Self-hosted AI workspace and knowledge management platform.**

Organize your knowledge, have AI-powered conversations grounded in your own knowledge base, and perform semantic search across everything — all running locally, with no data leaving your machine.

---

## ⚠️ Project Status: Active Development

OpenForge is currently undergoing a **major architectural transformation** to establish a vision-centric, scalable, and flexible foundation for the future.

### Current Phase: Phase 2 Complete ✅

**Completed:**
- ✅ Phase 1: Product Model Reset and Architecture Lock
- ✅ Phase 2: Codebase Cleanup and Structural Simplification

**Upcoming:**
- Phase 3: Prompt System, Policy Model, and Trust Foundations

For the complete roadmap, see [`sdlc/roadmap.md`](./sdlc/roadmap.md).

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

## Project Structure

```
openforge/
├── backend/
│   └── openforge/
│       ├── api/                    # HTTP routes (thin layer)
│       ├── common/                 # Shared utilities
│       │   ├── config/             # Centralized configuration
│       │   └── errors/             # Exception types
│       ├── db/                     # Database models and migrations
│       ├── domains/                # Domain-driven business logic
│       │   ├── profiles/            # Agent profile definitions
│       │   ├── workflows/           # Workflow definitions
│       │   ├── missions/            # Mission definitions
│       │   ├── triggers/            # Trigger definitions
│       │   ├── runs/                # Run instances
│       │   ├── artifacts/           # Output artifacts
│       │   ├── knowledge/           # Knowledge management
│       │   └── common/              # Shared domain utilities
│       ├── infrastructure/          # Low-level infrastructure
│       │   ├── db/                  # Database connections
│       │   ├── queue/               # Celery and Redis
│       │   └── search/              # Search engine
│       ├── integrations/             # External integrations
│       │   ├── llm/                  # LLM provider integration
│       │   ├── tools/                # Tool server integration
│       │   ├── workspace/            # Workspace file operations
│       │   └── files/                # File handling utilities
│       ├── legacy/                   # Deprecated code (to be removed)
│       ├── runtime/                  # Execution engine
│       ├── schemas/                  # Pydantic schemas
│       ├── services/                 # Application services
│       ├── utils/                    # Utility functions
│       └── main.py                   # Application entry point
├── frontend/
│   └── src/
│       ├── components/               # Shared UI components
│       ├── features/                 # Feature-specific components
│       │   ├── profiles/              # Profile management
│       │   ├── workflows/             # Workflow UI
│       │   ├── missions/              # Mission UI
│       │   ├── runs/                  # Run monitoring
│       │   ├── artifacts/             # Artifact viewing
│       │   └── knowledge/             # Knowledge management
│       ├── hooks/                    # React hooks
│       ├── lib/                       # Utilities and API clients
│       ├── pages/                     # Page components (thin shells)
│       ├── stores/                    # State management
│       ├── styles/                    # CSS and Tailwind
│       └── types/                     # TypeScript types
├── docs/
│   ├── architecture/              # Architecture decisions
│   └── development/                # Development guides
└── tool_server/                   # Tool execution server
```

For detailed information about where code goes, see [`docs/development/where-code-goes.md`](./docs/development/where-code-goes.md).

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` | PostgreSQL connection URL |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server URL |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL |
| `WORKSPACE_ROOT` | `/workspace` | Workspace files directory |
| `UPLOADS_ROOT` | `/uploads` | Uploaded files directory |
| `PORT` | `3000` | Server port |
| `LOG_LEVEL` | `info` | Logging level |
| `ENCRYPTION_KEY` | *(auto-generated)* | Fernet key for API key encryption |
| `ADMIN_PASSWORD` | *(empty)* | Admin password (empty = disabled) |

See [Environment Configuration](./docs/development/environment.md) for all options.

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

## Architecture

```
Frontend (React 19 + Vite + Tailwind)
    ↕ HTTP + WebSocket
Backend (FastAPI + Python 3.11)
    ├── PostgreSQL 16          — workspaces, knowledge, conversations, messages
    ├── Qdrant                 — knowledge chunk embeddings (BAAI/bge-small-en-v1.5, 384-dim)
    └── LiteLLM                — unified LLM gateway (OpenAI, Anthropic, Gemini, Ollama…)
```

The chat pipeline: user message → embed query → Qdrant semantic search → token-budget context assembly → stream from LLM via WebSocket → persist response + source citations.

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

See [Contributor Guidelines](./docs/development/where-code-goes.md) for code placement rules.
