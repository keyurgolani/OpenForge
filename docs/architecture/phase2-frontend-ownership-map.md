# Phase 2 — Frontend Ownership Map

This map records the current frontend ownership boundaries after the Phase 2 cleanup pass.

## Page shells

| File | Owner | Notes |
|------|-------|-------|
| `frontend/src/pages/AppShell.tsx` | shell/navigation | Workspace chrome and transitional compatibility plumbing |
| `frontend/src/pages/WorkspaceOverviewPage.tsx` | workspace overview | Thin shell over domain hooks and summary cards |
| `frontend/src/pages/WorkspaceHome.tsx` | knowledge | Primary knowledge board |
| `frontend/src/pages/WorkspaceAgentPage.tsx` | runtime/chat | Transitional chat runtime surface behind canonical `/chat` routes |
| `frontend/src/pages/ProfilesPage.tsx` | profiles | Thin shell using `features/profiles/hooks.ts` |
| `frontend/src/pages/WorkflowsPage.tsx` | workflows | Thin shell using `features/workflows/hooks.ts` |
| `frontend/src/pages/MissionsPage.tsx` | missions | Thin shell using `features/missions/hooks.ts` |
| `frontend/src/pages/RunsPage.tsx` | runs | Thin shell using `features/runs/hooks.ts` |
| `frontend/src/pages/ArtifactsPage.tsx` | artifacts | Thin shell using `features/artifacts/hooks.ts` |
| `frontend/src/pages/SearchPage.tsx` | knowledge | Transitional search route retained outside the primary IA |
| `frontend/src/pages/ExecutionListPage.tsx` | runtime | Transitional execution monitor |
| `frontend/src/pages/ExecutionMonitorPage.tsx` | runtime | Transitional execution detail |
| `frontend/src/pages/SettingsPage.tsx` | settings | Global configuration surface |

## Feature hooks

| Folder | Owner | Notes |
|--------|-------|-------|
| `frontend/src/features/knowledge/` | knowledge | Workspace knowledge summary hooks |
| `frontend/src/features/profiles/` | profiles | Profile list hooks for canonical API routes |
| `frontend/src/features/workflows/` | workflows | Workflow list hooks for canonical API routes |
| `frontend/src/features/missions/` | missions | Mission list hooks for canonical API routes |
| `frontend/src/features/runs/` | runs | Run list hooks with workspace-aware filtering |
| `frontend/src/features/artifacts/` | artifacts | Artifact list hooks with workspace-aware filtering |

## Shared primitives

| File | Owner | Notes |
|------|-------|-------|
| `frontend/src/components/shared/PageHeader.tsx` | shared UI | Consistent page title/subtitle wrapper |
| `frontend/src/components/shared/EmptyState.tsx` | shared UI | Reusable empty-state primitive |
| `frontend/src/components/shared/LoadingState.tsx` | shared UI | Reusable loading primitive |
| `frontend/src/components/shared/ErrorState.tsx` | shared UI | Reusable error primitive |
| `frontend/src/components/shared/StatusBadge.tsx` | shared UI | Shared status presentation across new domain pages |

## Route ownership

- Canonical workspace routes live under `/w/:workspaceId/*`.
- `/chat` is the primary chat route family.
- `/agent*` and `/executions*` remain compatibility routes only.
- New domain pages should use the helpers in `frontend/src/lib/routes.ts` instead of hand-built strings.

## Follow-on cleanup targets

1. Move the remaining logic-heavy chat/runtime pages toward feature-owned modules.
2. Replace legacy execution-detail UX with run-detail UX on the canonical runs domain.
3. Continue migrating shared status/loading/error presentation out of one-off page implementations.
