# Phase 14 Release Readiness Definition

## Purpose

This document defines what "release ready" means for OpenForge at the conclusion of Phase 14. It establishes the scope of the release, stability requirements, acceptable deferral boundaries, critical user/operator journeys, performance minimums, and documentation baselines.

---

## 1. Release Scope

The following subsystems and surfaces are **in scope** for the Phase 14 release. Each must be functional, tested, and documented.

### Core Domain Models

| Domain | Key Models | Status Required |
|--------|-----------|-----------------|
| Profiles | `AgentProfileModel` | Stable |
| Workflows | `WorkflowDefinitionModel`, `WorkflowVersionModel`, `WorkflowNodeModel`, `WorkflowEdgeModel` | Stable |
| Missions | `MissionDefinitionModel` | Stable |
| Triggers | `TriggerDefinitionModel` | Stable |
| Runs | `RunModel`, `RunStepModel`, `CheckpointModel`, `RuntimeEventModel` | Stable |
| Artifacts | `ArtifactModel`, `ArtifactVersionModel`, `ArtifactLinkModel`, `ArtifactSinkModel` | Stable |
| Knowledge | Knowledge ingestion, processing, embedding | Stable |
| Graph | `EntityModel`, `RelationshipModel`, `GraphExtractionJobModel`, provenance links | Stable |
| Retrieval | `RetrievalQueryModel`, `EvidencePacketModel`, `RetrievalSearchResultModel` | Stable |
| Catalog | Curated catalog with profile/workflow/mission items, clone behavior | Stable |
| Observability | Usage summaries, cost hotspots, failure events, failure rollups, run telemetry | Stable |
| Evaluation | Run comparison, metric deltas, scenario diffs | Functional |
| Policies | Model policies, memory policies, output contracts | Stable |
| Prompts | Prompt management | Stable |

### Runtime

| Component | Scope |
|-----------|-------|
| Execution Engine | `AgentExecutionEngine` unified chat pipeline |
| Composite Workflows | Node executors, merge engine, state transfer, composite inspector |
| HITL (Human-in-the-Loop) | Approval requests, resume-after-HITL via Celery task |
| Checkpointing | Checkpoint store, state persistence across restarts |
| Event System | `EventPublisher`, `RuntimeEventModel`, stream events |
| Policy Enforcement | Trust boundaries, profile registry |

### Infrastructure

| Component | Scope |
|-----------|-------|
| PostgreSQL | Primary data store |
| Qdrant | Vector search for knowledge and retrieval |
| Redis | Celery broker, caching |
| Celery Workers | Background task execution |
| Tool Server | External tool execution via MCP |
| Task Scheduler | Periodic trigger evaluation and task dispatch |

### Frontend Surfaces

| Page | Scope |
|------|-------|
| Workspace Home / Overview | Landing experience, workspace context |
| Agent Chat | Conversational interface with retrieval-backed answers |
| Profiles, Workflows, Missions | Browse, detail views, CRUD |
| Catalog | Curated item browsing, difficulty levels, cloning |
| Runs | Run list, run detail with step inspection |
| Artifacts | Artifact list, version history, lineage links |
| Approvals | Approval inbox, approve/reject actions |
| Search | Full-text and visual search |
| Operator Dashboard | Observability, cost, failure inspection |
| Settings | LLM providers, workspace config, tool sync |
| Onboarding | First-run setup experience |

---

## 2. Stability Requirements

### Must Be Stable (No Known Regressions)

These subsystems must have no open blocker or major bugs at release time.

- **Core runtime**: Execution engine, run lifecycle (pending -> running -> completed/failed/cancelled)
- **Workflow execution**: Single-node and composite workflow dispatch, node executor routing, merge strategy
- **Mission scheduling**: Trigger evaluation, scheduled and manual mission launch, mission health state machine
- **Artifact lineage**: Artifact creation from runs, version tracking, artifact links between runs/steps
- **Retrieval pipeline**: Query decomposition, vector search, evidence packet assembly, citation in chat
- **Approval flows**: HITL request creation, approval inbox rendering, approve/reject/resume lifecycle
- **Knowledge ingestion**: File upload, processing pipeline, embedding storage in Qdrant
- **Graph extraction**: Entity/relationship extraction from knowledge, provenance links
- **Catalog browsing and cloning**: Curated items render correctly, clone creates a workspace-local copy
- **Observability surfaces**: Usage summary, cost hotspots, failure list, run telemetry summary
- **Task scheduler**: Cron-like trigger polling, correct dispatch, idempotent re-evaluation after restart

### Can Remain Internal/Hidden

These features may exist in code but do not need to be user-facing or fully polished for release.

- **Evaluation harness internals**: Run comparison is available but the full evaluation suite (scenario generation, automated scoring) can remain API-only without dedicated UI
- **Advanced graph reasoning**: Multi-hop graph queries and complex entity canonicalization may be limited to API access
- **Temporal integration**: If any Temporal-based orchestration exists, it may remain behind a feature flag
- **Capability bundles**: Internal grouping mechanism; no user-facing exposure required
- **Router registry internals**: LLM router/council/optimizer plumbing may remain operator-only
- **Memory policy tuning**: Advanced memory policy configuration can remain in settings without dedicated UX

---

## 3. Critical User Journeys

The following user journeys must pass end-to-end in the release candidate. Each journey is documented in detail in `phase14-critical-user-journeys.md`.

| # | Journey | Priority |
|---|---------|----------|
| 1 | First workspace setup and onboarding | P0 |
| 2 | Import files and initial knowledge ingestion | P0 |
| 3 | First chat with retrieval-backed answer and citations | P0 |
| 4 | Browse Profiles, Workflows, and Missions catalog | P0 |
| 5 | Clone and customize a Workflow or Mission from catalog | P0 |
| 6 | Run a Mission manually (immediate execution) | P0 |
| 7 | Review Runs and inspect Artifacts produced | P0 |
| 8 | Handle an Approval request (approve and reject paths) | P0 |
| 9 | Inspect Entity/Knowledge relationships in graph view | P1 |
| 10 | Use operator/debug surfaces to diagnose a failed run | P1 |
| 11 | Configure an LLM provider and verify connectivity | P0 |
| 12 | Set up a scheduled trigger for a Mission | P1 |
| 13 | Search across workspace knowledge (text and visual) | P1 |
| 14 | Export workspace data | P2 |

---

## 4. Critical Operator Workflows

| # | Workflow | Priority |
|---|---------|----------|
| 1 | Deploy OpenForge via Docker Compose, verify all services healthy | P0 |
| 2 | Review cost hotspots and usage summaries in Operator Dashboard | P0 |
| 3 | Investigate a failed run using failure taxonomy (class, severity, retryability) | P0 |
| 4 | Manage approval inbox backlog (bulk operations, stale approval cleanup) | P1 |
| 5 | Sync tools from tool server and verify tool availability | P0 |
| 6 | Monitor Celery worker health and task throughput | P1 |
| 7 | Run database migrations (Alembic) during upgrade | P0 |
| 8 | Configure virtual LLM providers (router, council, optimizer) | P1 |

---

## 5. Performance Minimums

All thresholds measured under normal operating conditions (single Docker Compose deployment, <10 concurrent users, <100K knowledge chunks).

| Metric | Threshold | Measurement Point |
|--------|-----------|-------------------|
| API route latency (p95) | < 500ms | Any non-streaming REST endpoint |
| API route latency (p50) | < 200ms | Any non-streaming REST endpoint |
| Run startup time | < 2s | Time from run creation to first step execution |
| Scheduler trigger evaluation | < 1s | Time from trigger poll to task dispatch |
| Knowledge ingestion throughput | < 30s per document | Single PDF/text file processing to indexed state |
| Retrieval query latency | < 1s | End-to-end from query to evidence packet |
| Graph query latency | < 2s | Entity neighborhood query with relationships |
| Artifact list load | < 500ms | First page of artifacts for a workspace |
| Artifact detail load | < 300ms | Single artifact with version history |
| Chat first-token latency | < 3s | Time from message send to first streamed token (excluding LLM provider latency) |
| Catalog page load | < 500ms | Full catalog with all items |
| Operator dashboard load | < 1s | Usage summary + failure rollup |
| WebSocket connection setup | < 500ms | Chat stream connection establishment |

---

## 6. Documentation Minimums

The following documentation must exist and be current before release.

### User Documentation

- [ ] Core concepts guide: Workspaces, Profiles, Workflows, Missions, Runs, Artifacts
- [ ] Knowledge management guide: Importing files, ingestion, retrieval
- [ ] Chat usage guide: Asking questions, understanding citations, tool use
- [ ] Catalog guide: Browsing, cloning, customization
- [ ] Approval handling guide: What approvals are, how to act on them

### Operator Documentation

- [ ] Deployment guide: Docker Compose setup, environment variables, volume mounts
- [ ] Configuration reference: All environment variables with defaults and descriptions
- [ ] LLM provider setup: Adding providers, configuring virtual providers
- [ ] Troubleshooting guide: Common failure modes, log locations, health checks
- [ ] Upgrade guide: Running migrations, handling breaking changes

### Architecture Documentation

- [ ] System architecture overview: Service topology, data flow
- [ ] Domain model reference: All domains and their relationships
- [ ] Runtime execution model: How runs, steps, and composite workflows execute
- [ ] API reference: Auto-generated or manually maintained endpoint docs

---

## 7. Release Readiness Decision Criteria

The release is considered **ready** when:

1. All P0 critical user journeys pass on the release candidate build
2. All P0 operator workflows pass on the release candidate build
3. No open blocker bugs remain
4. No more than 3 open major bugs remain (with documented workarounds)
5. All performance minimums are met
6. All documentation minimums are checked off
7. The sign-off matrix in `phase14-release-candidate-process.md` is fully signed
8. The release gate checklist in `phase14-release-gate-checklist.md` is fully checked

The release is **not ready** if any of the following are true:

- Any P0 journey fails on the RC build
- Any blocker bug is open
- Any performance minimum is missed by more than 2x
- Any required documentation section is missing entirely
