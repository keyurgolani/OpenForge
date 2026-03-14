# Phase 2 — Route Inventory

This inventory reflects the active route ownership after the Phase 1 vocabulary reset and the Phase 2 cleanup pass.

## Classification Legend

- **keep** — active route with clear ownership
- **compatibility** — retained temporarily to avoid breaking transitional flows, but not part of the primary IA
- **delete** — route family scheduled for removal once the transitional runtime/chat surfaces are replaced

---

## Backend API Routes

### Canonical domain routes

| Route Pattern | Classification | Owner |
|---------------|----------------|-------|
| `/api/v1/profiles/` | keep | profiles |
| `/api/v1/profiles/{profile_id}` | keep | profiles |
| `/api/v1/workflows/` | keep | workflows |
| `/api/v1/workflows/{workflow_id}` | keep | workflows |
| `/api/v1/missions/` | keep | missions |
| `/api/v1/missions/{mission_id}` | keep | missions |
| `/api/v1/triggers/` | keep | triggers |
| `/api/v1/triggers/{trigger_id}` | keep | triggers |
| `/api/v1/runs/` | keep | runs |
| `/api/v1/runs/{run_id}` | keep | runs |
| `/api/v1/artifacts/` | keep | artifacts |
| `/api/v1/artifacts/{artifact_id}` | keep | artifacts |

### Transitional non-domain routes with explicit owners

| Route Pattern | Classification | Owner |
|---------------|----------------|-------|
| `/api/v1/workspaces/` | keep | integrations/workspace |
| `/api/v1/workspaces/{workspace_id}/knowledge/*` | keep | knowledge |
| `/api/v1/workspaces/{workspace_id}/conversations/*` | keep | runtime/chat |
| `/api/v1/workspaces/{workspace_id}/search` | keep | knowledge |
| `/api/v1/tasks/*` | keep | triggers |
| `/api/v1/hitl/*` | keep | runtime |
| `/api/v1/settings/*` | keep | common/config |
| `/api/v1/onboarding/*` | keep | common/config |
| `/api/v1/mcp/*` | keep | integrations |
| `/api/v1/models/*` | keep | runtime/infrastructure |
| `/api/v1/export/*` | keep | knowledge |
| `/api/v1/attachments/*` | keep | knowledge |
| `/ws/*` | keep | runtime |

### Explicit legacy route families

| Route Pattern | Classification | Owner |
|---------------|----------------|-------|
| `/api/v1/agents/*` | compatibility | runtime/chat |
| `/api/v1/agent-schedules/*` | delete | legacy runtime |
| `/api/v1/targets/*` | delete | legacy runtime |

Notes:
- The canonical domain routers are registered through `openforge.domains.router_registry` from `main.py`.
- `backend/openforge/api/router.py` now mounts only non-domain routes.

---

## Frontend Routes

### Primary workspace IA

| Route Pattern | Classification | Owner |
|---------------|----------------|-------|
| `/w/:workspaceId` | keep | workspace overview |
| `/w/:workspaceId/knowledge` | keep | knowledge |
| `/w/:workspaceId/knowledge/:knowledgeId` | keep | knowledge |
| `/w/:workspaceId/chat` | keep | runtime/chat |
| `/w/:workspaceId/chat/:conversationId` | keep | runtime/chat |
| `/w/:workspaceId/profiles` | keep | profiles |
| `/w/:workspaceId/workflows` | keep | workflows |
| `/w/:workspaceId/missions` | keep | missions |
| `/w/:workspaceId/runs` | keep | runs |
| `/w/:workspaceId/artifacts` | keep | artifacts |
| `/settings` | keep | settings |

### Transitional frontend compatibility routes

| Route Pattern | Classification | Owner |
|---------------|----------------|-------|
| `/w/:workspaceId/agent` | compatibility | runtime/chat |
| `/w/:workspaceId/agent/:conversationId` | compatibility | runtime/chat |
| `/w/:workspaceId/search` | compatibility | knowledge |
| `/executions` | compatibility | runtime |
| `/executions/:executionId` | compatibility | runtime |

Notes:
- `/w/:workspaceId/agent*` now redirects into the canonical `/chat` route family.
- `/executions*` is retained for the legacy execution monitor until run detail UX is built on the final domain model.

---

## Cleanup Direction

1. Keep building new UX on `/chat`, `/profiles`, `/workflows`, `/missions`, `/runs`, and `/artifacts`.
2. Treat `/agent*` and `/executions*` as compatibility-only, not primary IA.
3. Remove `/agent-schedules*` and target-oriented routes when the Mission/Trigger runtime boundary replaces them.
