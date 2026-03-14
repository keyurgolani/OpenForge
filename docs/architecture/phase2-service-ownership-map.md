# Phase 2 — Service Ownership Map

This document inventories every service in the backend and assigns clear ownership.

## Classification Legend

- **keep** — Service is needed and has clear ownership
- **merge** — Service should be merged with another service
- **split** — Service should be split into multiple services
- **delete** — Service is no longer needed

---

## Backend Services

### Services Directory (`backend/openforge/services/`)

| File | Current Responsibility | Target Owner Domain/Package | Action |
|------|------------------------|----------------------------|--------|
| `services/attachment_pipeline.py` | Attachment processing pipeline | knowledge | keep |
| `services/chat_embedding_service.py` | Chat embedding generation | runtime | keep |
| `services/config_service.py` | Configuration management | common/config | merge |
| `services/conversation_service.py` | Conversation management | runtime | keep |
| `services/docker_service.py` | Docker container management | infrastructure | keep |
| `services/hitl_service.py` | Human-in-the-loop service | runtime | keep |
| `services/knowledge_processing_service.py` | Knowledge processing | knowledge | keep |
| `services/knowledge_service.py` | Knowledge management | knowledge | keep |
| `services/llm_service.py` | LLM service management | integrations/llm | merge |
| `services/mcp_service.py` | MCP service management | integrations | keep |
| `services/task_scheduler.py` | Task scheduling | triggers | keep |
| `services/tool_dispatcher.py` | Tool dispatching | integrations/tools | keep |
| `services/workspace_service.py` | Workspace management | integrations/workspace | keep |

### Core Directory (`backend/openforge/core/`)

| File | Current Responsibility | Target Owner Domain/Package | Action |
|------|------------------------|----------------------------|--------|
| `core/context_assembler.py` | Context assembly for LLM | runtime | keep |
| `core/embedding_document.py` | Embedding document handling | knowledge | keep |
| `core/embedding.py` | Embedding generation | knowledge | keep |
| `core/knowledge_processor.py` | Knowledge processing | knowledge | keep |
| `core/llm_gateway.py` | LLM gateway | integrations/llm | rewrite |
| `core/markdown_utils.py` | Markdown utilities | knowledge | keep |
| `core/prompt_catalogue.py` | Prompt catalogue | runtime | keep |
| `core/search_engine.py` | Search engine | knowledge | keep |
| `core/knowledge_processors/` | Knowledge processors | knowledge | keep |

### API Directory (`backend/openforge/api/`)

| File | Current Responsibility | Target Owner Domain/Package | Action |
|------|------------------------|----------------------------|--------|
| `api/attachments.py` | Attachment API | knowledge | keep |
| `api/auth.py` | Authentication API | runtime | keep |
| `api/conversations.py` | Conversation API | runtime | keep |
| `api/export.py` | Export API | knowledge | keep |
| `api/hitl.py` | HITL API | runtime | keep |
| `api/knowledge_upload.py` | Knowledge upload API | knowledge | keep |
| `api/knowledge.py` | Knowledge API | knowledge | keep |
| `api/mcp.py` | MCP API | integrations | keep |
| `api/models.py` | Models API | runtime | keep |
| `api/router.py` | Main router | runtime | keep |
| `api/search.py` | Search API | knowledge | keep |
| `api/settings.py` | Settings API | common/config | keep |
| `api/tasks.py` | Tasks API | triggers | keep |
| `api/tool_permissions.py` | Tool permissions API | integrations/tools | keep |
| `api/visual_search.py` | Visual search API | knowledge | keep |
| `api/websocket.py` | WebSocket API | runtime | keep |
| `api/workspaces.py` | Workspaces API | integrations/workspace | keep |

### Database Directory (`backend/openforge/db/`)

| File | Current Responsibility | Target Owner Domain/Package | Action |
|------|------------------------|----------------------------|--------|
| `db/models.py` | Database models | domains | split |
| `db/postgres.py` | PostgreSQL client | infrastructure/db | keep |
| `db/qdrant_client.py` | Qdrant client | infrastructure/search | keep |
| `db/redis_client.py` | Redis client | infrastructure/queue | keep |

### Infrastructure Directory (`backend/openforge/infrastructure/`)

| File | Current Responsibility | Target Owner Domain/Package | Action |
|------|------------------------|----------------------------|--------|
| `infrastructure/db/__init__.py` | Database infrastructure | infrastructure/db | keep |
| `infrastructure/queue/celery_app.py` | Celery app | infrastructure/queue | keep |
| `infrastructure/queue/redis_client.py` | Redis client | infrastructure/queue | keep |
| `infrastructure/queue/tasks.py` | Queue tasks | infrastructure/queue | keep |
| `infrastructure/search/__init__.py` | Search infrastructure | infrastructure/search | keep |
| `infrastructure/search/types.py` | Search types | infrastructure/search | keep |

### Integrations Directory (`backend/openforge/integrations/`)

| File | Current Responsibility | Target Owner Domain/Package | Action |
|------|------------------------|----------------------------|--------|
| `integrations/files/operations.py` | File operations | integrations/files | keep |
| `integrations/llm/service.py` | LLM service | integrations/llm | keep |
| `integrations/tools/dispatcher.py` | Tool dispatcher | integrations/tools | keep |
| `integrations/workspace/service.py` | Workspace service | integrations/workspace | keep |

### Runtime Directory (`backend/openforge/runtime/`)

| File | Current Responsibility | Target Owner Domain/Package | Action |
|------|------------------------|----------------------------|--------|
| `runtime/checkpoint_store.py` | Checkpoint store | runtime | keep |
| `runtime/coordinator.py` | Runtime coordinator | runtime | keep |
| `runtime/events.py` | Runtime events | runtime | keep |
| `runtime/execution_engine.py` | Execution engine | runtime | keep |
| `runtime/hitl.py` | HITL runtime | runtime | keep |
| `runtime/policy.py` | Runtime policy | runtime | keep |
| `runtime/state_store.py` | State store | runtime | keep |
| `runtime/node_executors/` | Node executors | runtime | keep |

### Domains Directory (`backend/openforge/domains/`)

| File | Current Responsibility | Target Owner Domain/Package | Action |
|------|------------------------|----------------------------|--------|
| `domains/artifacts/service.py` | Artifacts service | artifacts | keep |
| `domains/missions/service.py` | Missions service | missions | keep |
| `domains/profiles/service.py` | Profiles service | profiles | keep |
| `domains/runs/service.py` | Runs service | runs | keep |
| `domains/triggers/service.py` | Triggers service | triggers | keep |
| `domains/workflows/service.py` | Workflows service | workflows | keep |
| `domains/knowledge/types.py` | Knowledge types | knowledge | keep |

### Common Directory (`backend/openforge/common/`)

| File | Current Responsibility | Target Owner Domain/Package | Action |
|------|------------------------|----------------------------|--------|
| `common/config/settings.py` | Settings management | common/config | keep |
| `common/config/loaders.py` | Config loaders | common/config | keep |
| `common/config/types.py` | Config types | common/config | keep |
| `common/crypto/encryption.py` | Encryption utilities | common/crypto | keep |
| `common/errors/exceptions.py` | Exception definitions | common/errors | keep |
| `common/text/processing.py` | Text processing | common/text | keep |
| `common/text/titles.py` | Title generation | common/text | keep |

---

## Summary Statistics

- **Total services inventoried**: 65
- **Keep**: 55 services
- **Merge**: 3 services
- **Split**: 1 service
- **Rewrite**: 1 service
- **Delete**: 5 services (already deleted in P2.1.2)

---

## Ownership Summary by Domain

### runtime (15 services)
- `services/chat_embedding_service.py`
- `services/conversation_service.py`
- `services/hitl_service.py`
- `core/context_assembler.py`
- `core/prompt_catalogue.py`
- `api/auth.py`
- `api/conversations.py`
- `api/hitl.py`
- `api/models.py`
- `api/router.py`
- `api/websocket.py`
- `runtime/checkpoint_store.py`
- `runtime/coordinator.py`
- `runtime/events.py`
- `runtime/execution_engine.py`
- `runtime/hitl.py`
- `runtime/policy.py`
- `runtime/state_store.py`
- `runtime/node_executors/`

### knowledge (12 services)
- `services/attachment_pipeline.py`
- `services/knowledge_processing_service.py`
- `services/knowledge_service.py`
- `core/embedding_document.py`
- `core/embedding.py`
- `core/knowledge_processor.py`
- `core/markdown_utils.py`
- `core/search_engine.py`
- `core/knowledge_processors/`
- `api/attachments.py`
- `api/export.py`
- `api/knowledge_upload.py`
- `api/knowledge.py`
- `api/search.py`
- `api/visual_search.py`
- `domains/knowledge/types.py`

### integrations (8 services)
- `services/llm_service.py`
- `services/mcp_service.py`
- `services/tool_dispatcher.py`
- `services/workspace_service.py`
- `core/llm_gateway.py`
- `api/mcp.py`
- `api/tool_permissions.py`
- `api/workspaces.py`
- `integrations/files/operations.py`
- `integrations/llm/service.py`
- `integrations/tools/dispatcher.py`
- `integrations/workspace/service.py`

### triggers (2 services)
- `services/task_scheduler.py`
- `api/tasks.py`

### infrastructure (6 services)
- `services/docker_service.py`
- `db/postgres.py`
- `db/qdrant_client.py`
- `db/redis_client.py`
- `infrastructure/db/__init__.py`
- `infrastructure/queue/celery_app.py`
- `infrastructure/queue/redis_client.py`
- `infrastructure/queue/tasks.py`
- `infrastructure/search/__init__.py`
- `infrastructure/search/types.py`

### common (4 services)
- `services/config_service.py`
- `api/settings.py`
- `common/config/settings.py`
- `common/config/loaders.py`
- `common/config/types.py`
- `common/crypto/encryption.py`
- `common/errors/exceptions.py`
- `common/text/processing.py`
- `common/text/titles.py`

### domains (6 services)
- `domains/artifacts/service.py`
- `domains/missions/service.py`
- `domains/profiles/service.py`
- `domains/runs/service.py`
- `domains/triggers/service.py`
- `domains/workflows/service.py`

---

## Next Steps

1. Merge `services/config_service.py` into `common/config/settings.py`
2. Merge `services/llm_service.py` into `integrations/llm/service.py`
3. Split `db/models.py` into domain-specific model files
4. Rewrite `core/llm_gateway.py` to use `integrations/llm/service.py`
5. Verify all services have clear ownership
