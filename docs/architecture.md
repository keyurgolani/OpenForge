# Architecture

This document describes the technical architecture of OpenForge, covering the system components, execution pipelines, domain model, and key design decisions.

## System Overview

OpenForge is a distributed application composed of seven services that communicate over HTTP, WebSocket, and Redis pub/sub:

- **Backend (openforge)** — FastAPI application serving the REST API, WebSocket connections, and coordinating all business logic
- **Frontend** — React 19 SPA served by the backend in production, or via Vite dev server in development
- **Tool Server** — Lightweight FastAPI microservice providing sandboxed tool execution
- **PostgreSQL** — Primary relational database for all structured data
- **Qdrant** — Vector database for semantic search, visual search, and agent memory
- **Redis** — Message broker (Celery), real-time event pub/sub, HITL coordination, session cache
- **SearXNG** — Self-hosted meta-search engine for web search capabilities
- **Celery Worker** — Background task processor sharing the backend codebase

## Services

### Backend

The main application server built with **FastAPI** (Python 3.11). Handles:

- REST API endpoints for all CRUD operations
- WebSocket connections for real-time chat streaming
- Database management (PostgreSQL via async SQLAlchemy + Alembic migrations)
- Vector database operations (Qdrant for embeddings)
- LLM provider integration (via LiteLLM for unified interface)
- Agent blueprint compilation and registry
- Strategy-based execution (chat, researcher, reviewer, builder, watcher, coordinator)
- Knowledge processing pipeline (chunking, embedding, indexing)
- Authentication and session management

**Key directories:**

- `api/` — HTTP route handlers (thin layer, delegates to services)
- `core/` — Core business logic (embedding, search, context assembly, LLM gateway, prompt resolution)
- `services/` — Application services (knowledge processing, LLM management, conversations, automation config)
- `runtime/` — Execution engines (chat_handler, strategy_executor, tool_loop, handoff_engine, agent_registry)
- `runtime/strategies/` — Strategy plugins (chat, researcher, reviewer, builder, watcher, coordinator)
- `domains/` — Domain-driven services (agents, automations, knowledge, retrieval, runs, outputs, common)
- `db/` — Database models, migrations, and clients (PostgreSQL, Qdrant, Redis)
- `worker/` — Celery task definitions
- `middleware/` — HTTP middleware (authentication)
- `integrations/` — External integrations (tool dispatcher, MCP)

### Celery Worker

A separate Python process running **Celery** with a solo pool for asyncio compatibility. Handles:

- Agent execution tasks (long-running LLM interactions)
- Knowledge processing (embedding generation, content extraction)
- Automation runs
- Background intelligence generation

The worker shares the same codebase as the backend but runs tasks asynchronously. Redis serves as the message broker.

### Tool Server

A lightweight **FastAPI** microservice (Python 3.12) that provides sandboxed tool execution. Features:

- 50+ built-in tools across 10 categories
- Auto-discovery of tool categories on startup
- Security layer (path traversal guards, command blocking, URL validation)
- Untrusted content boundary for external HTTP responses
- Tool aliasing to handle common naming mistakes
- Skill management (install/remove/search via skills CLI)

**Tool categories:** filesystem, shell, git, language (code analysis), workspace (knowledge/chat access), memory, http, agent (delegation), task, skills

**Protocol:** Every tool implements a `BaseTool` abstract class with a standard interface: `id`, `category`, `display_name`, `description`, `input_schema`, `risk_level`, and `execute(params, context)`.

### PostgreSQL

Primary relational database (v16) storing all structured data:

- Configuration and settings
- LLM provider configurations (with encrypted API keys)
- Workspaces, conversations, and messages
- Knowledge metadata and processing state
- Agents (blueprints, compiled specs)
- Automations (trigger config, budget config, output routing)
- Runs and run steps
- Outputs (versioned artifacts with lineage)
- Approval requests and audit logs

### Qdrant

Vector database (v1.13.2) storing embeddings for semantic search:

- **openforge_knowledge** — Knowledge chunk embeddings with named vectors:
  - `text` vector (384-dim, BAAI/bge-small-en-v1.5) for semantic search
  - `summary` vector (384-dim) for document-level matching
  - Sparse vectors for hybrid BM25 keyword search
- **openforge_visual** — CLIP embeddings (512-dim, ViT-B-32) for image similarity search
- **openforge_memory** — Agent long-term memory vectors

### Redis

In-memory data store (v7) used for:

- Celery task broker and result backend
- Pub/sub for real-time event streaming (agent events to WebSocket)
- HITL (human-in-the-loop) approval coordination between processes
- Agent execution cancellation signals
- Stream state caching for reconnecting clients
- Session caching

### SearXNG

Self-hosted meta-search engine providing web search capabilities to the `http.search_web` tool. Runs internally with no external tracking.

## Agent Execution Pipeline

### Blueprint to Execution

```
Agent Blueprint (YAML + Markdown)
    |
    v
1. Parse agent.md (frontmatter + body)
    |
    v
2. AgentBlueprintCompiler:
   a. Check idempotency (source_md_hash)
   b. Upsert system profile
   c. Build workspace directory for system prompt
   d. Create CompiledAgentSpec (immutable)
   e. Persist CompiledAgentSpecModel with version
   f. Update agent.active_spec_id
    |
    v
3. AgentRegistry resolves spec at runtime:
   a. resolve_for_workspace() — find workspace's default agent
   b. resolve(slug=...) — find agent by slug
    |
    v
4. Execution path depends on context:

   Interactive Chat (ChatHandler):
     a. Resolve agent via agent_registry
     b. Load tools (built-in + MCP)
     c. Assemble context (system prompt + history + attachments + mentions)
     d. Resolve LLM provider for workspace
     e. Execute tool_loop (LLM call + tool dispatch + HITL cycle)
     f. Stream events via Redis pub/sub to WebSocket
     g. Persist assistant message with timeline

   Strategy Run (StrategyExecutor):
     a. Lookup strategy from registry (fallback to "chat")
     b. Create RunModel
     c. Build RunContext with provider config
     d. Execute run_strategy_loop:
        - plan() — strategy generates execution plan
        - execute_step() — strategy executes each step
        - should_continue() — strategy decides whether to continue
        - aggregate() — strategy combines results
     e. Persist run output and transition status
```

### Strategy Plugin System

Strategies define how agents execute. Each strategy implements the `AgentStrategy` protocol:

| Method | Purpose |
|--------|---------|
| `plan(ctx)` | Generate an execution plan (list of steps) |
| `execute_step(ctx, step)` | Execute a single step |
| `should_continue(ctx, latest)` | Decide whether to continue after a step |
| `aggregate(ctx)` | Combine results from all steps |

**Built-in strategies:**

| Strategy | Behavior |
|----------|----------|
| **chat** | Interactive conversation with tool loop. Single-step, loop-driven. |
| **researcher** | Plan-driven research with evidence gathering and synthesis. |
| **reviewer** | Code/document review with structured feedback. |
| **builder** | Multi-step artifact construction (code, documents, reports). |
| **watcher** | Monitoring loop that observes and reacts to changes. |
| **coordinator** | Orchestrates multiple sub-agents via handoff. |

Strategies are registered in a global registry. The `strategy` field in an agent blueprint selects which strategy to use.

### Tool Loop

The tool loop (`runtime/tool_loop.py`) is the core LLM interaction cycle used by both `ChatHandler` and strategy steps:

1. Call LLM with messages and tool definitions
2. If LLM returns tool calls:
   a. Check tool permissions via PolicyEngine
   b. If approval required, create HITL request and wait
   c. Execute tool via Tool Server or MCP
   d. Feed tool result back to LLM
   e. Repeat
3. If LLM returns text, return the response
4. Enforce rate limits and iteration caps

## Knowledge Pipeline

```
Upload/Create Knowledge
    |
    v
1. Store metadata in PostgreSQL
2. Extract text content:
   - PDFs -> PDF processor
   - DOCX -> Document processor
   - XLSX -> Sheet processor
   - PPTX -> Slides processor
   - Images -> CLIP embeddings + optional OCR
   - Audio -> Whisper transcription
   - Bookmarks -> Web content extraction
    |
    v
3. Chunk text into ~512-token segments
    |
    v
4. Generate embeddings for each chunk:
   - Dense vector (384-dim BGE-small)
   - Sparse BM25 vector (for keyword matching)
   - Summary vector (for document-level matching)
    |
    v
5. Index in Qdrant with metadata payload
    |
    v
6. (Optional) Generate AI intelligence:
   - Summary, tags, key insights
   - Store back in PostgreSQL
```

### Search Pipeline

```
Search Query
    |
    v
1. Embed query with BGE-small (384-dim)
    |
    v
2. Four-representation search in Qdrant:
   a. Dense vector search (semantic similarity)
   b. Sparse BM25 search (keyword matching)
   c. Summary vector search (document-level)
   d. Reciprocal Rank Fusion (RRF) to combine results
    |
    v
3. (Optional) Cross-encoder reranking (ms-marco-MiniLM-L-6-v2)
    |
    v
4. Filter by workspace, type, tags, score threshold
    |
    v
5. Context expansion (retrieve surrounding chunks)
    |
    v
6. Return ranked results with metadata
```

## Domain Model

### 7 Backend Domains

| Domain | Purpose |
|--------|---------|
| **agents** | Agent blueprints, compilation, profiles, specs |
| **automations** | Automation definitions with trigger, budget, and output config |
| **knowledge** | Knowledge item management (via existing services) |
| **retrieval** | Search, evidence building, retrieval tracing |
| **runs** | Execution tracking (runs, run steps, checkpoints, events) |
| **outputs** | Versioned output artifacts with lineage and sinks |
| **common** | Shared enums, utilities, and base types |

### Core Entities

```
Workspace
 +-- Knowledge (notes, bookmarks, gists, documents, PDFs, images, audio, etc.)
 +-- Conversations
 |    +-- Messages (with attachments, tool calls, thinking, timeline)
 +-- Settings overrides

Agent (workspace-agnostic)
 +-- Blueprint (YAML frontmatter + Markdown system prompt)
 +-- Compiled Specs (versioned immutable snapshots)
 +-- Profile (auto-generated from compilation)
 +-- Strategy (chat, researcher, reviewer, builder, watcher, coordinator)
 +-- Tools (allowed categories, blocked IDs, confirmation requirements)

Automation
 +-- Agent reference (by slug)
 +-- Trigger Config (manual, cron, interval, event)
 +-- Budget Config (rate limits, token limits, cooldowns)
 +-- Output Routing Config (artifact types)

Run (execution instance)
 +-- Run Steps (individual step executions)
 +-- Checkpoints (state snapshots for durability)
 +-- Runtime Events (execution log)
 +-- Emitted Outputs

Output (durable result)
 +-- Versions (content history)
 +-- Lineage Links (provenance to runs, automations, knowledge)
 +-- Sinks (publication destinations)
```

### Entity Relationships

```
Agent --compiled into--> CompiledAgentSpec
Agent --has--> AgentProfile
Automation --references--> Agent (by slug)
Automation --triggers--> Run
Run --executes via--> Strategy
Run --owns--> Run Steps
Run --emits--> Outputs
Output --has--> Versions
Knowledge --embedded in--> Qdrant vectors
```

## Key Design Decisions

### Blueprint-Driven Agents
Agents are defined as `.md` files with YAML frontmatter (identity, strategy, model, tools, retrieval) and a Markdown body (system prompt, constraints). This format is human-readable, version-controllable, and diff-friendly. Blueprints are compiled into immutable `CompiledAgentSpec` objects with hash-based idempotency.

### Strategy Plugin Architecture
The runtime uses a strategy pattern for agent execution. Each strategy implements `plan`, `execute_step`, `should_continue`, and `aggregate`. This decouples execution behavior from the agent definition and makes it straightforward to add new execution modes without modifying the core runtime.

### Workspace-Agnostic Agents
Agents are not scoped to a workspace. They can access knowledge from any workspace through cross-workspace search. This enables agents that serve as domain experts across multiple knowledge bases.

### Async-First Architecture
The entire backend uses async I/O — asyncpg for PostgreSQL, async httpx for tool server calls, and async WebSocket handling. This maximizes throughput for concurrent users and long-running LLM calls.

### Hybrid Search (Dense + Sparse)
Search uses four-representation retrieval combining dense semantic vectors, sparse BM25 keyword vectors, and document-level summary vectors, merged via Reciprocal Rank Fusion. This provides both semantic understanding and keyword precision.

### Tool Server Separation
Tools run in a separate microservice with security boundaries (path traversal guards, command blocking, content boundary wrapping). This isolates potentially dangerous operations from the main application.

### Event-Driven Streaming
Agent responses stream via Redis pub/sub bridged to WebSocket connections. This decouples the Celery worker (which runs the LLM call) from the web server (which serves the WebSocket), enabling horizontal scaling.

### Virtual LLM Providers
Beyond standard providers (OpenAI, Anthropic, etc.), OpenForge supports virtual providers — router (load balancing), council (multi-model ensemble), and optimizer (prompt optimization) — that compose standard providers into higher-level abstractions.

## Security Model

### API Key Encryption
All LLM provider API keys are encrypted at rest using Fernet symmetric encryption. The encryption key is configurable and must be persisted across restarts.

### Authentication
Optional password-based authentication with JWT sessions. When `ADMIN_PASSWORD` is set, all API routes (except health and auth endpoints) require a valid session cookie. When unset, authentication is disabled (suitable for local/trusted networks).

### Tool Security
The tool server enforces:

- **Path traversal protection** — All file paths are resolved and validated to stay within workspace boundaries
- **Command blocking** — Dangerous shell commands (rm -rf, dd, mkfs, shutdown, etc.) are blocked by pattern matching
- **URL validation** — Only HTTP/HTTPS protocols are allowed
- **Content boundary** — External HTTP responses are wrapped in `<untrusted_content>` tags to prevent prompt injection

### Tool Permissions
Per-tool permission levels (allow, block, require approval) are configurable. Each tool declares a default risk level (low, medium, high, critical). The PolicyEngine evaluates permissions before every tool execution in the tool loop.

### CORS
Configurable CORS origins via the `CORS_ORIGINS` setting. Defaults to allow all origins (`*`) for local development.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS, Radix UI, TanStack Query, Zustand |
| Backend | FastAPI, Python 3.11, SQLAlchemy (async), Alembic, Pydantic |
| Task Queue | Celery 5.4 with Redis broker |
| Databases | PostgreSQL 16, Qdrant 1.13.2, Redis 7 |
| LLM Integration | LiteLLM (unified interface to 14+ providers) |
| Embeddings | BAAI/bge-small-en-v1.5 (text), CLIP ViT-B-32 (images) |
| Search | Hybrid dense+sparse with optional cross-encoder reranking |
| Tool Server | FastAPI (Python 3.12), httpx, 50+ tools |
| Web Search | SearXNG (self-hosted) |
| Orchestration | Docker Compose |

---

*For user-facing feature documentation, see [User Guide](user-guide.md). For deployment instructions, see [Deployment](deployment.md).*
