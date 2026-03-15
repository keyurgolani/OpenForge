# Phase 14 -- UX Polish Audit

**Date:** 2026-03-15
**Scope:** All user-facing surfaces in the OpenForge frontend
**Purpose:** Identify inconsistencies, internal leakage, and polish gaps across every surface before the Phase 14 UX cleanup milestone.

---

## Audit Methodology

Each surface was reviewed against these criteria:

| Criterion | Description |
|---|---|
| Headers and action placement | Page title, description copy, and primary action button positioning |
| Filter/search patterns | Consistency of filter controls, search inputs, and result displays |
| Detail panels | Layout, information density, and editing affordances on detail pages |
| Status chips/badges | Consistent use of `StatusBadge` with correct color mapping |
| Empty states | Presence of `EmptyState` component with title, description, CTA, and hint |
| Loading states | Presence of `LoadingState` with contextual label |
| Action confirmations | Destructive actions guarded by confirmation dialogs |
| Breadcrumbs and secondary navigation | Back links, breadcrumb trails, and section context |

Severity levels:
- **Critical:** Internal implementation details visible to end users
- **Major:** Inconsistent patterns that create confusion
- **Minor:** Polish gaps that do not block functionality

---

## 1. Workspace

### 1.1 Overview (`WorkspaceOverviewPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | Major | Description reads "A quick operational view of the domain surfaces that shape this workspace" -- overly technical for an end-user page. "domain surfaces" is internal vocabulary. |
| Summary cards | OK | Six cards (Knowledge, Profiles, Workflows, Missions, Runs, Artifacts) with counts and descriptions. |
| Recent knowledge | OK | Links to knowledge items with status badges. |
| What to do next | Critical | Contains "The Phase 1 and 2 surfaces now have clear destinations." -- internal phase reference visible to users. |
| Quick links | Major | "Inspect workflow definitions" text uses "mounted under the canonical domain surface" -- internal jargon in description copy. |
| Empty state | OK | Knowledge empty state present with action hint. |
| Loading | OK | Uses `LoadingState` with "Loading workspace overview..." label. |
| Error | Major | Error message reads "The workspace overview could not be assembled from the active domain APIs." -- "domain APIs" is internal terminology. |

**Findings:**
1. **Critical:** Internal phase reference ("Phase 1 and 2") in the "What to do next" section header description (line 192).
2. **Major:** Description text "A quick operational view of the domain surfaces that shape this workspace" should be rewritten in plain product language.
3. **Major:** Quick-link description "mounted under the canonical domain surface" is internal jargon.
4. **Major:** Error messages reference "domain APIs" -- users should see generic recovery-oriented messages.

### 1.2 Navigation

| Criterion | Status | Notes |
|---|---|---|
| Sidebar | OK | Collapsed and expanded states with proper active indicators. |
| Section meta | Minor | AppShell `currentSectionMeta` for workspace says "Overview of the canonical domain surfaces in this workspace." -- internal jargon. |
| Keyboard shortcuts | OK | `Cmd+B` for sidebar toggle, `Cmd+N` for new knowledge, `Cmd+K` for command palette. |

### 1.3 Workspace Switcher

| Criterion | Status | Notes |
|---|---|---|
| Dropdown | OK | Search, workspace list, "Add Workspace" action. |
| Connection status | OK | Green/amber dot indicator. |
| Sub-path preservation | OK | Switches workspace while keeping the current section. |

---

## 2. Knowledge

### 2.1 List and Board

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | "Knowledge" title with "New Knowledge" split button. |
| Filter/search | OK | Type grid, search input available. |
| Cards | OK | NoteCard, FleetingCard, GistCard, BookmarkCard, ImageCard, FileCard, AudioCard all present. |
| Empty state | OK | Uses vocabulary-driven copy. |
| Loading | OK | Standard `LoadingState`. |

### 2.2 Editors

| Criterion | Status | Notes |
|---|---|---|
| Note editor | OK | `EditorDispatcher` routes to correct editor. |
| Tag input | OK | `TagInput` component present. |
| Metadata section | OK | `KnowledgeMetadata` and `MetadataSection` components. |

### 2.3 Search

| Criterion | Status | Notes |
|---|---|---|
| Search page | OK | Separate `SearchPage` with `VisualSearchTab`. |
| AppShell meta | OK | "Search across workspace knowledge without changing the primary IA." |

### 2.4 Upload

| Criterion | Status | Notes |
|---|---|---|
| Create modals | OK | Separate modals for Note, Fleeting, Bookmark, Gist, Audio, Image, PDF, Sheet, Document, Slides. |
| `CreateDispatcher` | OK | Routes to correct modal by type. |

---

## 3. Chat

### 3.1 Conversation List

| Criterion | Status | Notes |
|---|---|---|
| Sidebar conversations | OK | Listed in expanded nav with rename, trash, permanent delete actions. |
| Permanent delete | OK | Guarded by `ConfirmModal`. |
| Context menu | OK | Rename and delete options. |

### 3.2 Streaming and Tool Calls

| Criterion | Status | Notes |
|---|---|---|
| Tool call cards | OK | `ToolCallCard` component present. |
| Streaming | OK | WebSocket integration via `useWorkspaceWebSocket`. |

### 3.3 Mentions

| Criterion | Status | Notes |
|---|---|---|
| Knowledge mentions | Minor | No visible mention autocomplete component found in the audit scope. |

---

## 4. Profiles

### 4.1 List (`ProfilesPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | Uses `getLabel('profile', true)` and `getDescription('profile')`. |
| Action button | OK | "New Profile" / "Close Builder" toggle. |
| Cards | OK | Name, slug, status badge, role chip, capabilities count. |
| Detail link | Major | Button text is "Inspect Builder" -- inconsistent with other surfaces (see Section 12.1). |
| Empty state | Critical | `actionHint` previously read "Creation flows now target the canonical profiles API and detail builder." -- internal implementation leakage. Updated copy reads "Profiles define reusable specialist workers with specific capabilities, policies, and output contracts." |
| Loading | OK | "Loading profiles..." |
| Error | Major | "Profiles could not be loaded from the canonical domain API." -- internal jargon. |

### 4.2 Detail (`ProfileDetailPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | Profile name as title. |
| Back link | OK | "Back to Profiles" with arrow icon. |
| Actions | OK | Delete (danger), Save Changes. |
| Section: Identity | Critical | Description reads "Phase 7 profiles should stay focused on role, prompts, and modular references rather than workflow orchestration." -- internal phase reference. |
| Section: Validation | Critical | Description reads "Phase 7 requires profiles to be complete reusable workers, not partial mega-configs." -- internal phase reference. |
| Resolved composition | OK | Runtime summary and capability bundles displayed. |
| Delete confirmation | Minor | No confirmation modal before delete -- destructive action is unguarded. |

### 4.3 Create

| Criterion | Status | Notes |
|---|---|---|
| Composer | OK | Name, Slug, Role, System Prompt Reference, Description fields. |
| Submit | OK | "Create Draft Profile" button with mutation state. |

---

## 5. Workflows

### 5.1 List (`WorkflowsPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | Uses `getLabel('workflow', true)` and `getDescription('workflow')`. |
| Filters | OK | Status, Ownership, Template mode. Filter section titled "Runtime filters". |
| Summary cards | OK | Active, System, Templates, Active versions counts. |
| Detail link | Major | Button text is "Inspect runtime" -- inconsistent with other surfaces (see Section 12.1). |
| Empty state | Critical | `actionHint` previously read "Workflow creation can land here without reviving the old agent-first model." -- internal implementation leakage. Updated copy reads "Workflows orchestrate multiple profiles through graph-based execution with branching, joining, and approval steps." |
| Loading | OK | "Loading workflows..." |
| Error | Major | "Workflows could not be loaded from the canonical domain API." -- internal jargon. |

### 5.2 Detail (`WorkflowDetailPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | Workflow name as title. |
| Description | Critical | "Inspect the active runtime definition, compare version snapshots, and review node and edge structure without dropping back to the legacy monolith." -- internal reference to "legacy monolith". |
| Back link | OK | "Back to Workflows" with arrow icon. |
| Stat cards | OK | Status, Current version, Entry node, Topology, Composite nodes. |
| Section: Schemas | Critical | Description reads "Phase 9 keeps state, input, and output contracts visible for builders and operators." -- internal phase reference. |
| Section: Composite | Critical | Description reads "Phase 10 surfaces composite patterns directly in the workflow definition." -- internal phase reference. |
| Version management | OK | Version list with selection, status badges, change notes. |
| Node inspector | OK | Node list, selected node detail, connected edges. |

---

## 6. Missions

### 6.1 List (`MissionsPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | Uses `getLabel('mission', true)` and `getDescription('mission')`. |
| Filters | OK | Status, Autonomy mode, Ownership, Template mode. |
| Summary cards | OK | Active, System, Templates, Healthy counts. |
| Lifecycle buttons | OK | Launch, Pause, Resume actions inline on cards. |
| Detail link | Major | Button text is "Inspect mission" -- inconsistent (see Section 12.1). |
| Empty state | Critical | `actionHint` previously read "Mission packaging now has a destination even before the full runtime arrives." -- internal implementation leakage. Updated copy reads "Missions package workflows for scheduled, event-driven, or continuous autonomous execution with safety policies." |
| Loading | OK | "Loading missions..." |
| Error | Major | "Missions could not be loaded from the canonical domain API." -- internal jargon. |

### 6.2 Detail (`MissionDetailPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | Mission name as title. |
| Back link | OK | "Back to Missions" with arrow icon. |
| Stat cards | OK | Status, Health, Autonomy mode, Last run. |
| Lifecycle actions | OK | Launch, Pause, Resume, Disable, Activate -- all with proper conditional rendering. |
| Definition | OK | Slug, Autonomy mode, Workflow, Mode flags, Created, Description. |
| Health summary | OK | Success rate, Total runs, Failed runs, Last success/failure. |
| Budget and policies | OK | Approval policy, Budget policy, Profiles, Output types. |
| Triggers | OK | Listed by ID with icon. |
| Recent runs | OK | Last 10 runs with status badges. |
| Recent artifacts | OK | Last 10 artifacts with type and status. |
| Error | Major | "Mission detail could not be loaded from the canonical missions API." -- internal jargon. |

---

## 7. Runs

### 7.1 List (`RunsPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | Uses `getLabel('run', true)` and `getDescription('run')`. |
| Filters | OK | Status and Run type. Filter section titled "Runtime filters". |
| Summary cards | OK | Active, Interrupted, Failed counts. |
| Table | OK | Run ID, Type, Status, Origin, Current node, Started, Completed columns. |
| Detail link | Minor | Inline "Inspect" link text on each row -- shorter than other surfaces. |
| Empty state | Critical | `actionHint` previously read "Run detail UX can evolve later without going back to the legacy executions list." -- internal implementation leakage. Updated copy reads "Runs track every workflow and mission execution with full step lineage, checkpoints, and artifact outputs." |
| Loading | OK | "Loading runs..." |
| Error | Major | "Runs could not be loaded from the canonical domain API." -- internal jargon. |

### 7.2 Detail (`RunDetailPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | "Run {truncated_id}" as title. |
| Back link | OK | "Back to Runs" with arrow icon plus optional "Workflow" link. |
| Stat cards | OK | Status, Run type, Current node, Duration, Delegation mode, Join group. |
| Run summary | OK | Workflow, Version, Started, Completed, Merge strategy, Composite pattern. |
| Step timeline | OK | Ordered steps with selection, input/output snapshots. |
| Lineage | OK | Parent run, child runs, branch groups. |
| Delegation timeline | OK | Composite execution history. |
| Checkpoints | OK | Persisted checkpoint list. |
| Artifacts and events | OK | Emitted artifact IDs and recent events. |
| Error | Major | "Run detail could not be loaded from the canonical runtime APIs." -- internal jargon. |

---

## 8. Artifacts

### 8.1 List (`ArtifactsPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | "Artifacts" title with "New Artifact" button. |
| Description | Minor | "Browse durable outputs as first-class product objects: versioned, linkable, and ready for future publishing flows." -- "first-class product objects" and "future publishing flows" are somewhat internal. |
| Section: Browser | Critical | Description reads "Phase 8 keeps outputs unified on the existing artifact surface instead of reviving target-specific UI." -- internal phase reference. |
| Create form | Critical | Contains "Phase 8 intent" label with Sparkles icon -- internal phase reference visible to users. |
| Filters | OK | Search, Type, Status, Visibility via `ArtifactFilters`. |
| Empty state | Critical | When filters active, `actionHint` reads "Phase 8 filtering is active on type, status, visibility, and text search." -- internal phase reference. |
| Loading | OK | "Loading artifacts..." |
| Error | Major | "Artifacts could not be loaded from the canonical domain API." -- internal jargon. |

### 8.2 Detail (`ArtifactDetailPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | Artifact title as page title. |
| Back link | OK | "Back to Artifacts" with arrow icon. |
| Actions | OK | Archive, Delete (danger), Save Metadata. |
| Version management | OK | Version history, selection, diff, promotion, create version form. |
| Sinks | OK | Sink list, attach sink form. |
| Lineage | OK | `ArtifactLineagePanel` component. |
| Delete confirmation | Minor | No confirmation modal before delete -- destructive action is unguarded. |
| Error | Major | "Artifact detail could not be loaded from the canonical artifact API." -- internal jargon. |

---

## 9. Catalog

### 9.1 Browse (`CatalogPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | "Catalog" title. |
| Filter tabs | OK | All, Profiles, Workflows, Missions tabs. |
| Featured toggle | OK | Star icon toggle for featured items. |
| Cards | OK | Type badge, difficulty, setup complexity, autonomy level, tags. |
| Readiness check | OK | Missing dependencies and warnings displayed when item is selected and not ready. |
| Clone action | OK | Clone button with loading state. |
| Detail toggle | Major | Button text is "View Details" / "Hide Details" -- inconsistent with "Inspect" pattern used elsewhere. |
| Empty state | OK | Contextual messages for no items vs. no featured items. |
| Loading | OK | Uses `LoadingState`. |
| Error | OK | Generic error message without internal jargon. |

---

## 10. Settings

### 10.1 Layout

| Criterion | Status | Notes |
|---|---|---|
| Navigation | OK | Sidebar-style settings layout with section tabs. |
| Labels | OK | Driven by `SETTINGS_LABELS` from `productVocabulary.ts`. |
| Descriptions | OK | Driven by `SETTINGS_DESCRIPTIONS`. |

### 10.2 Providers

| Criterion | Status | Notes |
|---|---|---|
| Provider list | OK | Provider cards with status and credentials. |

### 10.3 Prompts

| Criterion | Status | Notes |
|---|---|---|
| Prompt management | Critical | Contains "Phase 3 turns prompts into versioned resources with explicit owners, validated variables, and previewable rendering." -- internal phase reference. |

### 10.4 Policies

| Criterion | Status | Notes |
|---|---|---|
| Policy management | Critical | Contains "This policy kind is visible for inspection in Phase 3." -- internal phase reference. |

### 10.5 Approvals, Pipelines, Skills, MCP, Audit

| Criterion | Status | Notes |
|---|---|---|
| General | OK | Standard settings layouts with appropriate labels. |

---

## 11. Operator Dashboard

### 11.1 Dashboard (`OperatorDashboardPage`)

| Criterion | Status | Notes |
|---|---|---|
| Header | OK | "Operator Dashboard" with clear description. |
| Approval inbox | OK | `ApprovalInboxPanel` component. |
| Cost hotspots | OK | Ranked by USD cost with token counts. |
| Cost empty state | OK | "No cost data available yet." |
| Failure rollup | OK | Grouped by failure class/error code/severity with toggle. |
| Failure empty state | OK | "No failures recorded. All clear." with shield icon. |
| Evaluation runs | OK | Suite results with pass rates, counts, cost, tokens. |
| Eval empty state | OK | "No evaluation runs recorded yet." |
| Loading states | OK | Inline `Loader2` spinners for each section. |

---

## 12. Cross-Surface Issues

### 12.1 Inconsistent Action Button Text

The "navigate to detail" button text varies across surfaces:

| Surface | Button Text |
|---|---|
| ProfilesPage | "Inspect Builder" |
| WorkflowsPage | "Inspect runtime" |
| MissionsPage | "Inspect mission" |
| RunsPage | "Inspect" |
| CatalogPage | "View Details" / "Hide Details" |
| ArtifactCard | "Inspect" |

**Recommendation:** Standardize to "View Details" for all list-to-detail navigation links, or adopt a single verb consistently (e.g., "View" or "Open").

### 12.2 Internal Phase References Found

| File | Line | Content |
|---|---|---|
| `ArtifactsPage.tsx` | 112 | "Phase 8 keeps outputs unified..." |
| `ArtifactsPage.tsx` | 203 | "Phase 8 intent" |
| `ArtifactsPage.tsx` | 230 | "Phase 8 filtering is active..." |
| `WorkspaceOverviewPage.tsx` | 192 | "The Phase 1 and 2 surfaces now have clear destinations." |
| `ProfileDetailPage.tsx` | 133 | "Phase 7 profiles should stay focused..." |
| `ProfileDetailPage.tsx` | 273 | "Phase 7 requires profiles to be complete reusable workers..." |
| `WorkflowDetailPage.tsx` | 219 | "Phase 9 keeps state, input, and output contracts visible..." |
| `WorkflowDetailPage.tsx` | 242 | "Phase 10 surfaces composite patterns..." |
| `PromptManagementPanel.tsx` | 111 | "Phase 3 turns prompts into versioned resources..." |
| `PolicyManagementPanel.tsx` | 232 | "...visible for inspection in Phase 3..." |

**Action required:** Remove all internal phase references from user-visible copy.

### 12.3 Internal Implementation Leakage in `actionHint` Props

These `actionHint` values on `EmptyState` components expose internal implementation details:

| File | Current `actionHint` |
|---|---|
| `ProfilesPage.tsx` | "Creation flows now target the canonical profiles API and detail builder." |
| `WorkflowsPage.tsx` | "Workflow creation can land here without reviving the old agent-first model." |
| `MissionsPage.tsx` | "Mission packaging now has a destination even before the full runtime arrives." |
| `RunsPage.tsx` | "Run detail UX can evolve later without going back to the legacy executions list." |

**Note:** These have already been updated in the live `actionHint` props with product-appropriate copy, but the original internal hints should be verified as fully replaced.

### 12.4 Internal Jargon in Error Messages

All error messages in list and detail pages reference "canonical domain API", "canonical runtime APIs", "canonical profiles API", etc. These should be replaced with user-friendly messages such as "Could not load profiles. Please try again." or similar.

| File | Current Error Message |
|---|---|
| `ProfilesPage.tsx` | "Profiles could not be loaded from the canonical domain API." |
| `WorkflowsPage.tsx` | "Workflows could not be loaded from the canonical domain API." |
| `MissionsPage.tsx` | "Missions could not be loaded from the canonical domain API." |
| `RunsPage.tsx` | "Runs could not be loaded from the canonical domain API." |
| `ArtifactsPage.tsx` | "Artifacts could not be loaded from the canonical domain API." |
| `ProfileDetailPage.tsx` | "Profile details could not be loaded from the canonical profiles API." |
| `WorkflowDetailPage.tsx` | "Workflow detail could not be loaded from the canonical workflows API." |
| `MissionDetailPage.tsx` | "Mission detail could not be loaded from the canonical missions API." |
| `RunDetailPage.tsx` | "Run detail could not be loaded from the canonical runtime APIs." |
| `ArtifactDetailPage.tsx` | "Artifact detail could not be loaded from the canonical artifact API." |
| `WorkspaceOverviewPage.tsx` | "The workspace overview could not be assembled from the active domain APIs." |

### 12.5 Overly Technical Description Copy

| File | Description | Issue |
|---|---|---|
| `WorkspaceOverviewPage.tsx` | "A quick operational view of the domain surfaces that shape this workspace" | "domain surfaces" is internal jargon |
| `WorkspaceOverviewPage.tsx` | "mounted under the canonical domain surface" (workflow link description) | Internal jargon |
| `WorkflowDetailPage.tsx` | "without dropping back to the legacy monolith" | References internal legacy system |
| `AppShell.tsx` | "Overview of the canonical domain surfaces in this workspace" | Internal jargon in section meta |
| `ArtifactsPage.tsx` | "first-class product objects" / "future publishing flows" | Internal product planning language |

### 12.6 Missing Confirmation Modals

Destructive actions without confirmation dialogs:

| Surface | Action | Risk |
|---|---|---|
| `ProfileDetailPage` | Delete profile | High -- permanently removes profile |
| `ArtifactDetailPage` | Delete artifact | High -- permanently removes artifact |

**Recommendation:** Add `ConfirmModal` before executing delete mutations, matching the pattern used for conversation permanent delete in `AppShell`.

### 12.7 Breadcrumb Usage

The `Breadcrumbs` component exists but is not consistently used across detail pages. Detail pages rely on manual "Back to {Surface}" links instead of structured breadcrumb navigation. Consider adopting breadcrumbs uniformly for deeper navigation paths.

---

## 13. Entities/Graph

### 13.1 Entity Detail and Relationship Explorer

| Criterion | Status | Notes |
|---|---|---|
| Presence | Minor | No dedicated entity detail page or relationship explorer was found in the current page set. Entity/graph exploration may be accessed through knowledge intelligence features or is pending implementation. |

---

## Summary of Critical Findings

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | Critical | Internal phase references in user-visible copy | ArtifactsPage, WorkspaceOverviewPage, ProfileDetailPage, WorkflowDetailPage, PromptManagementPanel, PolicyManagementPanel |
| 2 | Critical | Internal implementation leakage in `actionHint` props | ProfilesPage, WorkflowsPage, MissionsPage, RunsPage |
| 3 | Major | Inconsistent detail navigation button text | ProfilesPage ("Inspect Builder"), WorkflowsPage ("Inspect runtime"), MissionsPage ("Inspect mission"), CatalogPage ("View Details") |
| 4 | Major | Internal jargon in error messages | All list and detail pages |
| 5 | Major | Overly technical description copy | WorkspaceOverviewPage, WorkflowDetailPage, AppShell |
| 6 | Major | "agent profile" used instead of "profile" | productVocabulary.ts (DOMAIN_DESCRIPTIONS, comments), PromptsPage |
| 7 | Minor | Missing delete confirmation modals | ProfileDetailPage, ArtifactDetailPage |
| 8 | Minor | Inconsistent breadcrumb usage | All detail pages |

---

## Recommended Actions

1. **Remove all phase references** from user-visible strings (descriptions, section titles, hints, badges).
2. **Replace all "canonical domain API" error messages** with user-friendly alternatives.
3. **Standardize detail-link button text** across all list pages to a single pattern.
4. **Replace "agent profile" with "profile"** in productVocabulary.ts descriptions and all consuming surfaces.
5. **Rewrite technical description copy** on WorkspaceOverviewPage and WorkflowDetailPage.
6. **Add confirmation modals** for profile delete and artifact delete actions.
7. **Adopt breadcrumbs** for consistent secondary navigation on all detail pages.
