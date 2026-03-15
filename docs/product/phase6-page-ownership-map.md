# Phase 6 Page Ownership Map

## Workspace-Scoped Product Pages

| Route | Purpose | Owner | Primary user | Status |
|-------|---------|-------|--------------|--------|
| `/w/:workspaceId` | Workspace overview and launch context | `frontend/src/pages/WorkspaceOverviewPage.tsx` | builder/operator | core |
| `/w/:workspaceId/knowledge` | Knowledge inventory and editing entry point | `frontend/src/pages/WorkspaceHome.tsx` | builder/end user | core |
| `/w/:workspaceId/knowledge/:knowledgeId` | Knowledge detail/editor dispatch | `frontend/src/components/knowledge/editors/EditorDispatcher.tsx` | builder/end user | core |
| `/w/:workspaceId/chat` | Conversation workspace | `frontend/src/pages/WorkspaceAgentPage.tsx` | end user | core |
| `/w/:workspaceId/chat/:conversationId` | Conversation detail | `frontend/src/pages/WorkspaceAgentPage.tsx` | end user | core |
| `/w/:workspaceId/search` | Retrieval/debug search surface | `frontend/src/pages/SearchPage.tsx` | builder/operator | support |
| `/w/:workspaceId/profiles` | Profile library and creation entry point | `frontend/src/pages/ProfilesPage.tsx` | builder/operator | core |
| `/w/:workspaceId/profiles/:profileId` | Profile builder, validation, and resolved inspection | `frontend/src/pages/ProfileDetailPage.tsx` | builder/operator | core |
| `/w/:workspaceId/workflows` | Workflow placeholder/list surface | `frontend/src/pages/WorkflowsPage.tsx` | builder/operator | support |
| `/w/:workspaceId/missions` | Mission placeholder/list surface | `frontend/src/pages/MissionsPage.tsx` | builder/operator | support |
| `/w/:workspaceId/runs` | Run inventory surface | `frontend/src/pages/RunsPage.tsx` | builder/operator | support |
| `/w/:workspaceId/artifacts` | Artifact inventory surface | `frontend/src/pages/ArtifactsPage.tsx` | builder/operator | support |

## Global Settings Pages

Settings are global because they configure system-wide infrastructure rather than workspace content.

| Route | Purpose | Owner |
|-------|---------|-------|
| `/settings` | Settings landing and redirects | `frontend/src/pages/settings/index.tsx` |
| `/settings/*` | Global settings shell and section navigation | `frontend/src/pages/settings/SettingsLayout.tsx` |
| `/settings/workspaces` | Workspace administration | `frontend/src/pages/settings/workspaces/WorkspacesPage.tsx` |
| `/settings/models/*` | Model configuration | `frontend/src/pages/settings/models/` |
| `/settings/prompts` | Prompt management | `frontend/src/pages/settings/prompts/PromptsPage.tsx` |
| `/settings/policies` | Policy management | `frontend/src/pages/settings/policies/PoliciesPage.tsx` |
| `/settings/approvals` | Approval inbox | `frontend/src/pages/settings/approvals/ApprovalsPage.tsx` |
| `/settings/pipelines` | Pipeline configuration | `frontend/src/pages/settings/pipelines/PipelinesPage.tsx` |
| `/settings/skills` | Skill management | `frontend/src/pages/settings/skills/SkillsPage.tsx` |
| `/settings/mcp` | MCP server management | `frontend/src/pages/settings/mcp/MCPPage.tsx` |
| `/settings/audit` | Audit/operator logs | `frontend/src/pages/settings/audit/AuditPage.tsx` |
| `/settings/import` | Import flows | `frontend/src/pages/settings/import/ImportPage.tsx` |
| `/settings/export` | Export flows | `frontend/src/pages/settings/export/ExportPage.tsx` |

## Ownership Rules

- Page components own route composition and top-level loading/error/empty states.
- Feature folders own data hooks and domain-specific UI logic.
- Shared layout and shared components own cross-page shell primitives, not page-specific behavior.
- Settings pages should not absorb workspace content concerns.
