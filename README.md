# OpenForge

**Self-hosted AI workspace and knowledge management platform.**

Organize your knowledge, have AI-powered conversations grounded in your own knowledge base, and perform semantic search across everything — all running locally, with no data leaving your machine.

---

## ⚠️ Project Status: Active Development

OpenForge is currently undergoing a **major architectural transformation** to establish a vision-centric, scalable, and flexible foundation for the future.

### Current Phase: Phase 1 Complete ✅

We have successfully completed **Phase 1: Product Model Reset and Architecture Lock**, which involved:

- **Breaking Changes**: The codebase is undergoing intentional breaking changes to replace the agent-centric architecture with a domain-driven design
- **New Architecture**: Established final domain model (Profiles, Workflows, Missions, Triggers, Runs, Artifacts, Knowledge)
- **Database Reset**: New schema aligned with final product vocabulary
- **Legacy Isolation**: Old agent-centric code marked for deprecation

### Roadmap

The complete transformation plan is documented in [`sdlc/roadmap.md`](./sdlc/roadmap.md), which outlines 14 phases across 5 waves:

**Wave 1 — Foundation Reset** (In Progress)
- ✅ Phase 1: Product Model Reset and Architecture Lock (Complete)
- ⏳ Phase 2: Codebase Cleanup and Structural Simplification
- ⏳ Phase 3: Prompt System, Policy Model, and Trust Foundations

**Future Waves:**
- Wave 2: Retrieval, Knowledge, and Product Shell
- Wave 3: Core Model Refactor
- Wave 4: Runtime, Orchestration, and Autonomy
- Wave 5: Curated Capability Layer and Final Productization

### What This Means for You

- **Breaking Changes**: Expect database schema changes, API changes, and navigation updates
- **Migration Path**: Legacy features remain functional during transition but are marked for deprecation
- **New Development**: All new work targets the final domain architecture

For detailed information about each phase, see the [complete roadmap](./sdlc/roadmap.md).

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
