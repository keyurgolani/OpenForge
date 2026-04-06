# OpenForge

**Self-hosted AI workspace platform with knowledge-grounded agents, automations, and tool use.**

OpenForge brings together a personal knowledge base, semantic search, RAG-powered chat, configurable AI agents, scheduled automations, and 50+ tools into a single self-hosted platform. Connect your own LLM providers, import your documents, and let AI agents work with your knowledge — all running locally with no data leaving your machine.

---

## Features

### Knowledge
- **11 knowledge types** — Notes, fleeting notes, bookmarks, code gists, images, audio, PDFs, Word documents, Excel spreadsheets, PowerPoint slides
- **Automatic processing** — Content extraction, chunking, embedding, and indexing happen automatically on upload
- **AI intelligence** — Auto-generated summaries, tags, key insights, todos, and deadlines
- **Hybrid search** — Dense vector similarity + sparse BM25 keyword matching + document-level summary matching via Reciprocal Rank Fusion
- **Visual search** — Find similar images using CLIP embeddings

### Chat
- **Global agent selection** — Chat is workspace-agnostic; select any agent (including workspace-specific agents) for direct conversation
- **Parameterized input extraction** — The system extracts values for agent input parameters from chat messages, asking follow-up questions when needed
- **Knowledge-grounded conversations** — The AI retrieves relevant knowledge before every response
- **Real-time streaming** — Responses stream live with a timeline showing model selection, thinking, tool calls, and context sources
- **File attachments and audio input** — Attach files or record voice messages with automatic transcription
- **Model override** — Switch LLM provider/model per message
- **Prompt optimization** — Optional optimizer agent rewrites prompts before the main agent processes them

### Agents
- **Structured definitions** — Agents are defined with explicit fields: identity, LLM config, tools config, memory config, input parameters, output definitions, and a template-driven system prompt
- **Template engine** — System prompts use a template language with variables, loops, conditionals, and 40+ built-in functions. Hardcoded preamble/postamble sections auto-document inputs, outputs, and application context
- **Input parameters & output definitions** — Typed input parameters (text, enum, number, boolean) and structured output definitions enable parameterized agents with reliable output extraction
- **Version snapshots** — Every save creates an immutable version snapshot for audit and rollback
- **Workspace-agnostic** — Agents exist globally and can access knowledge across all workspaces
- **Per-tool access control** — Each tool can be set to allowed, HITL (human-in-the-loop approval), or disabled per agent
- **6 built-in agent templates** — Chat Assistant, Deep Researcher, Code Reviewer, Content Builder, Change Watcher, Team Coordinator

### Automations
- **DAG workflows** — Build multi-agent workflows on a drag-and-drop canvas by wiring agent nodes and sink nodes together
- **Node wiring** — Connect output variables of one agent to input parameters of another, or fill inputs with static values
- **Trigger types** — Manual, scheduled (cron), interval-based
- **Budget policies** — Max runs per day, concurrent run limits, token budgets, failure cooldowns
- **Graph validation** — DAG structure validation before deployment

### Deployments
- **Live automation instances** — Deploy an automation with concrete input values and an attached trigger
- **Lifecycle management** — Pause, resume, and tear down deployments
- **Execution tracking** — Each deployment execution creates a run with full step-by-step history
- **Celery Beat scheduling** — Cron and interval triggers managed via the deployment scheduler

### Missions
- **Autonomous goal pursuit** — Define a goal, directives, constraints, and evaluation rubric, then let an agent work toward it over multiple cycles
- **OODA execution model** — Each cycle runs five phases: Perceive, Plan, Act, Evaluate, Reflect
- **Ratchet evaluation** — Rubric-based scoring with configurable ratchet modes (strict/relaxed) to prevent quality regression
- **Budget and cadence controls** — Max cost, token limits, cycle caps, and configurable execution intervals
- **Owned workspaces** — Each mission gets a dedicated workspace for its knowledge and artifacts

### Sinks
- **6 sink types** — Log, Knowledge Create, Knowledge Update, Article, REST API, Notification
- **Reusable definitions** — Define sinks once, wire them into any automation as output destinations
- **Configurable inputs** — Each sink type has typed inputs that can be wired from agent outputs or filled with static values
- **Automation integration** — Sink nodes appear on the automation canvas alongside agent nodes

### Outputs
- **Versioned artifacts** — Every material change creates a new version
- **Lineage tracking** — Links back to the run, automation, or agent that produced the output
- **Status lifecycle** — Draft, active, superseded, archived
- **Publishing sinks** — Route outputs to configurable destinations

### Tools
- **50+ built-in tools** across 10 categories: filesystem, shell, git, language, workspace, memory, http, agent, task, skills
- **Custom skills** — Install extensions from a skills registry
- **MCP integration** — Connect external tool providers via the Model Context Protocol
- **Human-in-the-loop** — Configurable approval requirements for high-risk tool calls

### Multi-Provider LLM Support
- **14+ providers** — OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Mistral, OpenRouter, xAI, Cohere, ZhipuAI, HuggingFace, Ollama, and any OpenAI-compatible endpoint
- **Virtual providers** — Router (load balancing), council (multi-model ensemble), and optimizer (prompt optimization)
- **Per-capability assignment** — Assign different models to chat, vision, embedding, speech-to-text, text-to-speech, CLIP, and PDF processing
- **API key encryption** — Provider credentials encrypted at rest using Fernet symmetric encryption

### Platform
- **Self-hosted** — Docker Compose deployment, all data stays on your server
- **Workspaces** — Isolated knowledge containers with their own conversations, search indices, and settings
- **Dark mode** — Full light and dark theme support
- **Command palette** — `Cmd/Ctrl+K` for instant navigation and actions

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/OpenForge-AI/OpenForge.git && cd OpenForge

# 2. Configure environment
cp .env.example .env
# Edit .env: set DB_PASSWORD and ENCRYPTION_KEY

# 3. Start all services
docker compose up -d
# Open http://localhost:3100
```

The onboarding wizard will guide you through adding an LLM provider, configuring models, and creating your first workspace.

> **System Requirements:** Docker Engine 24+, 4 GB RAM minimum (8 GB recommended), 10 GB disk space.

---

## Architecture

```
Browser (React SPA)
    |
    | HTTP + WebSocket
    v
+----------------------------------+
|     OpenForge Backend            |
|   FastAPI + Python 3.11 (:3000)  |
+------+------+------+------+-----+
       |      |      |      |
       v      v      v      v
  PostgreSQL  Qdrant  Redis  Tool Server (:8001)
    :5432     :6333   :6379    |
                        |      +-- 50+ tools (filesystem, shell, git, web, ...)
                        |      +-- SearXNG (:8080) - web search
                        v
                  Celery Worker
               (background tasks)
```

| Component | Role |
|-----------|------|
| **Backend** | REST API, WebSocket streaming, LLM integration, template engine, agent runtime, knowledge processing, mission scheduling |
| **PostgreSQL** | All structured data — workspaces, knowledge metadata, conversations, agents, automations, deployments, missions, runs, outputs, sinks |
| **Qdrant** | Vector embeddings — semantic search (BGE-small 384-dim), visual search (CLIP 512-dim), agent memory |
| **Redis** | Celery task broker, real-time event pub/sub, HITL coordination, session cache |
| **Celery Worker** | Background agent execution, knowledge embedding, automation runs |
| **Tool Server** | Sandboxed tool execution with security boundaries |
| **SearXNG** | Self-hosted web search (no external tracking) |

For detailed architecture documentation, see [docs/architecture.md](docs/architecture.md).

---

## Core Concepts

### Knowledge
Any information you store in OpenForge. When you add knowledge, OpenForge automatically processes it — extracting text, chunking, generating embeddings, and indexing for semantic search. This processed knowledge becomes the context that powers your AI conversations.

### Chat
A conversation with an AI agent that has access to your knowledge base. The agent searches for relevant context, assembles it within the model's context window, and generates a grounded response. Conversations show a full timeline of agent activity.

### Agent
An agent is a structured definition with explicit fields: identity (name, slug, description, tags), LLM configuration, tool access settings, memory settings, typed input parameters, structured output definitions, and a template-driven system prompt. Every save creates an immutable version snapshot. Agents are workspace-agnostic and can search any workspace's knowledge.

### Chat
A direct, one-off agent invocation via the conversational UI. The user selects any agent, sends a message, and the system extracts input parameter values from the conversation. Chat is workspace-agnostic — agents can be selected globally.

### Automation
A DAG workflow built by wiring agent nodes and sink nodes together on a canvas. Agent output variables connect to other agents' input parameters. Automations define reusable flows that do nothing until deployed.

### Deployment
A live instance of an automation, created when a user deploys it with concrete input values and an attached trigger (manual, cron, or interval). Deployments can be paused, resumed, and torn down.

### Mission
A long-running autonomous objective. Missions define a goal, directives, constraints, and an evaluation rubric, then assign an agent to pursue the goal over multiple OODA cycles (Perceive → Plan → Act → Evaluate → Reflect). Missions have budget controls, cadence scheduling, and ratchet-based quality evaluation.

### Sink
A reusable output destination that defines what happens with agent results. Six types are available: log, knowledge create, knowledge update, article (filesystem), REST API, and notification (webhook). Sinks are wired into automations as output nodes.

### Run
A single execution instance — from a chat session, an automation trigger, or a mission cycle. Runs track individual steps, tool calls, token usage, and emitted outputs.

### Output
A durable result produced by a run or created manually — a document, report, analysis, code, or dataset. Outputs have versioning, lineage tracking, and a status lifecycle (draft, active, superseded, archived).

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
