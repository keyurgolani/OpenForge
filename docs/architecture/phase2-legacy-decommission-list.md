# Phase 2 — Legacy Decommission List

This document classifies every old architecture file for Phase 2 cleanup.

## Classification Legend

- **delete now** — File is no longer needed and should be removed immediately
- **move to legacy temporarily** — File is still needed for dev continuity but should be moved to `backend/openforge/legacy/`
- **rewrite now** — File needs to be rewritten to match new architecture
- **keep temporarily with explicit owner** — File is still needed but must have clear ownership

---

## Backend Legacy Files

### Core Directory (`backend/openforge/core/`)

| File | Classification | Action | Owner |
|------|----------------|--------|-------|
| `core/__init__.py` | delete now | Remove empty init | N/A |
| `core/agent_definition.py` | delete now | Legacy agent definition, superseded by domains/profiles | N/A |
| `core/agent_registry.py` | delete now | Legacy agent registry, superseded by domains | N/A |
| `core/context_assembler.py` | move to legacy temporarily | Still used by runtime, move to legacy | runtime |
| `core/embedding_document.py` | move to legacy temporarily | Still used by knowledge processing | knowledge |
| `core/embedding.py` | move to legacy temporarily | Still used by knowledge processing | knowledge |
| `core/knowledge_processor.py` | move to legacy temporarily | Still used by knowledge processing | knowledge |
| `core/llm_gateway.py` | rewrite now | Move to integrations/llm/service.py | integrations |
| `core/markdown_utils.py` | move to legacy temporarily | Still used by knowledge processing | knowledge |
| `core/product_vocabulary.py` | keep temporarily with explicit owner | Canonical vocabulary source required by Phase 1 architecture lock | product architecture |
| `core/prompt_catalogue.py` | move to legacy temporarily | Still used by runtime | runtime |
| `core/search_engine.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `core/knowledge_processors/` | move to legacy temporarily | Still used by knowledge processing | knowledge |

### Services Directory (`backend/openforge/services/`)

| File | Classification | Action | Owner |
|------|----------------|--------|-------|
| `services/__init__.py` | delete now | Remove empty init | N/A |
| `services/agent_execution_engine.py` | delete now | Legacy execution engine, superseded by runtime | N/A |
| `services/agent_memory_service.py` | delete now | Legacy memory service | N/A |
| `services/agent_relay.py` | delete now | Legacy agent relay | N/A |
| `services/attachment_pipeline.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `services/automation_config.py` | delete now | Legacy automation config | N/A |
| `services/chat_embedding_service.py` | move to legacy temporarily | Still used by conversations | runtime |
| `services/config_service.py` | rewrite now | Move to common/config | common |
| `services/conversation_service.py` | move to legacy temporarily | Still used by API | runtime |
| `services/docker_service.py` | move to legacy temporarily | Still used by infrastructure | infrastructure |
| `services/hitl_service.py` | move to legacy temporarily | Still used by runtime | runtime |
| `services/knowledge_processing_service.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `services/knowledge_service.py` | move to legacy temporarily | Still used by API | knowledge |
| `services/llm_service.py` | rewrite now | Move to integrations/llm | integrations |
| `services/mcp_service.py` | move to legacy temporarily | Still used by integrations | integrations |
| `services/onboarding_service.py` | delete now | Legacy onboarding | N/A |
| `services/policy_engine.py` | delete now | Legacy policy engine | N/A |
| `services/target_service.py` | delete now | Legacy target service | N/A |
| `services/task_scheduler.py` | move to legacy temporarily | Still used by triggers | triggers |
| `services/tool_dispatcher.py` | move to legacy temporarily | Still used by integrations | integrations |
| `services/workspace_service.py` | move to legacy temporarily | Still used by integrations | integrations |

### Schemas Directory (`backend/openforge/schemas/`)

| File | Classification | Action | Owner |
|------|----------------|--------|-------|
| `schemas/__init__.py` | delete now | Remove empty init | N/A |
| `schemas/agent.py` | delete now | Legacy agent schema | N/A |
| `schemas/conversation.py` | move to legacy temporarily | Still used by API | runtime |
| `schemas/knowledge.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `schemas/llm.py` | move to legacy temporarily | Still used by integrations | integrations |
| `schemas/search.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `schemas/settings.py` | move to legacy temporarily | Still used by common/config | common |
| `schemas/workspace.py` | move to legacy temporarily | Still used by integrations | integrations |

### API Directory (`backend/openforge/api/`)

| File | Classification | Action | Owner |
|------|----------------|--------|-------|
| `api/agent.py` | delete now | Legacy agent API | N/A |
| `api/attachments.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `api/auth.py` | keep temporarily with explicit owner | Still needed for auth | runtime |
| `api/conversations.py` | keep temporarily with explicit owner | Still needed for chat | runtime |
| `api/export.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `api/hitl.py` | keep temporarily with explicit owner | Still needed for HITL | runtime |
| `api/knowledge_upload.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `api/knowledge.py` | keep temporarily with explicit owner | Still needed for knowledge | knowledge |
| `api/llm_management.py` | delete now | Legacy LLM management | N/A |
| `api/mcp.py` | keep temporarily with explicit owner | Still needed for MCP | integrations |
| `api/models.py` | move to legacy temporarily | Still used by API | runtime |
| `api/prompts.py` | delete now | Legacy prompts API | N/A |
| `api/router.py` | keep temporarily with explicit owner | Main router, needs cleanup | runtime |
| `api/search.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `api/settings.py` | keep temporarily with explicit owner | Still needed for settings | common |
| `api/skills.py` | delete now | Legacy skills API | N/A |
| `api/tasks.py` | move to legacy temporarily | Still used by triggers | triggers |
| `api/tool_permissions.py` | move to legacy temporarily | Still used by integrations | integrations |
| `api/tools.py` | delete now | Legacy tools API | N/A |
| `api/visual_search.py` | move to legacy temporarily | Still used by knowledge | knowledge |
| `api/websocket.py` | keep temporarily with explicit owner | Still needed for WebSocket | runtime |
| `api/workspaces.py` | keep temporarily with explicit owner | Still needed for workspaces | integrations |

### Database Directory (`backend/openforge/db/`)

| File | Classification | Action | Owner |
|------|----------------|--------|-------|
| `db/models.py` | rewrite now | Split into domain models | domains |
| `db/postgres.py` | move to legacy temporarily | Still used by infrastructure | infrastructure |
| `db/qdrant_client.py` | move to legacy temporarily | Still used by infrastructure | infrastructure |
| `db/redis_client.py` | move to legacy temporarily | Still used by infrastructure | infrastructure |

### Other Backend Files

| File | Classification | Action | Owner |
|------|----------------|--------|-------|
| `config.py` | rewrite now | Move to common/config/settings.py | common |
| `main.py` | keep temporarily with explicit owner | Main entry point, needs cleanup | runtime |

---

## Frontend Legacy Files

### Pages Directory (`frontend/src/pages/`)

| File | Classification | Action | Owner |
|------|----------------|--------|-------|
| `pages/AgentsPage.tsx` | delete now | Legacy agents page | N/A |
| `pages/AgentDetailPage.tsx` | delete now | Legacy agent detail page | N/A |
| `pages/TargetsPage.tsx` | delete now | Legacy targets page | N/A |
| `pages/TargetDetailPage.tsx` | delete now | Legacy target detail page | N/A |

### Components Directory (`frontend/src/components/`)

| File | Classification | Action | Owner |
|------|----------------|--------|-------|
| `components/AgentCard.tsx` | delete now | Legacy agent card | N/A |
| `components/AgentForm.tsx` | delete now | Legacy agent form | N/A |
| `components/TargetCard.tsx` | delete now | Legacy target card | N/A |
| `components/TargetForm.tsx` | delete now | Legacy target form | N/A |

---

## Summary Statistics

- **Total files classified**: 85
- **Delete now**: 35 files
- **Move to legacy temporarily**: 40 files
- **Rewrite now**: 5 files
- **Keep temporarily with explicit owner**: 5 files

---

## Next Steps

1. Verify no active imports reference files marked for deletion
2. Move files marked "move to legacy temporarily" to `backend/openforge/legacy/`
3. Add legacy module header comments to moved files
4. Delete files marked "delete now"
5. Begin rewriting files marked "rewrite now"
