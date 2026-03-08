# OpenForge

**Self-hosted AI workspace and knowledge management platform.**

Organize your knowledge, chat with AI grounded in your own knowledge base, and run autonomous agents with tool use — all running locally, with no data leaving your server.

---

## Features

### Knowledge Management
- **Multi-type knowledge** — Notes, fleeting thoughts, bookmarks, and code gists
- **Hybrid semantic search** — BM25 + dense vector search with RRF fusion for accurate keyword and semantic matching
- **Document ingestion** — Upload and index PDF, DOCX, XLSX, PPTX, images, audio, and plain text files
- **Visual search** — Find visually similar images using CLIP embeddings
- **AI enrichment** — Auto-summarize, extract insights (todos, deadlines, highlights, tags), generate titles
- **Chat history search** — Past Q&A exchanges are embedded and searchable as knowledge

### Chat & Agents
- **RAG-powered chat** — Conversations grounded in your knowledge base with source citations
- **Agent mode** — ReAct loop with tool calling for autonomous actions (filesystem, web search, code execution)
- **Human-in-the-Loop (HITL)** — Inline approval workflow for high-risk tool calls before execution
- **Skills** — Filesystem-based skill scripts the agent can discover and invoke

### LLM Flexibility
- **Multi-provider** — OpenAI, Anthropic, Google Gemini, Groq, Ollama (local), DeepSeek, and any OpenAI-compatible endpoint
- **LLM Router** — Automatically routes prompts to the right model tier based on complexity
- **LLM Council** — Multiple models deliberate in parallel; a chairman selects the best response
- **Prompt Optimizer** — Rewrites user prompts before forwarding to the target model
- **MCP integration** — Model Context Protocol support for external tools

### Platform
- **Admin auth** — Optional password protection with JWT session cookies
- **API key encryption** — Provider keys encrypted at rest using Fernet symmetric encryption
- **Command palette** — `Cmd+K` for instant navigation, search, and creation
- **CodeMirror editor** — Full markdown editor with vim mode and syntax highlighting
- **Self-hosted** — Docker Compose deployment, all data stays on your server

---

## Quick Start

```bash
git clone https://github.com/keyurgolani/openforge.git && cd openforge
cp .env.example .env          # edit .env and set DB_PASSWORD
docker compose up -d
open http://localhost:3100
```

The onboarding wizard will guide you through adding an LLM provider and creating your first workspace.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DB_PASSWORD` | `changeme` | **Required** — PostgreSQL password |
| `PORT` | `3100` | Host port to expose the app on |
| `ENCRYPTION_KEY` | *(auto-generated)* | Fernet key for encrypting API keys at rest |
| `ADMIN_PASSWORD` | *(unset)* | Enable password-protected login when set |
| `WORKSPACE_HOST_PATH` | `./data/workspace` | Host path for workspace file storage |
| `UPLOADS_HOST_PATH` | `./data/uploads` | Host path for uploaded files |
| `SKILLS_HOST_PATH` | `./data/skills` | Host path for agent skill scripts |
| `POSTGRES_DATA_PATH` | `./data/postgres` | Host path for PostgreSQL data |
| `QDRANT_DATA_PATH` | `./data/qdrant` | Host path for Qdrant vector data |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL |
| `TOOL_SERVER_URL` | `http://tool-server:3001` | Tool server URL |
| `HITL_TIMEOUT_HOURS` | `24` | Hours before a pending HITL request expires |
| `LOG_LEVEL` | `warning` | Log verbosity: `debug`, `info`, `warning`, `error` |

> **Set `ENCRYPTION_KEY`** before first run to persist API keys across container restarts:
> ```bash
> python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
> ```

### Scaling Workers

```bash
docker compose up --scale celery-worker=4
```

---

## Architecture

```
Frontend (React + TypeScript + Vite + Tailwind)
    ↕ HTTP + WebSocket
Backend (FastAPI + Python 3.11)
    ├── PostgreSQL 16     — workspaces, knowledge, conversations, messages, HITL requests
    ├── Qdrant            — hybrid search (dense + sparse/BM25 vectors, 384-dim)
    ├── Redis 7           — Celery broker, pub/sub for streaming events
    ├── Celery Workers    — async agent execution, knowledge processing
    └── Tool Server       — sandboxed tool execution with MCP support
```

**Chat pipeline:** user message → hybrid search (BM25 + dense) → agent loop with tool calling → stream response via WebSocket → persist with source citations → embed Q&A for future search.

---

## Development Setup

**Prerequisites:** Node.js 20+, Python 3.11+, Docker

```bash
# Start infrastructure
docker compose up postgres qdrant redis -d

# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn openforge.main:app --reload --port 3000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # → http://localhost:5173 (proxies /api to port 3000)
```

---

## Testing

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
PYTHONPATH=backend python3 -m pytest
```

Coverage is enforced at a minimum of **70%** across API, service, schema, and utility modules.

---

## License

MIT — see [LICENSE](./LICENSE)

## Contributing

PRs welcome. Please open an issue first for significant changes.
