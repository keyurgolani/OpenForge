# Where Code Goes in OpenForge

*Last updated: 2026-03-14*

This document explains where new code should be placed in the OpenForge codebase. Following this guide ensures consistent architecture and maintainability.

---

## Quick Reference

| What | Where it it goes |
|-----|------|
| Shared utilities | `backend/openforge/common/` |
| Domain logic | `backend/openforge/domains/{domain}/service.py` |
| API route handlers | `backend/openforge/api/{resource}.py` (thin) |
| Runtime execution | `backend/openforge/runtime/` |
| Infrastructure wrappers | `backend/openforge/infrastructure/` |
| External integrations | `backend/openforge/integrations/` |
| Legacy code | `backend/openforge/legacy/` |
| Database models | `backend/openforge/db/models.py` |
| Frontend pages | `frontend/src/pages/` |
| Frontend features | `frontend/src/features/` |
| Frontend shared components | `frontend/src/components/` |

---

## Backend Structure

### `backend/openforge/common/`

Shared utilities used across the entire application.

**What goes here:**
- `config/` - Configuration management (settings, loaders, types)
- `errors/` - Exception types
- `logging/` - Logging utilities (planned)
- `time/` - Time/date utilities (planned)
- `json/` - JSON utilities (planned)
- `ids/` - ID generation (planned)
- `validation/` - Validation helpers (planned)
- `crypto/` - Encryption utilities (planned)

**Do NOT add:**
- Random helper functions
- Utility scripts that don't fit a clear pattern
- Code that only works at one level of a data transformations

- Files that are mostly used from one of two places

### `backend/openforge/domains/`

Business logic for each domain area. Each domain has its own `service.py` file.

**Structure:**
```
domains/
├── profiles/
│   ├── service.py
│   ├── models.py
│   ├── router.py
│   ├── schemas.py
│   └── types.py
├── workflows/
│   └── ... (same structure)
├── missions/
│   └── ... (same structure)
├── triggers/
│   └── ... (same structure)
├── runs/
│   └── ... (same structure)
├── artifacts/
│   └── ... (same structure)
├── knowledge/
│   └── ... (same structure)
└── common/
    ├── enums.py
    ├── errors.py
    └── base_models.py
```

**Domain Service Pattern:**
```python
# Each domain service should:
# 1. Handle business logic (not API routes)
# 2. Own persistence for its models
# 3. Provide domain-specific schemas
# 4. NOT import from other domains
# 5. NOT import infrastructure or runtime, or legacy
```

### Retrieval Rule

Phase 4 adds a special rule for retrieval-related work:

- new retrieval logic goes in `backend/openforge/domains/retrieval/`
- public search/read/evidence flows must use the retrieval service boundary
- do not append workspace documents or large tool outputs directly into prompts
- if retrieved content is used later, prefer passing an evidence packet or conversation summary rather than raw body text

### `backend/openforge/runtime/`

Execution engine and workflow orchestest.

**What goes here:**
- `execution_engine.py` - Main agent execution engine (transitional)
- `coordinator.py` - Workflow coordinator (future)
- `node_executors/` - Node type executors
- `events.py` - Runtime event types
- `state_store.py` - Run state persistence
- `checkpoint_store.py` - Checkpoint storage

### `backend/openforge/infrastructure/`

Low-level infrastructure wrappers

**What goes here:**
- `db/` - Database connections and async ORM setup
- `queue/` - Celery and Redis
- `search/` - Qdrant and search utilities
- `mcp/` - MCP server connections management
- `cache/` - Redis caching utilities (planned)

- `docker/` - Docker operations (planned)

### `backend/openforge/integrations/`

External system integrations

**What goes here:**
- `llm/` - LLM provider management
- `mcp/` - MCP server integration
- `tools/` - Tool server integration
- `workspace/` - Workspace file operations
- `files/` - File handling utilities

- `embedding/` - Embedding model management

### `backend/openforge/legacy/`

Legacy code from old architecture

**What goes here:**
- `agent_definition.py` - Old agent definition dataclass
- `agent_registry.py` - Old agent registry
- `agent_schedules_api.py` - Old agent schedules API routes
- `targets_api.py` - Old targets API routes
- `target_service.py` - Old targets service

**Rules:**
- All legacy modules have `LEGACY MODULE` docstring at top
- Do not import from non-legacy modules
- Scheduled for deletion in future phase
```

### `backend/openforge/api/`

HTTP API route handlers (thin layer)

**What goes here:**
- Route definitions only
- Request validation
- Response serialization
- Authentication middleware
- Business logic should call domain services

**Do NOT:**
- Business logic
- Database queries
- Complex transformations

---

## Frontend Structure

### `frontend/src/pages/`

Page components (thin shells)

**What goes here:**
- Route definitions (React Router)
- Page layout composition
- Feature component composition
- Data fetching (via hooks)

- State management (via stores)

**Do NOT:**
- Complex business logic
- API calls (use hooks)
- Data transformations

### `frontend/src/features/`

Domain-specific feature components

**Structure:**
```
features/
├── profiles/
│   ├── components/
│   ├── hooks.ts
│   ├── types.ts
│   └── utils.ts
├── workflows/
│   └── ... (same structure)
├── missions/
│   └── ... (same structure)
├── runs/
│   └── ... (same structure)
├── artifacts/
│   └── ... (same structure)
├── knowledge/
│   └── ... (same structure)
```

**What goes here:**
- Domain-specific components
- Feature-specific hooks
- Domain types
- Domain utilities
- Feature state management

**Do NOT:**
- Cross-domain logic
- API calls (use hooks in lib/)
- Shared UI components

### `frontend/src/components/`

Shared UI components

**What goes here:**
- `ui/` - Shadcn/ui primitives
- `shared/` - Shared business components
- `agent/` - Agent-related components (evaluate)
- `knowledge/` - Knowledge-related components
- `search/` - Search components

- `mode-toggle.tsx` - Theme toggle
- `theme-provider.tsx` - Theme provider

**Do NOT:**
- Page-specific components
- Feature-specific logic

### `frontend/src/lib/`

Shared utilities and hooks

**What goes here:**
- `api.ts` - API client and endpoint definitions
- `routes.ts` - Route definitions (planned)
- `formatters.ts` - Data formatting utilities (planned)
- `errors.ts` - Error handling utilities (planned)
- `status.ts` - Status helpers (planned)
- `config.ts` - Frontend configuration (planned)

- `productVocabulary.ts` - Product vocabulary types

---

## Import Rules

### Allowed Import Directions
```
common/ → domains/
common/ → infrastructure/
common/ → integrations/
domains/ → api/
infrastructure/ → api/
integrations/ → api/
api/ → frontend/ (via hooks)
frontend/ → pages/
```

### Forbidden Import Directions
```
domains/ ← common/  (use dependency injection)
domains/ ← legacy/
infrastructure/ ← domains/
legacy/ → anywhere (except other legacy files)
pages/ → API clients (use hooks in lib/)
features/ → API clients (use hooks in lib/)
```

---

## Adding New Code Checklist

Before adding new code, answer these questions:

1. **Is this shared code?** → Put in `common/`
2. **Is this domain-specific business logic?** → Put in appropriate `domains/*/service.py`
3. **Is this an API route handler?** → Put in `api/` (thin only)
4. **Is this runtime/execution logic?** → Put in `runtime/`
5. **Is this infrastructure code?** → Put in `infrastructure/`
6. **Is this an external integration?** → Put in `integrations/`
7. **Is this legacy code?** → Do not add. Move to `legacy/` if still needed.
8. **Is this a frontend page?** → Put in `pages/`
9. **Is this a frontend feature component?** → Put in `features/`
10. **Is this a frontend shared component?** → Put in `components/`

---

## Migration Guide

When moving code to new locations

1. **Create the new module** in the correct location
2. **Copy the code** to new module (don't modify yet)
3. **Update imports** in new module if needed
4. **Create re-export** in old module for backward compatibility
5. **Add deprecation warning** to old module
6. **Update tests** to use new module
7. **Remove old module** once migration is complete

---

## Questions to Ask

- Does this file exist at all?
- Should this helper exist at all?
- Does this logic already live elsewhere?
- Who owns this concern now?
