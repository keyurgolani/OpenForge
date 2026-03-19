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
npm run dev   # -> http://localhost:5173 (proxies /api to port 3000)

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
│       │   ├── context_assembler.py # Token budget management
│       │   └── prompt_resolution.py # Prompt template resolution
│       ├── db/                     # Database layer
│       │   ├── models.py           # SQLAlchemy models (all entities)
│       │   ├── postgres.py         # Database engine and migrations
│       │   ├── qdrant_client.py    # Vector database client
│       │   ├── redis_client.py     # Redis client
│       │   └── migrations/         # Alembic migration scripts
│       ├── domains/                # Domain-driven business logic
│       │   ├── agents/             # Agent blueprints, compiler, specs
│       │   │   ├── blueprint.py    # Blueprint parsing (YAML+MD)
│       │   │   ├── compiler.py     # Blueprint → CompiledAgentSpec
│       │   │   ├── compiled_spec.py # Immutable spec model
│       │   │   ├── models.py       # Agent DB models
│       │   │   ├── service.py      # Agent CRUD
│       │   │   ├── router.py       # API routes
│       │   │   ├── schemas.py      # Pydantic schemas
│       │   │   └── types.py        # Domain types
│       │   ├── automations/        # Automation definitions
│       │   │   ├── blueprint.py    # Trigger, budget, output config
│       │   │   ├── compiler.py     # Automation compilation
│       │   │   ├── compiled_spec.py # Compiled automation spec
│       │   │   ├── models.py       # Automation DB models
│       │   │   ├── service.py      # Automation CRUD
│       │   │   ├── router.py       # API routes
│       │   │   ├── schemas.py      # Pydantic schemas
│       │   │   └── types.py        # Domain types
│       │   ├── knowledge/          # Knowledge management
│       │   ├── retrieval/          # Search and evidence
│       │   ├── runs/               # Run execution tracking
│       │   ├── outputs/            # Versioned output artifacts
│       │   │   ├── versioning.py   # Version management
│       │   │   ├── lineage.py      # Provenance tracking
│       │   │   ├── publishing.py   # Publishing logic
│       │   │   ├── sinks.py        # Output destination routing
│       │   │   └── service.py      # Output CRUD
│       │   └── common/             # Shared domain utilities
│       ├── integrations/           # External integrations
│       │   └── tools/              # Tool server HTTP client
│       ├── middleware/             # HTTP middleware (auth)
│       ├── runtime/               # Execution engines
│       │   ├── chat_handler.py     # Interactive chat execution
│       │   ├── strategy_executor.py # Strategy-based run execution
│       │   ├── tool_loop.py        # LLM + tool dispatch cycle
│       │   ├── agent_registry.py   # Agent resolution at runtime
│       │   ├── handoff_engine.py   # Agent-to-agent delegation
│       │   ├── provider_config.py  # LLM provider resolution
│       │   ├── hitl.py             # Human-in-the-loop approvals
│       │   ├── policy.py           # Tool permission engine
│       │   ├── lifecycle.py        # Run state transitions
│       │   ├── events.py           # Runtime event types
│       │   ├── event_publisher.py  # Event broadcasting
│       │   ├── checkpoint_store.py # Durable state snapshots
│       │   └── strategies/         # Strategy plugins
│       │       ├── interface.py    # AgentStrategy protocol + BaseStrategy
│       │       ├── base_loop.py    # Strategy execution loop
│       │       ├── registry.py     # Strategy registry
│       │       ├── chat.py         # Chat strategy
│       │       ├── researcher.py   # Research strategy
│       │       ├── reviewer.py     # Review strategy
│       │       ├── builder.py      # Builder strategy
│       │       ├── watcher.py      # Watcher strategy
│       │       └── coordinator_strategy.py # Coordinator strategy
│       ├── services/              # Application services
│       │   ├── llm_service.py      # LLM provider management
│       │   ├── knowledge_processing_service.py  # Knowledge pipeline
│       │   ├── conversation_service.py          # Chat management
│       │   ├── workspace_service.py # Workspace management
│       │   ├── automation_config.py # Automation config service
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
│       │   ├── AgentsPage.tsx      # Agent list
│       │   ├── AgentDetailPage.tsx # Agent detail
│       │   ├── AutomationsPage.tsx # Automation list
│       │   ├── AutomationDetailPage.tsx # Automation detail
│       │   ├── RunsPage.tsx        # Run list
│       │   ├── RunDetailPage.tsx   # Run detail
│       │   ├── OutputsPage.tsx     # Output list
│       │   ├── OutputDetailPage.tsx # Output detail
│       │   ├── DashboardPage.tsx   # Workspace dashboard
│       │   ├── WorkspaceAgentPage.tsx # Chat interface
│       │   ├── SearchPage.tsx      # Search
│       │   └── settings/           # Settings sub-pages
│       ├── features/               # Domain-specific feature modules
│       │   ├── agents/             # Agent components and hooks
│       │   ├── automations/        # Automation components and hooks
│       │   ├── runs/               # Run monitoring
│       │   ├── outputs/            # Output management
│       │   ├── artifacts/          # Legacy artifact support
│       │   ├── retrieval/          # Evidence building
│       │   └── knowledge/          # Knowledge queries
│       ├── hooks/                  # Custom React hooks
│       ├── stores/                 # Zustand state management
│       ├── types/                  # TypeScript type definitions
│       │   ├── agents.ts           # Agent types
│       │   ├── automations.ts      # Automation types
│       │   ├── runs.ts             # Run types
│       │   └── ...
│       └── lib/                    # Utilities and API client
│           ├── api.ts              # API endpoint definitions
│           ├── routes.ts           # Route definitions
│           ├── productVocabulary.ts # Product term mapping
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
| Agent execution logic | `backend/openforge/runtime/` |
| Strategy plugins | `backend/openforge/runtime/strategies/` |
| External integrations | `backend/openforge/integrations/` |
| Database models | `backend/openforge/db/models.py` |

**Rules:**
- API routes should be thin — validate input, call a service, return the response
- Domain services should not import from other domains directly
- New retrieval logic goes in `domains/retrieval/`
- Meaningful outputs should be modeled as outputs (not ad-hoc tables)
- Agent execution must flow through agent_registry for spec resolution

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
- Domain routes: Agents, Automations, Runs, Outputs are top-level (workspace-agnostic). Knowledge, Chat, Search are workspace-scoped.

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

## Domain Development Guide

### Adding a New Domain

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

4. Register the router in `backend/openforge/domains/router_registry.py`

### Existing Domains

| Domain | Key Files | Notes |
|--------|-----------|-------|
| **agents** | blueprint.py, compiler.py, compiled_spec.py | YAML+MD parsing, compilation pipeline |
| **automations** | blueprint.py, compiler.py, compiled_spec.py | JSON-based config, trigger/budget/output |
| **knowledge** | (via services layer) | Knowledge types managed by knowledge_processing_service |
| **retrieval** | service.py | Hybrid search, evidence building |
| **runs** | service.py | Run tracking, steps, events |
| **outputs** | versioning.py, lineage.py, sinks.py, publishing.py | Versioned artifacts with provenance |
| **common** | enums.py | Shared types and enums |

## Strategy Authoring Guide

To add a new execution strategy:

1. Create a new file in `backend/openforge/runtime/strategies/`:

   ```python
   from openforge.runtime.strategies.interface import BaseStrategy, RunContext, StepResult

   class MyStrategy(BaseStrategy):
       @property
       def name(self) -> str:
           return "my_strategy"

       async def plan(self, ctx: RunContext) -> dict:
           # Return a plan with steps
           return {"steps": [
               {"action": "analyze"},
               {"action": "synthesize"},
           ]}

       async def execute_step(self, ctx: RunContext, step: dict) -> StepResult:
           action = step.get("action")
           if action == "analyze":
               # Do analysis
               return StepResult(output="analysis done", should_continue=False)
           elif action == "synthesize":
               # Do synthesis
               return StepResult(output="synthesis done", should_continue=False)
           return StepResult(output="unknown action")

       # should_continue and aggregate use BaseStrategy defaults
   ```

2. Register in `backend/openforge/runtime/strategies/registry.py`:

   ```python
   from .my_strategy import MyStrategy
   strategy_registry.register(MyStrategy())
   ```

3. Use in agent blueprints:
   ```yaml
   strategy: my_strategy
   ```

### Strategy Lifecycle

- `plan()` returns a list of steps
- `execute_step()` is called for each step in the plan
- `should_continue()` is checked after each step (return `True` to repeat, `False` to advance)
- `aggregate()` combines all step results into a final output

For loop-driven strategies (like chat), return a single-step plan and use `should_continue` to control the loop.

## Tool Development Guide

### Adding a New Tool

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

## Settings Tab Pattern

To add a new settings tab:

1. Create a tab component in `frontend/src/pages/settings/{tab_name}/`:
   ```
   frontend/src/pages/settings/my_tab/
   └── MyTab.tsx
   ```

2. Register the tab in `frontend/src/pages/settings/constants.ts`:
   - Add to the `SETTINGS_TABS` array
   - Add to the `toSettingsTab` normalization function if needed

3. Add the tab to the settings router in `frontend/src/pages/settings/index.tsx`

4. Add the tab to the layout in `frontend/src/pages/settings/SettingsLayout.tsx`

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

## Testing

### Backend Tests

```bash
cd backend
python -m pytest tests/ -v
```

Key test directories:
- `tests/architecture/` — Schema presence, regression, release smoke tests
- `tests/domains/agents/` — Agent blueprint, compiler, service tests
- `tests/domains/automations/` — Automation service tests
- `tests/runtime/` — Strategy, tool loop, chat handler, agent registry tests

### Frontend Tests

```bash
cd frontend
npm test
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
