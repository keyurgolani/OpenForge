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
- **Celery Worker** — Background task processor sharing the backend codebase, with logarithmic autoscaling

## Services

### Backend

The main application server built with **FastAPI** (Python 3.11). Handles:

- REST API endpoints for all CRUD operations
- WebSocket connections for real-time chat streaming
- Database management (PostgreSQL via async SQLAlchemy + Alembic migrations)
- Vector database operations (Qdrant for embeddings)
- LLM provider integration (via LiteLLM for unified interface)
- Agent definition management and runtime config building
- Template engine for system prompt rendering (variables, loops, conditionals, functions)
- Agent execution via ChatHandler (interactive) and agent_executor (background)
- Mission execution via mission_executor (OODA cycles)
- Deployment scheduling via Celery Beat
- Knowledge processing pipeline (chunking, embedding, indexing)
- Authentication and session management

**Key directories:**

- `api/` — HTTP route handlers (thin layer, delegates to services)
- `core/` — Core business logic (embedding, search, context assembly, LLM gateway, prompt resolution)
- `services/` — Application services (knowledge processing, LLM management, conversations, automation config)
- `runtime/` — Execution engines (chat_handler, agent_executor, tool_loop, handoff_engine, agent_registry, graph_executor, deployment_scheduler, input_extraction, prompt_context)
- `runtime/template_engine/` — Template engine (parser, renderer, variable extractor, built-in functions, types)
- `domains/` — Domain-driven services (agents, automations, deployments, knowledge, retrieval, runs, outputs, common)
- `db/` — Database models, migrations, and clients (PostgreSQL, Qdrant, Redis)
- `worker/` — Celery task definitions
- `middleware/` — HTTP middleware (authentication, request logging)
- `integrations/` — External integrations (tool dispatcher, MCP)

### Celery Worker

A separate Python process running **Celery** with a solo pool for asyncio compatibility. Handles:

- Agent execution tasks (long-running LLM interactions)
- Knowledge processing (embedding generation, content extraction)
- Automation runs
- Background intelligence generation

The worker shares the same codebase as the backend but runs tasks asynchronously. Redis serves as the message broker. Workers auto-scale concurrency using a logarithmic autoscaler that grows capacity as `ceil(log2(current + 1))` when utilization exceeds 75%.

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
- Agent definitions (structured configs, version snapshots)
- Automations (DAG workflows with node wiring)
- Deployments (live automation instances with triggers)
- Missions and mission cycles (autonomous goal pursuit with OODA model)
- Sinks (reusable output destination definitions)
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

### Definition to Execution

```
Agent Definition (structured fields)
    |
    v
1. AgentDefinitionModel stores:
   - Identity: name, slug, description, icon, tags
   - LLM config: provider, model, temperature, max_tokens, allow_override
   - Tools config: per-tool access mode (allowed, hitl, disabled)
   - Memory config: history_limit, attachment_support, auto_bookmark_urls
   - Parameters: typed input parameters (text, enum, number, boolean)
   - Output definitions: structured output variables (text, json, number, boolean)
   - System prompt: template-driven with context-aware preamble/postamble
    |
    v
2. On save → immutable AgentDefinitionVersionModel snapshot
    |
    v
3. At runtime → build_runtime_config():
   - Resolves provider/model names
   - Builds allowed_tools and confirm_before_tools lists
   - Extracts input_schema and output_definitions
   - Returns AgentRuntimeConfig
    |
    v
4. Template engine renders system prompt:
   - Inject system variables (workspaces, agents, tools, skills, timestamps)
   - Inject user input values for parameters
   - Inject output.* namespace for output variable references
   - Render context-aware preamble (varies by execution context):
     - CHAT: conversational guidance with content-informed output
     - AUTOMATION: structured JSON output format instructions
   - Render user's editable section
   - Render postamble (application context, available agents/skills)
    |
    v
5. Execution path depends on context:

   Interactive Chat (ChatHandler):
     a. Resolve agent via agent_registry
     b. Extract input values from chat message (input_extraction)
     c. Load tools (built-in + MCP)
     d. Render system prompt via template engine
     e. Resolve LLM provider for workspace
     f. Execute tool_loop (LLM call + tool dispatch + HITL cycle)
     g. Stream events via Redis pub/sub to WebSocket
     h. Persist assistant message with timeline

   Background Agent Run (execute_agent):
     a. Create or load RunModel
     b. Build messages with system prompt
     c. Load tools, resolve LLM provider
     d. Execute tool_loop (same engine as interactive chat)
     e. Persist run output and transition status

   Deployment (GraphExecutor):
     a. Load automation DAG with node wiring
     b. Build AUTOMATION-context preamble/postamble for each agent node
     c. Topologically sort nodes
     d. Execute each agent node, passing wired outputs as inputs
     e. Route final outputs to sink nodes
```

### Mission Execution

Missions provide autonomous, multi-cycle goal pursuit using the OODA model:

```
Mission (goal, directives, constraints, rubric)
    |
    v
1. MissionScheduler polls for missions with next_cycle_at <= now
    |
    v
2. MissionExecutor runs a cycle:
   a. Build mission context (goal, directives, constraints, rubric, history)
   b. Render system prompt with mission-specific preamble/postamble
   c. Execute autonomous agent via agent_executor → tool_loop
   d. Parse structured mission output (perceive, plan, act, evaluate, reflect)
    |
    v
3. Update cycle record:
   - Phase summaries for each OODA phase
   - Evaluation scores against rubric criteria
   - Ratchet check (quality must not regress in strict mode)
   - Actions log
    |
    v
4. Schedule next cycle based on cadence interval
   (or terminate if budget exhausted / termination conditions met)
```

**OODA phases per cycle:** Perceive → Plan → Act → Evaluate → Reflect

**Budget controls:** max_cost, max_tokens, max_cycles — checked before each new cycle.

**Ratchet evaluation:** Each rubric criterion has a target score and ratchet mode (strict = scores must not decrease, relaxed = allowed to vary). The mission terminates when all criteria meet their targets.

### Tool Loop

The tool loop (`runtime/tool_loop.py`) is the core LLM interaction cycle used by all execution paths:

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

### 10 Backend Domains

| Domain | Purpose |
|--------|---------|
| **agents** | Structured agent definitions, version snapshots, runtime config |
| **automations** | DAG workflow definitions with node wiring and graph validation |
| **deployments** | Live automation instances with triggers and scheduling |
| **missions** | Autonomous goal pursuit with OODA cycles, rubric evaluation, and budget controls |
| **sinks** | Reusable output destination definitions (log, knowledge, article, REST API, notification) |
| **knowledge** | Knowledge item management (via existing services) |
| **retrieval** | Search, evidence building, retrieval tracing |
| **runs** | Execution tracking (runs, run steps, checkpoints, events) |
| **outputs** | Versioned output artifacts with lineage and publication sinks |
| **common** | Shared enums, utilities, and base types |

### Core Entities

```
Workspace
 +-- Knowledge (notes, bookmarks, gists, documents, PDFs, images, audio, etc.)
 +-- Conversations
 |    +-- Messages (with attachments, tool calls, thinking, timeline)
 +-- Workspace Agent (dedicated agent definition, auto-seeded)
 +-- Settings overrides

Agent Definition (workspace-agnostic)
 +-- Identity (name, slug, description, icon, tags)
 +-- LLM Config (provider, model, temperature, max_tokens, allow_override)
 +-- Tools Config (per-tool access: allowed, hitl, disabled)
 +-- Memory Config (history_limit, attachment_support, auto_bookmark_urls)
 +-- Parameters (typed input: text, enum, number, boolean)
 +-- Output Definitions (structured output: text, json, number, boolean)
 +-- System Prompt (template-driven with preamble/postamble)
 +-- Version Snapshots (immutable per-save)

Automation (DAG workflow)
 +-- Agent Nodes (with input/output port wiring)
 +-- Sink Nodes (output destinations)
 +-- Static values and deployment input schema

Deployment (live automation instance)
 +-- Automation reference
 +-- Input values (for unfilled parameters)
 +-- Trigger (manual, cron, interval)
 +-- Lifecycle (active, paused, torn down)

Mission (autonomous goal pursuit)
 +-- Goal, Directives, Constraints
 +-- Rubric (evaluation criteria with ratchet modes)
 +-- Autonomous Agent reference
 +-- Owned Workspace (dedicated knowledge container)
 +-- Budget (max_cost, max_tokens, max_cycles)
 +-- Cadence (execution interval)
 +-- Mission Cycles (OODA execution records)
    +-- Phase Summaries (perceive, plan, act, evaluate, reflect)
    +-- Evaluation Scores
    +-- Actions Log

Sink (reusable output destination)
 +-- Sink Type (log, knowledge_create, knowledge_update, article, rest_api, notification)
 +-- Config (type-specific settings and input defaults)

Run (execution instance)
 +-- Run Steps (individual step executions)
 +-- Checkpoints (state snapshots for durability)
 +-- Runtime Events (execution log)
 +-- Emitted Outputs

Output (durable result)
 +-- Versions (content history)
 +-- Lineage Links (provenance to runs, automations, knowledge)
 +-- Publication Sinks (export/sync destinations)
```

### Entity Relationships

```
Agent Definition --snapshot on save--> AgentDefinitionVersion
Agent Definition --build at runtime--> AgentRuntimeConfig
Automation --wires--> Agent Nodes + Sink Nodes
Deployment --instantiates--> Automation (with input values + trigger)
Deployment --creates--> Runs
Mission --assigns--> Agent Definition (autonomous agent)
Mission --owns--> Workspace (dedicated knowledge container)
Mission --creates--> Mission Cycles
Mission Cycle --creates--> Run (primary_run_id)
Run --executes via--> ChatHandler, AgentExecutor, or GraphExecutor
Run --owns--> Run Steps
Run --emits--> Outputs
Output --has--> Versions
Sink --wired into--> Automation (as output destination nodes)
Knowledge --embedded in--> Qdrant vectors
```

## Key Design Decisions

### Structured Agent Definitions
Agents are defined with explicit, typed fields (LLM config, tools config, memory config, input parameters, output definitions) rather than free-form markdown parsed into a model. The UI generates appropriate input elements for each field. System prompts use a template engine with variables, loops, conditionals, and built-in functions. Every save creates an immutable version snapshot for audit and rollback.

### Direct Execution Model
The runtime uses a direct execution model centered on `tool_loop` — a recursive LLM + tool dispatch cycle shared by all execution paths. `ChatHandler` handles interactive streaming chat, `agent_executor` handles background agent runs, `mission_executor` handles OODA mission cycles, and `graph_executor` handles multi-node automation DAGs. All paths converge on the same tool loop engine, ensuring consistent behavior across contexts.

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
