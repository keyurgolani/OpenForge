# Phase 14 Release Gate Checklist

## Purpose

This checklist must be fully completed before the Phase 14 release candidate can be promoted to a general release. Each item requires explicit sign-off from the responsible party. Items marked with `[BLOCKER]` will halt the release if incomplete.

---

## 1. Architecture Complete

All domain models, runtime components, and execution paths are implemented and integrated.

- [ ] `[BLOCKER]` All domain models present and migrated: Profiles, Workflows, Missions, Triggers, Runs, Artifacts, Knowledge, Graph, Retrieval, Policies, Prompts
- [ ] `[BLOCKER]` Workflow execution engine handles single-node and composite workflows
- [ ] `[BLOCKER]` WorkflowVersionModel supports versioned workflow definitions with nodes and edges
- [ ] `[BLOCKER]` Mission scheduling: TriggerDefinitionModel evaluated by TaskScheduler, missions launched on schedule
- [ ] `[BLOCKER]` Run lifecycle state machine complete: pending -> running -> completed | failed | cancelled
- [ ] `[BLOCKER]` Checkpoint store persists run state; runs are resumable after interruption
- [ ] `[BLOCKER]` HITL approval flow: request creation, approval/rejection, resume-after-HITL via Celery
- [ ] `[BLOCKER]` Artifact lineage: artifacts created by runs, version history maintained, links between artifacts tracked
- [ ] `[BLOCKER]` Knowledge ingestion pipeline: upload -> processing -> embedding -> Qdrant indexing
- [ ] `[BLOCKER]` Retrieval pipeline: query -> vector search -> evidence packet assembly -> citation
- [ ] `[BLOCKER]` Graph extraction: entity/relationship extraction from knowledge, provenance links stored
- [ ] `[BLOCKER]` Catalog seeder populates curated profiles, workflows, and missions
- [ ] `[BLOCKER]` Catalog clone behavior: system_locked, clone_only, editable_after_clone all function correctly
- [ ] Observability: usage summaries, cost hotspots, failure events, failure rollups, run telemetry
- [ ] Evaluation: run comparison endpoint returns metric deltas and scenario diffs
- [ ] Policy enforcement: model policies, memory policies, and output contracts enforced at runtime
- [ ] Capability bundles registered and resolvable (internal)
- [ ] Virtual LLM providers (router, council, optimizer) configurable and functional

---

## 2. QA Complete

Automated and manual testing covers all critical paths.

- [ ] `[BLOCKER]` Regression test suite passes on release candidate build (0 failures)
- [ ] `[BLOCKER]` All 10 critical user journeys pass end-to-end (see `phase14-critical-user-journeys.md`)
- [ ] `[BLOCKER]` All 5 P0 operator workflows pass end-to-end
- [ ] `[BLOCKER]` Smoke test suite defined and passing (see `phase14-release-candidate-process.md`)
- [ ] Performance test plan executed; all thresholds met (see `phase14-performance-test-plan.md`)
- [ ] Resilience test plan executed; all scenarios pass (see `phase14-resilience-test-plan.md`)
- [ ] API contract tests: all REST endpoints return expected status codes and response shapes
- [ ] WebSocket streaming: chat messages stream correctly, reconnection works
- [ ] Database migration path tested: clean install and upgrade from previous version
- [ ] Docker Compose deployment tested on a clean machine (no leftover volumes)
- [ ] Tool server sync tested: POST /api/v1/tools/sync discovers and registers tools
- [ ] Celery worker tested: background tasks dispatch and complete correctly
- [ ] Scheduler tested: enabled triggers fire on schedule, disabled triggers do not

---

## 3. UX/Copy Complete

User-facing text, terminology, and interaction patterns are consistent and polished.

- [ ] `[BLOCKER]` Terminology audit complete: "Profile", "Workflow", "Mission", "Run", "Artifact", "Trigger" used consistently across all surfaces
- [ ] `[BLOCKER]` Empty states: every list page shows a meaningful empty state with guidance (not blank or "No data")
- [ ] `[BLOCKER]` Onboarding flow: new user can complete workspace setup without confusion
- [ ] Action verb consistency: "Create", "Clone", "Run", "Approve", "Reject", "Cancel" used consistently
- [ ] Error messages: user-facing errors are actionable (not raw stack traces or UUIDs)
- [ ] Loading states: all data-fetching pages show loading indicators
- [ ] Confirmation dialogs: destructive actions (delete, cancel run) require confirmation
- [ ] Form validation: required fields enforced, invalid input shows inline errors
- [ ] Navigation: breadcrumbs and back-links work correctly on all detail pages
- [ ] Responsive layout: core pages functional at 1024px+ viewport width
- [ ] Catalog item cards: difficulty level, setup complexity, and description render correctly
- [ ] Run detail page: steps, artifacts, and telemetry render in logical order
- [ ] Approval inbox: pending approvals clearly distinguished from resolved ones

---

## 4. Docs Complete

All required documentation exists and is accurate for the release candidate.

- [ ] `[BLOCKER]` Core concepts documented: Workspaces, Profiles, Workflows, Missions, Runs, Artifacts, Knowledge
- [ ] `[BLOCKER]` Deployment guide: Docker Compose setup with all environment variables documented
- [ ] `[BLOCKER]` Troubleshooting guide: covers the 10 most common failure modes
- [ ] User guide: chat, retrieval, catalog browsing, cloning, running missions
- [ ] Operator guide: monitoring, cost review, failure investigation, approval management
- [ ] Architecture overview: service topology, domain relationships, runtime execution model
- [ ] API reference: all public endpoints documented (auto-generated from OpenAPI spec or manual)
- [ ] Configuration reference: every environment variable with type, default, and description
- [ ] Upgrade guide: migration steps, breaking changes, rollback procedure
- [ ] Knowledge management guide: supported file types, ingestion process, search behavior

---

## 5. Observability / Operator Readiness

Operators can monitor, diagnose, and manage the system in production.

- [ ] `[BLOCKER]` Cost accounting: usage summaries show token counts, cost estimates, model breakdown
- [ ] `[BLOCKER]` Failure taxonomy: failure events have class, severity, retryability, and affected entity references
- [ ] `[BLOCKER]` Approval inbox: operators can view, filter, and act on pending approvals
- [ ] `[BLOCKER]` Operator Dashboard: loads within performance thresholds, shows actionable data
- [ ] Cost hotspot identification: top-spending workflows/missions/models visible
- [ ] Failure rollup: failures grouped by class/severity with last-seen timestamps
- [ ] Run telemetry: per-run usage, failure count, step count, artifact count, child run count
- [ ] Log levels: LOG_LEVEL environment variable respected, no excessive logging at `warning` level
- [ ] Health check endpoint: returns service health including database and Redis connectivity
- [ ] Celery worker monitoring: task queue depth and worker status observable

---

## 6. Seed / Sample Data Complete

First-run experience includes useful curated content.

- [ ] `[BLOCKER]` Catalog seeder runs on first boot and populates curated items
- [ ] `[BLOCKER]` At least 3 curated Profiles available (varying difficulty levels)
- [ ] `[BLOCKER]` At least 3 curated Workflows available (beginner through advanced)
- [ ] `[BLOCKER]` At least 2 curated Missions available with descriptions and setup instructions
- [ ] Sample workspace: a pre-built workspace with knowledge, runs, and artifacts for demo purposes
- [ ] Demo scenarios documented: step-by-step scripts for common demo flows
- [ ] Catalog items have accurate descriptions, difficulty levels, and setup complexity ratings
- [ ] Clone behavior tested for each catalog item type (system_locked, clone_only, editable_after_clone)

---

## 7. No Blocker Bugs Open

- [ ] `[BLOCKER]` Zero open bugs with severity "blocker"
- [ ] All open "major" bugs have documented workarounds (maximum 3 allowed)
- [ ] All open "minor" bugs are triaged and scheduled for next release
- [ ] All open "polish" items are triaged (no release gate)
- [ ] Bug tracking system reviewed; no miscategorized issues

---

## Sign-Off

| Area | Reviewer | Date | Status |
|------|----------|------|--------|
| Architecture Complete | | | |
| QA Complete | | | |
| UX/Copy Complete | | | |
| Docs Complete | | | |
| Observability/Operator Readiness | | | |
| Seed/Sample Data Complete | | | |
| No Blocker Bugs | | | |
| **Final Release Approval** | | | |
