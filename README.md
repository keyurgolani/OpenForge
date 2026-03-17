# OpenForge

**Self-hosted AI workspace and knowledge management platform.**

Organize your knowledge, have AI-powered conversations grounded in your own data, build multi-step workflows, and run autonomous missions — all running locally with no data leaving your machine.

OpenForge brings together a personal knowledge base, semantic search, RAG-powered chat, agent tool use, workflow orchestration, and autonomous mission execution into a single self-hosted platform. Connect your own LLM providers (OpenAI, Anthropic, Ollama, and more), import your documents, and let AI agents work with your knowledge.

---

## Features

### Knowledge Management
- **11 knowledge types** — Notes, fleeting notes, bookmarks, code gists, images, audio, PDFs, Word documents, Excel spreadsheets, PowerPoint slides
- **Automatic processing** — Content extraction, chunking, embedding, and indexing happen automatically on upload
- **AI intelligence** — Auto-generated summaries, tags, key insights, todos, and deadlines for every knowledge item
- **Rich editors** — Dedicated editors for each type: rich text for notes, syntax-highlighted code editor for gists, file viewers for documents

### Semantic Search
- **Hybrid search** — Combines dense vector similarity, sparse BM25 keyword matching, and document-level summary matching via Reciprocal Rank Fusion
- **Visual search** — Find similar images using CLIP embeddings
- **Cross-encoder reranking** — Optional reranking for higher relevance (configurable)
- **Evidence building** — Assemble search results into structured evidence packets for research

### RAG-Powered Chat
- **Knowledge-grounded conversations** — The AI retrieves relevant knowledge before every response
- **Real-time streaming** — Responses stream live with a timeline showing model selection, thinking, tool calls, and context sources
- **File attachments** — Attach files directly to messages for inline processing
- **Audio input** — Record voice messages with automatic transcription
- **Model override** — Switch LLM provider/model per message
- **Export** — Export conversations as JSON, Markdown, or plain text

### Agent Tool Use
- **50+ built-in tools** — File operations, shell commands, Git, code analysis, web search, knowledge access, memory, and agent delegation
- **Custom skills** — Install extensions from a skills registry to add new capabilities
- **MCP integration** — Connect external tool providers via the Model Context Protocol
- **Human-in-the-loop** — Configurable approval workflows for high-risk tool calls

### Workflow Orchestration
- **Visual workflows** — Define multi-step AI processes as directed graphs with typed nodes
- **Rich node types** — LLM calls, tool execution, routing, fan-out/join parallelism, human approval gates, artifact emission, and delegation
- **Versioning** — Track workflow changes with full version history
- **Durable execution** — Checkpointed runs with resume-after-failure support

### Autonomous Missions
- **Packaged automation** — Combine workflows, agent profiles, and triggers into deployable autonomous units
- **Triggers** — Schedule missions on cron expressions, intervals, or events
- **Budget policies** — Set limits on runs per day, concurrent executions, and token usage
- **Health monitoring** — Track success rates, costs, and mission health from the operator dashboard

### Agent Profiles
- **Configurable behavior** — Define system prompts, capabilities, model preferences, memory policies, and safety rules
- **Capability bundles** — Composable collections of tools and abilities
- **Catalog templates** — Pre-built profiles, workflows, and missions to clone and customize

### Multi-Provider LLM Support
- **14+ providers** — OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Mistral, OpenRouter, xAI, Cohere, ZhipuAI, HuggingFace, Ollama, and any OpenAI-compatible endpoint
- **Virtual providers** — Router (load balancing), council (multi-model ensemble), and optimizer (prompt optimization) providers
- **Per-capability assignment** — Assign different models to chat, vision, embedding, speech-to-text, text-to-speech, CLIP, and PDF processing
- **API key encryption** — Provider credentials encrypted at rest using Fernet symmetric encryption

### Operator Tools
- **Operator dashboard** — Approval inbox, cost hotspots, failure analysis, evaluation runs, mission health
- **Audit logs** — Full history of tool calls and system events
- **Managed prompts** — Version-controlled prompt templates
- **Policy engine** — Per-tool permission rules with simulation

### Platform
- **Self-hosted** — Docker Compose deployment, all data stays on your server
- **Workspaces** — Isolated organizational containers with their own knowledge, conversations, and settings
- **Dark mode** — Full light and dark theme support
- **Command palette** — `Cmd/Ctrl+K` for instant navigation and actions
- **Keyboard shortcuts** — `Cmd/Ctrl+B` (toggle sidebar), `Cmd/Ctrl+N` (new knowledge)

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/OpenForge-AI/OpenForge.git && cd OpenForge

# 2. Configure environment
cp .env.example .env

# 3. Set a secure database password and encryption key in .env
#    DB_PASSWORD=your_secure_password
#    ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# 4. Start all services
docker compose up -d

# 5. Open your browser
open http://localhost:3100
```

The onboarding wizard will guide you through adding an LLM provider, configuring models, and creating your first workspace.

> **System Requirements:** Docker Engine 24+, 4 GB RAM minimum (8 GB recommended), 10 GB disk space.

---

## Core Concepts

Understanding these concepts will help you get the most out of OpenForge.

### Workspace

A workspace is the top-level organizational unit. Each workspace has its own knowledge base, conversations, search index, and settings. Think of it as a project folder — keep different projects in separate workspaces to maintain focused knowledge bases.

### Knowledge

Knowledge is any information you store in OpenForge: notes, bookmarks, code snippets, documents, images, audio files, and more. When you add knowledge, OpenForge automatically processes it — extracting text, splitting it into chunks, generating vector embeddings, and indexing it for semantic search. This processed knowledge becomes the context that powers your AI conversations.

### Conversation

A conversation is a chat session with an AI agent. Before responding, the agent searches your knowledge base for relevant context, assembles it within the model's context window, and generates a grounded response. Conversations show a full timeline of agent activity: which model was used, what the agent was thinking, which tools were called, and which knowledge was retrieved.

### Profile

A profile defines an agent's behavior — its system prompt, available tools, model preferences, memory strategy, and safety rules. OpenForge includes built-in profiles (workspace agent, router, council, optimizer) and you can create custom profiles for specialized tasks.

### Workflow

A workflow is a directed graph of steps that defines a multi-step AI process. Each node in the graph performs an action (LLM call, tool execution, routing decision, parallel fan-out, human approval gate, etc.) and edges connect nodes to define execution order. Workflows support versioning, so you can iterate on them without losing previous versions.

### Mission

A mission packages a workflow, agent profiles, and triggers into a deployable autonomous unit. While a workflow defines *what* to do, a mission defines *when* and *how* to run it — on a schedule, at intervals, or in response to events — with budget limits and approval policies.

### Run

A run is a single execution of a workflow or mission. Every run creates durable records of each step executed, checkpoints for resumability, runtime events for observability, and any artifacts produced.

### Artifact

An artifact is a durable output — a document, report, analysis, code, or dataset — produced by a run or created manually. Artifacts have versioning (every change creates a new version), lineage (tracking which run or mission produced them), and a status lifecycle (draft, active, superseded, archived).

### Trigger

A trigger defines when a mission should run. Triggers can be schedule-based (cron expressions), interval-based (every N seconds), or event-based (when knowledge is updated, etc.).

### Tool

A tool is a capability that agents can use during conversations or workflow execution — reading files, running shell commands, searching the web, accessing your knowledge base, delegating to other agents, and more. OpenForge includes 50+ built-in tools and supports extending via custom skills and MCP servers.

### Catalog

The catalog is a curated library of pre-built profiles, workflows, and missions. Browse templates, check prerequisites, and clone them into your workspace as starting points for customization.

---

## Architecture

```
Browser (React SPA)
    │
    │ HTTP + WebSocket
    ▼
┌──────────────────────────────────┐
│     OpenForge Backend            │
│   FastAPI + Python 3.11 (:3000)  │
└──────┬──────┬──────┬──────┬──────┘
       │      │      │      │
       ▼      ▼      ▼      ▼
  PostgreSQL  Qdrant  Redis  Tool Server (:8001)
    :5432     :6333   :6379    │
                        │      ├── 50+ tools (filesystem, shell, git, web, ...)
                        │      └── SearXNG (:8080) — web search
                        │
                        ▼
                  Celery Worker
               (background tasks)
```

| Component | Role |
|-----------|------|
| **Backend** | REST API, WebSocket streaming, LLM integration, knowledge processing, workflow orchestration |
| **PostgreSQL** | All structured data — workspaces, knowledge metadata, conversations, workflows, missions, runs, artifacts |
| **Qdrant** | Vector embeddings — semantic search (BGE-small 384-dim), visual search (CLIP 512-dim), agent memory |
| **Redis** | Celery task broker, real-time event pub/sub, session cache, ephemeral memory |
| **Celery Worker** | Background agent execution, knowledge embedding, workflow steps |
| **Tool Server** | Sandboxed tool execution with security boundaries |
| **SearXNG** | Self-hosted web search (no external tracking) |

For detailed architecture documentation, see [docs/architecture.md](docs/architecture.md).

---

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` | `changeme` | PostgreSQL password (**change this**) |
| `ENCRYPTION_KEY` | (auto-generated) | Fernet key for API key encryption (**set and persist this**) |
| `ADMIN_PASSWORD` | (empty) | Login password (empty = auth disabled) |
| `PORT` | `3100` | Host port |
| `LOG_LEVEL` | `warning` | Logging verbosity (`debug`, `info`, `warning`, `error`) |
| `MODELS_HOST_PATH` | `./data/models` | Persistent path for ML model cache |
| `CELERY_WORKERS` | `1` | Number of background worker replicas |

For the full configuration reference, see [docs/configuration.md](docs/configuration.md).

---

## Development

```bash
# Start with hot reloading
docker compose -f docker-compose.dev.yml up -d
```

Or run services manually:

```bash
# Start databases
docker compose up postgres qdrant redis -d

# Backend (terminal 1)
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn openforge.main:app --reload --port 3000

# Frontend (terminal 2)
cd frontend && npm install && npm run dev

# Tool Server (terminal 3)
cd tool_server && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

For the full development guide, see [docs/development.md](docs/development.md).

---

## Documentation

| Document | Description |
|----------|-------------|
| [User Guide](docs/user-guide.md) | Step-by-step walkthrough of every feature |
| [Architecture](docs/architecture.md) | System architecture, data flows, and design decisions |
| [Configuration](docs/configuration.md) | Complete environment variable and settings reference |
| [Deployment](docs/deployment.md) | Production deployment, HTTPS, backups, and scaling |
| [Development](docs/development.md) | Development setup, project structure, and contributing |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |

---

## Contributing

Contributions are welcome! Please open an issue first for significant changes to discuss the approach.

See [Development Guide](docs/development.md) for setup instructions and code placement rules.

---

## License

MIT
