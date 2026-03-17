# Architecture

This document describes the technical architecture of OpenForge, covering the system components, data flow, domain model, and key design decisions.

## System Overview

OpenForge is a distributed application composed of six services that communicate over HTTP, WebSocket, and Redis pub/sub:

```
                    ┌─────────────────────────────────┐
                    │       Browser (React SPA)        │
                    │   http://localhost:3100           │
                    └──────────────┬──────────────────┘
                                   │ HTTP + WebSocket
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│                    OpenForge Backend                          │
│              FastAPI + Python 3.11 (:3000)                    │
│                                                              │
│  ┌─────────┐  ┌─────────────┐  ┌──────────┐  ┌───────────┐ │
│  │   API   │  │  Execution  │  │ Services │  │  WebSocket │ │
│  │ Routes  │  │   Engine    │  │  Layer   │  │  Manager   │ │
│  └────┬────┘  └──────┬──────┘  └────┬─────┘  └─────┬─────┘ │
│       │              │              │               │        │
│       └──────────────┴──────────────┴───────────────┘        │
│                          │                                    │
└──────────────────────────┼────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   ┌────────────┐  ┌────────────┐   ┌────────────┐
   │ PostgreSQL │  │   Qdrant   │   │   Redis    │
   │    :5432   │  │   :6333    │   │   :6379    │
   │            │  │            │   │            │
   │ Relational │  │  Vector    │   │ Pub/Sub    │
   │   Data     │  │ Embeddings │   │ Task Queue │
   └────────────┘  └────────────┘   │ Sessions   │
                                    └──────┬─────┘
                                           │
                           ┌───────────────┼───────────────┐
                           │               │               │
                           ▼               ▼               ▼
                    ┌────────────┐  ┌────────────┐  ┌────────────┐
                    │   Celery   │  │    Tool    │  │  SearXNG   │
                    │   Worker   │  │   Server   │  │   :8080    │
                    │            │  │   :8001    │  │            │
                    │ Background │  │  50+ Tools │  │ Web Search │
                    │   Tasks    │  │            │  │            │
                    └────────────┘  └────────────┘  └────────────┘
```

## Services

### Backend (openforge)

The main application server built with **FastAPI**. Handles:

- REST API endpoints for all CRUD operations
- WebSocket connections for real-time chat streaming
- Database management (PostgreSQL via async SQLAlchemy + Alembic migrations)
- Vector database operations (Qdrant for embeddings)
- LLM provider integration (via LiteLLM for unified interface)
- Agent execution engine for chat interactions
- Workflow runtime coordinator for multi-step processes
- Knowledge processing pipeline (chunking, embedding, indexing)
- Authentication and session management

**Key directories:**
- `api/` — HTTP route handlers (thin layer, delegates to services)
- `core/` — Core business logic (embedding, search, context assembly, LLM gateway)
- `services/` — Application services (knowledge processing, LLM management, conversations)
- `runtime/` — Execution engines (agent execution, workflow coordinator, HITL)
- `domains/` — Domain-driven services (profiles, workflows, missions, triggers, runs, artifacts, knowledge graph, retrieval, prompts, policies, catalog, evaluation)
- `db/` — Database models, migrations, and clients (PostgreSQL, Qdrant, Redis)
- `worker/` — Celery task definitions
- `middleware/` — HTTP middleware (authentication)
- `integrations/` — External integrations (tool dispatcher, MCP)

### Celery Worker

A separate Python process running **Celery** with a solo pool for asyncio compatibility. Handles:

- Agent execution tasks (long-running LLM interactions)
- Knowledge processing (embedding generation, content extraction)
- Workflow step execution
- Background intelligence generation

The worker shares the same codebase as the backend but runs tasks asynchronously. Redis serves as the message broker.

### Tool Server

A lightweight **FastAPI** microservice (Python 3.12) that provides sandboxed tool execution. Features:

- 50+ built-in tools across 11 categories
- Auto-discovery of tool categories on startup
- Security layer (path traversal guards, command blocking, URL validation)
- Untrusted content boundary for external HTTP responses
- Tool aliasing to handle common naming mistakes
- Skill management (install/remove/search via skills CLI)

**Tool categories:** Filesystem, Shell, Git, Language (code analysis), Workspace (knowledge/chat access), Memory, HTTP, Agent (delegation), Task, Skills

**Protocol:** Every tool implements a `BaseTool` abstract class with a standard interface: `id`, `category`, `display_name`, `description`, `input_schema`, `risk_level`, and `execute(params, context)`.

### PostgreSQL

Primary relational database (v16) storing all structured data:
- Configuration and settings
- LLM provider configurations (with encrypted API keys)
- Workspaces, conversations, and messages
- Knowledge metadata and processing state
- Domain entities (profiles, workflows, missions, triggers, runs, artifacts)
- Knowledge graph (entities, relationships, provenance)
- Prompts, policies, and evaluation data
- Audit logs and usage records

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
- Pub/sub for real-time event streaming (agent events → WebSocket)
- HITL (human-in-the-loop) approval coordination between processes
- Ephemeral agent memory storage
- Session caching

### SearXNG

Self-hosted meta-search engine providing web search capabilities to the `http.search_web` tool. Runs internally with no external tracking.

## Data Flow

### Chat Pipeline

```
User Message
    │
    ▼
1. Create Message record in PostgreSQL
2. Create AgentExecution record
3. Enqueue Celery task (or run inline)
    │
    ▼
4. Agent Execution Engine:
   a. Load workspace, conversation, and agent profile
   b. Retrieve relevant knowledge from Qdrant (semantic search)
   c. Assemble context within token budget:
      - System prompt: ~12% of context window
      - Conversation history: ~70% (sliding window, always keeps last 4 messages)
      - Output headroom: ~18%
   d. Call LLM with tools via LiteLLM
   e. Stream response tokens to Redis pub/sub
   f. If tool call needed:
      - Check tool permissions and risk level
      - If approval required → create HITL request, wait for human
      - Execute tool via Tool Server HTTP call
      - Feed result back to LLM, repeat
   g. Persist final response as Message record
    │
    ▼
5. Redis pub/sub → WebSocket Manager → Browser
   (real-time streaming of tokens, thinking, tool calls)
```

### Knowledge Processing Pipeline

```
Upload/Create Knowledge
    │
    ▼
1. Store metadata in PostgreSQL
2. Extract text content:
   - PDFs → PDF processor
   - DOCX → Document processor
   - XLSX → Sheet processor
   - PPTX → Slides processor
   - Images → CLIP embeddings + optional OCR
   - Audio → Whisper transcription
   - Bookmarks → Web content extraction
    │
    ▼
3. Chunk text into ~512-token segments
    │
    ▼
4. Generate embeddings for each chunk:
   - Dense vector (384-dim BGE-small)
   - Sparse BM25 vector (for keyword matching)
   - Summary vector (for document-level matching)
    │
    ▼
5. Index in Qdrant with metadata payload
    │
    ▼
6. (Optional) Generate AI intelligence:
   - Summary, tags, key insights
   - Store back in PostgreSQL
```

### Search Pipeline

```
Search Query
    │
    ▼
1. Embed query with BGE-small (384-dim)
    │
    ▼
2. Four-representation search in Qdrant:
   a. Dense vector search (semantic similarity)
   b. Sparse BM25 search (keyword matching)
   c. Summary vector search (document-level)
   d. Reciprocal Rank Fusion (RRF) to combine results
    │
    ▼
3. (Optional) Cross-encoder reranking (ms-marco-MiniLM-L-6-v2)
    │
    ▼
4. Filter by workspace, type, tags, score threshold
    │
    ▼
5. Context expansion (retrieve surrounding chunks)
    │
    ▼
6. Return ranked results with metadata
```

### Workflow Execution Pipeline

```
Trigger fires (schedule, interval, event, or manual launch)
    │
    ▼
1. Runtime Coordinator creates a Run record
    │
    ▼
2. For each node in the workflow graph:
   a. Create RunStep record
   b. Look up executor in the node executor registry
   c. Execute node (LLM call, tool execution, routing decision, etc.)
   d. Create checkpoint for durability
   e. Emit runtime events
   f. If approval node → pause and wait for HITL
   g. If fan-out → spawn parallel branches
   h. If join → wait for all branches to complete
    │
    ▼
3. On completion:
   a. Update Run status
   b. Emit artifacts
   c. Record metrics (tokens, cost, duration)
```

## Domain Model

### Core Entities

```
Workspace
 ├── Knowledge (notes, bookmarks, gists, documents, PDFs, images, audio, etc.)
 ├── Conversations
 │    └── Messages (with attachments, tool calls, thinking)
 └── Settings overrides

Profile (Agent Profile)
 ├── System Prompt
 ├── Capability Bundles (collections of tools/abilities)
 ├── Model Policy (LLM selection constraints)
 ├── Memory Policy (context assembly rules)
 ├── Safety Policy (behavioral constraints)
 └── Output Contract (expected output format)

Workflow Definition
 ├── Workflow Versions (versioned executable snapshots)
 │    ├── Workflow Nodes (LLM, tool, router, fan-out, join, approval, artifact, etc.)
 │    └── Workflow Edges (directed connections with conditions)
 └── Input/Output Schemas

Mission Definition
 ├── Workflow (the execution graph)
 ├── Default Profiles
 ├── Triggers (schedule, interval, event)
 ├── Budget Policy (resource limits)
 └── Approval Policy

Run (execution instance)
 ├── Run Steps (individual node executions)
 ├── Checkpoints (state snapshots for durability)
 ├── Runtime Events (execution log)
 └── Emitted Artifacts

Artifact (durable output)
 ├── Versions (content history)
 ├── Lineage Links (provenance to runs, missions, knowledge)
 └── Sinks (publication destinations)

Knowledge Graph
 ├── Entities (extracted from knowledge)
 ├── Relationships (between entities)
 ├── Mentions (where entities/relationships appear)
 └── Provenance (source tracking)
```

### Entity Relationships

```
Mission ──references──▶ Workflow
Mission ──references──▶ Profile (default)
Mission ──owns──▶ Trigger
Trigger ──fires──▶ Run
Run ──executes──▶ Workflow Version
Run ──owns──▶ Run Steps
Run ──emits──▶ Artifacts
Run ──creates──▶ Checkpoints
Workflow ──contains──▶ Nodes + Edges
Profile ──uses──▶ Capability Bundle, Model Policy, Memory Policy, Safety Policy
Knowledge ──embedded in──▶ Qdrant vectors
Knowledge ──extracted to──▶ Entities + Relationships (Knowledge Graph)
```

## Key Design Decisions

### Async-First Architecture
The entire backend uses async I/O — asyncpg for PostgreSQL, async httpx for tool server calls, and async WebSocket handling. This maximizes throughput for concurrent users and long-running LLM calls.

### Hybrid Search (Dense + Sparse)
Search uses four-representation retrieval combining dense semantic vectors, sparse BM25 keyword vectors, and document-level summary vectors, merged via Reciprocal Rank Fusion. This provides both semantic understanding and keyword precision.

### Durable Workflow Execution
Every workflow execution creates persistent Run, RunStep, and Checkpoint records. This enables resumability after failures or interruptions, full auditability of what happened, and replay/comparison of past executions.

### Workspace Isolation
All user data is scoped to workspaces. Knowledge, conversations, search results, and model configurations are isolated per workspace. Cross-workspace interaction is only possible through explicit agent delegation.

### Tool Server Separation
Tools run in a separate microservice with security boundaries (path traversal guards, command blocking, content boundary wrapping). This isolates potentially dangerous operations from the main application.

### Event-Driven Streaming
Agent responses stream via Redis pub/sub bridged to WebSocket connections. This decouples the Celery worker (which runs the LLM call) from the web server (which serves the WebSocket), enabling horizontal scaling.

### Pluggable Node Executors
The workflow runtime uses a registry pattern for node executors. Each node type (LLM, tool, router, fan-out, join, etc.) has its own executor class, making it straightforward to add new node types without modifying the core runtime.

### Virtual LLM Providers
Beyond standard providers (OpenAI, Anthropic, etc.), OpenForge supports virtual providers — router (load balancing), council (multi-model ensemble), and optimizer (prompt optimization) — that compose standard providers into higher-level abstractions.

## Security

### API Key Encryption
All LLM provider API keys are encrypted at rest using Fernet symmetric encryption. The encryption key is configurable and should be persisted across restarts.

### Authentication
Optional password-based authentication with JWT sessions. When `ADMIN_PASSWORD` is set, all API routes (except health and auth endpoints) require a valid session cookie. When unset, authentication is disabled (suitable for local/trusted networks).

### Tool Security
The tool server enforces:
- **Path traversal protection** — All file paths are resolved and validated to stay within workspace boundaries
- **Command blocking** — Dangerous shell commands (rm -rf, dd, mkfs, shutdown, etc.) are blocked by pattern matching
- **URL validation** — Only HTTP/HTTPS protocols are allowed
- **Content boundary** — External HTTP responses are wrapped in `<untrusted_content>` tags to prevent prompt injection

### CORS
Configurable CORS origins via the `CORS_ORIGINS` setting. Defaults to allow all origins (`*`) for local development.

## Technology Stack Summary

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
