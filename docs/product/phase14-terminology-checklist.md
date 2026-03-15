# Phase 14 -- Terminology Audit Checklist

**Date:** 2026-03-15
**Scope:** All user-facing text in the OpenForge frontend, `productVocabulary.ts`, and related backend API response messages
**Purpose:** Verify that every product term is used consistently and that forbidden alternatives do not appear in user-visible copy.

---

## Term Registry

### 1. Profile

| Property | Value |
|---|---|
| Canonical singular | Profile |
| Canonical plural | Profiles |
| Forbidden alternatives | "agent profile", "agent definition", "agent" (when referring to the configuration entity) |
| Status | ⚠️ Minor issues |

**Violations found:**

| Location | Text | Issue |
|---|---|---|
| `productVocabulary.ts` line 9 | "PROFILE: Agent Profile - a worker abstraction defining capabilities" | Comment uses "Agent Profile" |
| `productVocabulary.ts` line 178 | "Agent profiles define the capabilities, prompts, and behaviors of AI workers." | `DOMAIN_DESCRIPTIONS.profile` uses "Agent profiles" instead of "Profiles" |
| `productVocabulary.ts` line 366 | "Manage prompt templates for agent profiles." | `SETTINGS_DESCRIPTIONS.prompts` uses "agent profiles" |
| `productVocabulary.ts` line 408 | "Profile (Agent Profile) is a worker abstraction" | Comment uses "Agent Profile" |
| `PromptsPage.tsx` line 4 | "Manage prompt templates for agent profiles." | File header comment uses "agent profiles" |

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Page title (`ProfilesPage`) | "Profiles" (via `getLabel`) | Yes |
| Page title (`ProfileDetailPage`) | Profile name | Yes |
| Nav label (`AppShell`) | "Profiles" | Yes |
| Section meta (`AppShell`) | "Profiles" | Yes |
| Empty state title | "No profiles yet" | Yes |
| Empty state CTA | "Create Profile" | Yes |
| Summary card (`WorkspaceOverviewPage`) | "Profiles" | Yes |
| Summary card description | "Reusable worker definitions that set model policy, prompts, and capabilities." | Yes |
| Catalog filter tab | "Profiles" | Yes |

---

### 2. Workflow

| Property | Value |
|---|---|
| Canonical singular | Workflow |
| Canonical plural | Workflows |
| Forbidden alternatives | "pipeline" (when referring to a workflow), "flow", "graph" (as a standalone noun for the workflow concept) |
| Status | ✅ Consistent |

**Violations found:** None.

**Notes:**
- "graph" is used appropriately in technical descriptions (e.g., "composable execution graphs") to describe the internal structure, not as a synonym for Workflow.
- "Pipelines" exists as a separate Settings section (`SETTINGS_LABELS.pipelines`) for data processing pipelines, which is a distinct concept from Workflows.

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Page title (`WorkflowsPage`) | "Workflows" (via `getLabel`) | Yes |
| Page title (`WorkflowDetailPage`) | Workflow name | Yes |
| Nav label | "Workflows" | Yes |
| Empty state title | "No workflows yet" | Yes |
| Empty state CTA | "Create Workflow" | Yes |
| Summary card (`WorkspaceOverviewPage`) | "Workflows" | Yes |
| Run type filter options | "Workflow", "Subworkflow" | Yes |
| Catalog filter tab | "Workflows" | Yes |

---

### 3. Mission

| Property | Value |
|---|---|
| Canonical singular | Mission |
| Canonical plural | Missions |
| Forbidden alternatives | "hand", "task" (when referring to a mission), "job" |
| Status | ✅ Consistent |

**Violations found:** None.

**Notes:**
- The term "Hand" was explicitly rejected in `productVocabulary.ts` (line 413: "The term 'Hand' is not used in the product vocabulary").
- "Task" is not used anywhere to mean Mission. Celery tasks are internal and not user-facing.

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Page title (`MissionsPage`) | "Missions" (via `getLabel`) | Yes |
| Page title (`MissionDetailPage`) | Mission name | Yes |
| Nav label | "Missions" | Yes |
| Empty state title | "No missions yet" | Yes |
| Empty state CTA | "Create Mission" | Yes |
| Summary card (`WorkspaceOverviewPage`) | "Missions" | Yes |
| Run type filter option | "Mission" | Yes |
| Catalog filter tab | "Missions" | Yes |
| Lifecycle buttons | "Launch", "Pause", "Resume", "Disable", "Activate" | Yes |

---

### 4. Trigger

| Property | Value |
|---|---|
| Canonical singular | Trigger |
| Canonical plural | Triggers |
| Forbidden alternatives | "schedule" (as a synonym for trigger), "cron job" |
| Status | ✅ Consistent |

**Violations found:** None.

**Notes:**
- `TRIGGER_TYPES` in `productVocabulary.ts` includes "cron" as a trigger type (not "cron job").
- The Settings section uses "Schedules" as a sub-tab under Jobs -- this refers to Celery Beat schedules, not Triggers. This is a distinct concept and is acceptable.
- Mission detail page labels trigger IDs under "Triggers" heading.

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Empty state title | "No triggers yet" | Yes |
| Empty state CTA | "Create Trigger" | Yes |
| Mission detail section | "Triggers" | Yes |
| Mission card stat | "Triggers" | Yes |
| Vocabulary descriptions | "Triggers define when and how missions are automatically executed." | Yes |

---

### 5. Run

| Property | Value |
|---|---|
| Canonical singular | Run |
| Canonical plural | Runs |
| Forbidden alternatives | "execution" (as a standalone noun for the run concept), "task" (when referring to a run) |
| Status | ⚠️ Minor issues |

**Violations found:**

| Location | Text | Issue |
|---|---|---|
| `productVocabulary.ts` line 182 | "Runs are execution instances of workflows or missions." | Uses "execution instances" -- borderline; acceptable as a descriptive phrase but "execution" as a standalone noun should be avoided. |

**Notes:**
- "execution" appears in compound phrases like "execution graphs", "execution state", "execution records", "execution history" -- these are acceptable descriptive uses, not substitutions for "Run".
- The `ExecutionStatus` type name is internal (TypeScript type) and not user-facing.

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Page title (`RunsPage`) | "Runs" (via `getLabel`) | Yes |
| Page title (`RunDetailPage`) | "Run {id}" | Yes |
| Nav label | "Runs" | Yes |
| Empty state title | "No runs yet" | Yes |
| Empty state CTA | "Start Run" | Yes |
| Summary card (`WorkspaceOverviewPage`) | "Runs" | Yes |
| Mission detail section | "Recent runs" | Yes |
| Health summary labels | "Total runs", "Failed runs" | Yes |

---

### 6. Artifact

| Property | Value |
|---|---|
| Canonical singular | Artifact |
| Canonical plural | Artifacts |
| Forbidden alternatives | "output" (as a standalone noun for the artifact concept), "result", "target" (as a synonym for artifact), "note" (when referring to the artifact concept rather than the artifact type) |
| Status | ✅ Consistent |

**Violations found:** None.

**Notes:**
- "output" is used in descriptive phrases like "persistent outputs" and "durable outputs" which is acceptable as a description of what artifacts are, not as a replacement term.
- "target" exists as an `ArtifactType` enum value (`'target'`) which is a specific artifact type, not a synonym for the Artifact concept itself.
- "note" exists as an `ArtifactType` enum value (`'note'`) which is a specific artifact type.
- The `ARTIFACT_TYPES` enum properly treats these as sub-types of Artifact.

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Page title (`ArtifactsPage`) | "Artifacts" | Yes |
| Page title (`ArtifactDetailPage`) | Artifact title | Yes |
| Nav label | "Artifacts" | Yes |
| Empty state title | "No artifacts yet" | Yes |
| Empty state CTA | "View Missions" | Yes |
| Summary card (`WorkspaceOverviewPage`) | "Artifacts" | Yes |
| Mission detail section | "Recent artifacts" | Yes |
| Run detail section | "Artifacts" | Yes |

---

### 7. Knowledge

| Property | Value |
|---|---|
| Canonical singular | Knowledge |
| Canonical plural | Knowledge (uncountable) |
| Forbidden alternatives | "document" (when referring to the knowledge concept), "file" (when referring to the knowledge concept) |
| Status | ✅ Consistent |

**Violations found:** None.

**Notes:**
- "document" exists as a knowledge item type and as an artifact type -- these are specific sub-types, not synonyms for Knowledge.
- The vocabulary description uses "documents, notes, and other context" to describe what Knowledge contains, which is appropriate.
- "file" is used in `FileCard`, `FilePreview` components to describe file-type knowledge items, which is acceptable.

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Page title (Knowledge board) | "Knowledge" | Yes |
| Nav label | "Knowledge" | Yes |
| Empty state title | "No knowledge yet" | Yes |
| Empty state CTA | "Add Knowledge" | Yes |
| Summary card (`WorkspaceOverviewPage`) | "Knowledge" | Yes |
| Header button | "New Knowledge" | Yes |
| Section meta | "Knowledge" / "Knowledge Details" | Yes |

---

### 8. Entity

| Property | Value |
|---|---|
| Canonical singular | Entity |
| Canonical plural | Entities |
| Forbidden alternatives | "node" (when referring to a graph entity), "object" (when referring to a graph entity) |
| Status | ✅ Consistent |

**Violations found:** None.

**Notes:**
- "node" is used extensively in the Workflow context (WorkflowNode, entry node, node inspector) which is correct -- workflow nodes are a distinct concept from graph entities.
- No dedicated entity/graph page was found in the current audit scope. Entity references may exist in knowledge intelligence features.

---

### 9. Evidence

| Property | Value |
|---|---|
| Canonical singular | Evidence |
| Canonical plural | Evidence (uncountable) |
| Forbidden alternatives | "context" (when referring to evidence), "retrieval result" |
| Status | ✅ Consistent |

**Violations found:** None.

**Notes:**
- `EvidencePacketPanel` component exists with appropriate terminology ("evidence").
- "context" is used in knowledge descriptions ("user-provided context") which is a valid distinct usage, not a substitute for Evidence.

---

### 10. Approval

| Property | Value |
|---|---|
| Canonical singular | Approval |
| Canonical plural | Approvals |
| Forbidden alternatives | "review" (when referring to HITL approval), "gate" (when referring to HITL approval) |
| Status | ✅ Consistent |

**Violations found:** None.

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Settings section | "Approvals" | Yes |
| Settings description | "Review and approve pending human-in-the-loop items." | Yes |
| Operator Dashboard section | "Approval inbox" | Yes |
| Run status | "waiting_approval" | Yes |
| Run detail section | "Interrupts and approvals" | Yes |
| Pending bell | `PendingApprovalsBell` | Yes |

---

### 11. Policy

| Property | Value |
|---|---|
| Canonical singular | Policy |
| Canonical plural | Policies |
| Forbidden alternatives | "rule" (when referring to a policy), "config" (when referring to a policy) |
| Status | ✅ Consistent |

**Violations found:** None.

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Settings section | "Policies" | Yes |
| Settings description | "Define execution policies and guardrails." | Yes |
| Mission detail labels | "Approval policy", "Budget policy" | Yes |
| Profile detail description | "modular policies" | Yes |

---

### 12. Catalog

| Property | Value |
|---|---|
| Canonical singular | Catalog |
| Canonical plural | Catalog (uncountable in product usage) |
| Forbidden alternatives | "library", "store", "marketplace" |
| Status | ✅ Consistent |

**Violations found:** None.

**Verification across surfaces:**

| Surface | Term used | Correct? |
|---|---|---|
| Page title (`CatalogPage`) | "Catalog" | Yes |
| Nav label | "Catalog" | Yes |
| Empty state title | "No catalog items yet" | Yes |
| Empty state CTA | "Browse Catalog" | Yes |
| Section meta | "Catalog" | Yes |

---

## Cross-Cutting Verification

### Page Titles

| Page | Title | Uses canonical term? |
|---|---|---|
| WorkspaceOverviewPage | "Workspace" | Yes |
| ProfilesPage | "Profiles" (via `getLabel`) | Yes |
| ProfileDetailPage | `{profile.name}` | Yes |
| WorkflowsPage | "Workflows" (via `getLabel`) | Yes |
| WorkflowDetailPage | `{workflow.name}` | Yes |
| MissionsPage | "Missions" (via `getLabel`) | Yes |
| MissionDetailPage | `{mission.name}` | Yes |
| RunsPage | "Runs" (via `getLabel`) | Yes |
| RunDetailPage | "Run {truncated_id}" | Yes |
| ArtifactsPage | "Artifacts" | Yes |
| ArtifactDetailPage | `{artifact.title}` | Yes |
| CatalogPage | "Catalog" | Yes |
| OperatorDashboardPage | "Operator Dashboard" | Yes |
| SettingsPage | "Settings" | Yes |

### Button Labels

| Button | Location | Uses canonical term? |
|---|---|---|
| "New Profile" | ProfilesPage | Yes |
| "Create Draft Profile" | ProfilesPage composer | Yes |
| "New Artifact" | ArtifactsPage | Yes |
| "Create Artifact" | ArtifactsPage composer | Yes |
| "Create Version" | ArtifactDetailPage | Yes |
| "Save Metadata" | ArtifactDetailPage | Yes |
| "Save Changes" | ProfileDetailPage | Yes |
| "Launch" | MissionsPage, MissionDetailPage | Yes |
| "Pause" | MissionsPage, MissionDetailPage | Yes |
| "Resume" | MissionsPage, MissionDetailPage | Yes |
| "Disable" | MissionDetailPage | Yes |
| "Activate" | MissionDetailPage | Yes |
| "Clone" | CatalogPage | Yes |
| "New Knowledge" | AppShell header | Yes |
| "Add Knowledge" | Knowledge empty state | Yes |
| "Add Workspace" | WorkspaceSwitcher | Yes |
| "Archive" | ArtifactDetailPage | Yes |
| "Delete" | ProfileDetailPage, ArtifactDetailPage | Yes |
| "Attach Sink" | ArtifactDetailPage | Yes |

### Dialog Labels

| Dialog | Location | Uses canonical term? |
|---|---|---|
| "Delete permanently?" | AppShell (conversation) | Yes -- conversation context, not a domain noun |
| "Create Artifact" (card title) | ArtifactsPage | Yes |
| "Profile Builder" (section title) | ProfilesPage | Yes |

### Error Messages

| Error Message | Location | Uses canonical term? | Issue? |
|---|---|---|---|
| "Profiles could not be loaded from the canonical domain API." | ProfilesPage | Yes | Contains internal jargon "canonical domain API" |
| "Workflows could not be loaded from the canonical domain API." | WorkflowsPage | Yes | Contains internal jargon |
| "Missions could not be loaded from the canonical domain API." | MissionsPage | Yes | Contains internal jargon |
| "Runs could not be loaded from the canonical domain API." | RunsPage | Yes | Contains internal jargon |
| "Artifacts could not be loaded from the canonical domain API." | ArtifactsPage | Yes | Contains internal jargon |
| "The catalog could not be loaded. Please try again." | CatalogPage | Yes | Clean -- good pattern |
| "Profile details could not be loaded from the canonical profiles API." | ProfileDetailPage | Yes | Contains internal jargon |
| "Workflow detail could not be loaded from the canonical workflows API." | WorkflowDetailPage | Yes | Contains internal jargon |
| "Mission detail could not be loaded from the canonical missions API." | MissionDetailPage | Yes | Contains internal jargon |
| "Run detail could not be loaded from the canonical runtime APIs." | RunDetailPage | Yes | Contains internal jargon |
| "Artifact detail could not be loaded from the canonical artifact API." | ArtifactDetailPage | Yes | Contains internal jargon |

**Recommendation:** Adopt the CatalogPage error pattern ("could not be loaded. Please try again.") across all surfaces.

### Empty-State Copy

| Domain | Title | Description | CTA | Correct? |
|---|---|---|---|---|
| Profile | "No profiles yet" | "Create your first profile to define specialist capabilities and behaviors." | "Create Profile" | Yes |
| Workflow | "No workflows yet" | "Build your first workflow to define how tasks are executed." | "Create Workflow" | Yes |
| Mission | "No missions yet" | "Deploy your first mission to run autonomous workflows." | "Create Mission" | Yes |
| Trigger | "No triggers yet" | "Set up triggers to automate mission execution." | "Create Trigger" | Yes |
| Run | "No runs yet" | "Execute a mission or workflow to see runs here." | "Start Run" | Yes |
| Artifact | "No artifacts yet" | "Artifacts produced by your missions will appear here." | "View Missions" | Yes |
| Knowledge | "No knowledge yet" | "Add documents, notes, and other context for AI processing." | "Add Knowledge" | Yes |
| Catalog | "No catalog items yet" | "Pre-built templates will appear here once published." | "Browse Catalog" | Yes |

All empty-state copy uses correct canonical terms.

### Help Text and Descriptions

| Location | Text | Issue |
|---|---|---|
| `DOMAIN_DESCRIPTIONS.profile` | "Agent profiles define the capabilities, prompts, and behaviors of AI workers." | Should be "Profiles define..." |
| `DOMAIN_DESCRIPTIONS.run` | "Runs are execution instances of workflows or missions." | Borderline -- "execution instances" is descriptive, not a term substitution |
| `SETTINGS_DESCRIPTIONS.prompts` | "Manage prompt templates for agent profiles." | Should be "Manage prompt templates for profiles." |

### API Response Messages

API response messages are primarily generated by the backend and are outside the scope of this frontend terminology audit. However, the error messages displayed in `ErrorState` components should be reviewed for consistency with the terminology guidelines (see Error Messages section above).

---

## Summary

| Term | Status | Action Required |
|---|---|---|
| Profile | ⚠️ Minor issues | Replace "agent profile" with "profile" in `productVocabulary.ts` descriptions and `PromptsPage.tsx` |
| Workflow | ✅ Consistent | None |
| Mission | ✅ Consistent | None |
| Trigger | ✅ Consistent | None |
| Run | ⚠️ Minor issues | Consider rewording "execution instances" in vocabulary description |
| Artifact | ✅ Consistent | None |
| Knowledge | ✅ Consistent | None |
| Entity | ✅ Consistent | None |
| Evidence | ✅ Consistent | None |
| Approval | ✅ Consistent | None |
| Policy | ✅ Consistent | None |
| Catalog | ✅ Consistent | None |

**Overall assessment:** Terminology is largely consistent across the product. The primary remediation items are:

1. Replace "Agent profiles" with "Profiles" in `DOMAIN_DESCRIPTIONS.profile` (productVocabulary.ts line 178).
2. Replace "agent profiles" with "profiles" in `SETTINGS_DESCRIPTIONS.prompts` (productVocabulary.ts line 366).
3. Remove "Agent Profile" references from comments in productVocabulary.ts (lines 9, 408).
4. Replace "agent profiles" with "profiles" in PromptsPage.tsx file header comment.
5. Standardize error messages to remove internal API jargon (11 error messages across list and detail pages).
