# Development Guide

Instructions for setting up a development environment and contributing to OpenForge.

## Prerequisites

- **Node.js 20+** (for frontend)
- **Python 3.11+** (for backend)
- **Docker and Docker Compose** (for databases and supporting services)

## Development Setup

OpenForge provides a development Docker Compose configuration with hot reloading.

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/OpenForge-AI/OpenForge.git
cd OpenForge

# Configure environment
cp .env.example .env
# Edit .env and set DB_PASSWORD

# Start in development mode
docker compose -f docker-compose.dev.yml up -d
```

This starts all services with live reloading:
- **Backend** — Auto-reloads on Python file changes (port 3000)
- **Frontend** — Vite dev server with HMR (port 5173, proxied through 3100)
- **Tool Server** — Auto-reloads on file changes (port 8001)
- **Databases** — PostgreSQL, Qdrant, Redis, SearXNG

### Option 2: Manual Setup

Start only the database services via Docker:

```bash
docker compose up postgres qdrant redis -d
```

Then run the backend and frontend separately:

```bash
# Backend (terminal 1)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn openforge.main:app --reload --port 3000

# Frontend (terminal 2)
cd frontend
npm install
npm run dev   # → http://localhost:5173 (proxies /api to port 3000)

# Tool Server (terminal 3)
cd tool_server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## Project Structure

```
OpenForge/
├── backend/                        # Python backend application
│   ├── requirements.txt
│   └── openforge/
│       ├── main.py                 # FastAPI application entry point
│       ├── api/                    # HTTP route handlers (thin layer)
│       ├── common/                 # Shared utilities and configuration
│       │   ├── config/             # Centralized settings
│       │   ├── crypto/             # Encryption utilities
│       │   └── errors/             # Exception types
│       ├── core/                   # Core business logic
│       │   ├── embedding.py        # Text and image embedding
│       │   ├── llm_gateway.py      # Unified LLM interface
│       │   ├── search_engine.py    # Hybrid search (dense + sparse)
│       │   └── context_assembler.py # Token budget management
│       ├── db/                     # Database layer
│       │   ├── models.py           # SQLAlchemy models (all entities)
│       │   ├── postgres.py         # Database engine and migrations
│       │   ├── qdrant_client.py    # Vector database client
│       │   ├── redis_client.py     # Redis client
│       │   └── migrations/         # Alembic migration scripts
│       ├── domains/                # Domain-driven business logic
│       │   ├── profiles/           # Agent profiles
│       │   ├── workflows/          # Workflow definitions
│       │   ├── missions/           # Mission definitions
│       │   ├── triggers/           # Trigger definitions
│       │   ├── runs/               # Run execution tracking
│       │   ├── artifacts/          # Output artifacts
│       │   ├── knowledge/          # Knowledge management
│       │   ├── graph/              # Knowledge graph
│       │   ├── retrieval/          # Search and evidence
│       │   ├── prompts/            # Managed prompts
│       │   ├── policies/           # Trust and permissions
│       │   ├── catalog/            # Curated template library
│       │   └── common/             # Shared domain utilities
│       ├── integrations/           # External integrations
│       │   └── tools/              # Tool server HTTP client
│       ├── middleware/             # HTTP middleware (auth)
│       ├── runtime/               # Execution engines
│       │   ├── execution_engine.py # Agent chat execution
│       │   ├── coordinator.py      # Workflow orchestration
│       │   ├── hitl.py             # Human-in-the-loop approvals
│       │   ├── profile_registry.py # Agent profile management
│       │   └── node_executors/     # Workflow node type executors
│       ├── services/              # Application services
│       │   ├── llm_service.py      # LLM provider management
│       │   ├── knowledge_processing_service.py  # Knowledge pipeline
│       │   ├── conversation_service.py          # Chat management
│       │   ├── config_service.py   # Configuration store
│       │   └── mcp_service.py      # MCP server integration
│       └── worker/                # Celery background tasks
│           ├── celery_app.py       # Celery configuration
│           └── tasks.py            # Task definitions
│
├── frontend/                       # React frontend application
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx                # App entry point with routing
│       ├── index.css               # Global styles and theme
│       ├── components/             # Shared UI components
│       │   ├── shared/             # Reusable business components
│       │   ├── layout/             # Shell and navigation
│       │   ├── knowledge/          # Knowledge editors and cards
│       │   ├── search/             # Search interface
│       │   └── ui/                 # Radix-based primitives
│       ├── pages/                  # Page components
│       │   └── settings/           # Settings sub-pages
│       ├── features/               # Domain-specific feature modules
│       │   ├── artifacts/          # Artifact components and hooks
│       │   ├── runs/               # Run monitoring
│       │   ├── workflows/          # Workflow management
│       │   ├── missions/           # Mission management
│       │   ├── profiles/           # Profile management
│       │   ├── approvals/          # HITL approval UI
│       │   ├── observability/      # Cost, failures, telemetry
│       │   ├── retrieval/          # Evidence building
│       │   ├── catalog/            # Template browsing
│       │   ├── policies/           # Policy management
│       │   ├── prompts/            # Prompt management
│       │   └── knowledge/          # Knowledge queries
│       ├── hooks/                  # Custom React hooks
│       ├── stores/                 # Zustand state management
│       ├── types/                  # TypeScript type definitions
│       └── lib/                    # Utilities and API client
│           ├── api.ts              # API endpoint definitions
│           ├── routes.ts           # Route definitions
│           └── formatters.ts       # Data formatting utilities
│
├── tool_server/                    # Tool execution microservice
│   ├── main.py                     # FastAPI entry point
│   ├── protocol.py                 # BaseTool abstract interface
│   ├── registry.py                 # Tool auto-discovery and aliasing
│   ├── security.py                 # Path/command/URL validation
│   ├── config.py                   # Tool server settings
│   ├── content_boundary.py         # Untrusted content wrapping
│   ├── requirements.txt
│   └── tools/                      # Tool implementations
│       ├── filesystem/             # File operations (7 tools)
│       ├── shell/                  # Command execution (2 tools)
│       ├── git/                    # Version control (6 tools)
│       ├── language/               # Code analysis (4 tools)
│       ├── workspace/              # Knowledge/chat access (6 tools)
│       ├── memory/                 # Agent memory (3 tools)
│       ├── http/                   # Web access (4 tools)
│       ├── agent/                  # Agent delegation (1 tool)
│       ├── task/                   # Task management (3 tools)
│       └── skills/                 # Skill management (5 tools)
│
├── docker/                         # Docker build files
│   ├── Dockerfile                  # Production (multi-stage: frontend build + backend)
│   ├── Dockerfile.worker           # Celery worker
│   ├── Dockerfile.tool-server      # Tool server
│   ├── Dockerfile.dev.backend      # Development backend (live reload)
│   ├── Dockerfile.dev.frontend     # Development frontend (Vite HMR)
│   └── searxng/                    # SearXNG configuration
│
├── docker-compose.yml              # Production compose
├── docker-compose.dev.yml          # Development compose (hot reload)
├── .env.example                    # Environment variable template
└── docs/                           # Documentation
```

## Code Placement Rules

### Backend

| What | Where |
|------|-------|
| Shared utilities | `backend/openforge/common/` |
| Domain business logic | `backend/openforge/domains/{domain}/service.py` |
| API route handlers | `backend/openforge/api/{resource}.py` (thin — delegates to services) |
| Execution and orchestration | `backend/openforge/runtime/` |
| External integrations | `backend/openforge/integrations/` |
| Database models | `backend/openforge/db/models.py` |

**Rules:**
- API routes should be thin — validate input, call a service, return the response
- Domain services should not import from other domains directly
- New retrieval logic goes in `domains/retrieval/`
- Meaningful outputs should be modeled as artifacts (not ad-hoc tables)
- Workflow execution must create durable Run and RunStep records

### Frontend

| What | Where |
|------|-------|
| Page components | `frontend/src/pages/` (thin shells) |
| Domain feature modules | `frontend/src/features/{domain}/` |
| Shared UI components | `frontend/src/components/shared/` |
| Layout components | `frontend/src/components/layout/` |
| API calls | `frontend/src/lib/api.ts` |
| Custom hooks | `frontend/src/hooks/` |
| Type definitions | `frontend/src/types/` |

**Rules:**
- Pages compose feature components, they don't contain business logic
- API calls are centralized in `lib/api.ts`
- Feature modules contain domain-specific components, hooks, and types
- Shared components are domain-agnostic
- Layout components are presentational only (no business logic)

### Tool Server

| What | Where |
|------|-------|
| New tool category | `tool_server/tools/{category}/` with `__init__.py` exporting `TOOLS` list |
| Tool implementation | Extends `BaseTool` from `protocol.py` |
| Security rules | `tool_server/security.py` |
| Tool aliases | `tool_server/registry.py` |

**Rules:**
- All tools must implement the `BaseTool` abstract class
- Tools are auto-discovered — just add a new directory with `__init__.py`
- HTTP calls must use `httpx` (aiohttp is not available)
- All file paths must be validated against workspace boundaries
- External HTTP responses must be wrapped with the content boundary

## Adding a New Tool

1. Create a directory under `tool_server/tools/`:
   ```
   tool_server/tools/my_category/__init__.py
   ```

2. Implement one or more tools:
   ```python
   from protocol import BaseTool, ToolResult, ToolContext

   class MyTool(BaseTool):
       id = "my_category.my_tool"
       category = "my_category"
       display_name = "My Tool"
       description = "What this tool does"
       input_schema = {
           "type": "object",
           "properties": {
               "param1": {"type": "string", "description": "..."}
           },
           "required": ["param1"]
       }
       risk_level = "low"  # low, medium, high, critical

       async def execute(self, params: dict, context: ToolContext) -> ToolResult:
           # Implementation here
           return ToolResult(success=True, output="result")

   TOOLS = [MyTool()]
   ```

3. Restart the tool server:
   ```bash
   docker compose build tool-server && docker compose up -d tool-server
   ```

4. Sync tools in the backend:
   ```bash
   curl -X POST http://localhost:3100/api/v1/tools/sync
   ```

## Adding a New Domain

1. Create the domain directory:
   ```
   backend/openforge/domains/my_domain/
   ├── __init__.py
   ├── service.py    # Business logic
   ├── router.py     # API routes
   ├── schemas.py    # Pydantic schemas
   └── types.py      # Domain types
   ```

2. Add database models to `backend/openforge/db/models.py`

3. Create an Alembic migration:
   ```bash
   cd backend
   alembic revision --autogenerate -m "add my_domain tables"
   ```

4. Register the router in `backend/openforge/api/router_registry.py`

## Database Migrations

Migrations run automatically on startup. To create a new migration manually:

```bash
cd backend
alembic revision --autogenerate -m "description of change"
```

To run migrations manually:

```bash
cd backend
alembic upgrade head
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Open an issue first** for significant changes to discuss the approach
2. **Keep changes focused** — one feature or fix per pull request
3. **Follow existing patterns** — match the code style and architecture of the surrounding code
4. **Test your changes** — ensure the application works end-to-end
5. **Write clear commit messages** — describe what changed and why

### Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes following the code placement rules above
4. Test locally with `docker compose -f docker-compose.dev.yml up`
5. Submit a pull request with a clear description of the changes

---

*For architecture details, see [Architecture](architecture.md). For deployment instructions, see [Deployment](deployment.md).*
