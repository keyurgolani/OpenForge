# Phase 6: Information Architecture Specification

This document defines the final navigation hierarchy, page ownership, URL conventions, and settings subsection structure for OpenForge.

## Navigation Hierarchy

### Primary Navigation (Left Sidebar)

The primary navigation follows the product vocabulary defined in `productVocabulary.ts`. Items are ordered by user workflow priority:

| Item | Route | Description |
|------|-------|-------------|
| Workspace | `/w/:workspaceId` | Workspace overview/dashboard |
| Knowledge | `/w/:workspaceId/knowledge` | Documents, notes, and context |
| Chat | `/w/:workspaceId/chat` | Conversations with AI |
| Profiles | `/w/:workspaceId/profiles` | Reusable worker profiles |
| Workflows | `/w/:workspaceId/workflows` | Workflow definitions |
| Missions | `/w/:workspaceId/missions` | Deployed autonomous units |
| Runs | `/w/:workspaceId/runs` | Execution instances |
| Artifacts | `/w/:workspaceId/artifacts` | Produced outputs |

### Secondary Navigation

Some primary items have sub-navigation that expands in the sidebar:

**Chat**
- Recent conversations list
- Pinned conversations

**Runs**
- Active runs
- Recent runs
- Scheduled runs

### Global Navigation

| Item | Route | Description |
|------|-------|-------------|
| Settings | `/settings` | System configuration |
| Search | Global (Cmd+K) | Cross-workspace search |

## Settings Subsection Structure

Settings is decomposed into URL-addressable subsections for direct linking and clear ownership:

### Route Structure

```
/settings                         → Redirect to /settings/workspaces
/settings/workspaces              → Workspace management
/settings/models                  → Redirect to /settings/models/providers
/settings/models/providers        → LLM provider configuration
/settings/models/reasoning        → Reasoning model assignment
/settings/models/vision           → Vision model assignment
/settings/models/embedding        → Embedding model assignment
/settings/models/audio            → Audio model assignment
/settings/models/clip             → CLIP model assignment
/settings/models/pdf              → PDF model assignment
/settings/prompts                 → Prompt templates
/settings/policies                → Execution policies
/settings/approvals               → HITL approval queue
/settings/pipelines               → Pipeline definitions
/settings/skills                  → Skill management
/settings/mcp                     → MCP server configuration
/settings/audit                   → Audit logs and container logs
/settings/import                  → Data import wizards
/settings/export                  → Data export
```

### Settings Page Ownership

| Page | Owner File | Description |
|------|------------|-------------|
| Workspaces | `pages/settings/workspaces/WorkspacesPage.tsx` | Create/edit/delete workspaces |
| Models > Providers | `pages/settings/models/providers/ProvidersPage.tsx` | LLM provider credentials |
| Models > Reasoning | `pages/settings/models/reasoning/ReasoningPage.tsx` | Chat/reasoning model config |
| Models > Vision | `pages/settings/models/vision/VisionPage.tsx` | Vision model config |
| Models > Embedding | `pages/settings/models/embedding/EmbeddingPage.tsx` | Embedding model config |
| Models > Audio | `pages/settings/models/audio/AudioPage.tsx` | Audio model config |
| Models > CLIP | `pages/settings/models/clip/CLIPPage.tsx` | CLIP model config |
| Models > PDF | `pages/settings/models/pdf/PDFPage.tsx` | PDF model config |
| Prompts | `pages/settings/prompts/PromptsPage.tsx` | Prompt template management |
| Policies | `pages/settings/policies/PoliciesPage.tsx` | Execution policy rules |
| Approvals | `pages/settings/approvals/ApprovalsPage.tsx` | HITL approval queue |
| Pipelines | `pages/settings/pipelines/PipelinesPage.tsx` | Pipeline definitions |
| Skills | `pages/settings/skills/SkillsPage.tsx` | Skill management |
| MCP | `pages/settings/mcp/MCPPage.tsx` | MCP server config |
| Audit | `pages/settings/audit/AuditPage.tsx` | Audit logs |
| Import | `pages/settings/import/ImportPage.tsx` | Data import |
| Export | `pages/settings/export/ExportPage.tsx` | Data export |

## URL Conventions

### Workspace-Scoped Routes

All primary content routes are scoped to a workspace:

```
/w/:workspaceId                    → Workspace overview
/w/:workspaceId/:noun              → List view for noun
/w/:workspaceId/:noun/:id          → Detail/edit view for specific item
/w/:workspaceId/profiles/:profileId → Profile builder/detail surface
```

### Settings Routes

Settings routes are global (not workspace-scoped):

```
/settings                          → Settings hub (redirects)
/settings/:section                 → Section landing
/settings/:section/:subsection     → Subsection page
```

### Query Parameters

Use query parameters for:
- Search/filter state: `?q=term&status=active`
- Modal state: `?modal=create`
- Tab state within subsections: `?tab=providers`

Do NOT use query parameters for:
- Primary page identity (use path segments)
- Settings subsection navigation (use path segments)

## Navigation State

### Active State

- Primary nav: Highlight item matching current route
- Sub-nav: Expand and highlight sub-item
- Settings nav: Highlight current section/subsection

### Expanded State

- Chat sub-nav expands to show recent conversations
- Runs sub-nav expands to show active/recent runs
- Settings nav always shows subsection list

### Persistent State

- Sidebar collapsed/expanded: Stored in localStorage
- Recent conversations: Fetched from API
- Pinned items: Fetched from API

## Redirects

| From | To | Reason |
|------|----|----|
| `/settings` | `/settings/workspaces` | Default settings landing |
| `/settings/models` | `/settings/models/providers` | Default models landing |
| `/settings/llm` | `/settings/models/providers` | Legacy compatibility |
| `/w/:workspaceId` | Workspace overview route | Canonical workspace landing |

## Cross-Linking

### Empty State Links

Empty states should link to relevant setup pages:
- No profiles → Link to create profile OR link to `/settings/models` to configure models first
- No knowledge → Link to create knowledge
- No runs → Link to missions to create deployable unit

### Breadcrumb Patterns

```
Workspaces > Settings > Models > Providers
Chat > [Conversation Name]
Knowledge > [Document Title]
```

## Implementation Notes

1. **Route Definitions**: All routes defined in `lib/routes.ts`
2. **Navigation Labels**: All labels defined in `lib/productVocabulary.ts`
3. **Settings Navigation**: Implemented through `pages/settings/SettingsLayout.tsx`
4. **Breadcrumbs**: Component in `components/layout/Breadcrumbs.tsx`
