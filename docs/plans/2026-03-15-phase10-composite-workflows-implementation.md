# Phase 10 Composite Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend OpenForge's Phase 9 workflow runtime into the full Phase 10 composite orchestration system described in `sdlc/Phase10Plan.md`.

**Architecture:** Extend the existing workflow, run, runtime, artifact, and frontend inspection surfaces in place. Keep orchestration in the Phase 9 runtime boundary, add explicit composite state and APIs, seed real templates, and migrate one meaningful composite pattern end-to-end.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, Alembic, Pydantic, React 19, Vite, TypeScript

---

### Task 1: Add Phase 10 architecture and contributor docs

**Files:**
- Create: `docs/architecture/phase10-delegation-and-composite-execution.md`
- Create: `docs/architecture/phase10-state-transfer-and-merge.md`
- Create: `docs/architecture/phase10-composite-pattern-catalog.md`
- Modify: `docs/development/runtime-orchestration-rules.md`

**Steps:**
1. Write the Phase 10 delegation and composite execution spec.
2. Write the state transfer and merge spec.
3. Write the composite pattern catalog.
4. Update runtime orchestration rules with Phase 10 guardrails.

### Task 2: Extend workflow and run tests for composite types and metadata

**Files:**
- Modify: `backend/tests/domains/workflows/test_service.py`
- Modify: `backend/tests/domains/runs/test_run_service.py`
- Modify: `backend/tests/phases/test_phase9_runtime_foundation.py`
- Create: `backend/tests/phases/test_phase10_composite_foundation.py`

**Steps:**
1. Write failing tests for new workflow node types, template metadata, and validation expectations.
2. Write failing tests for run and step composite metadata serialization and lineage inspection.
3. Write failing phase-level guardrail tests for required Phase 10 docs and runtime modules.
4. Run the targeted tests and confirm they fail for missing Phase 10 behavior.

### Task 3: Add the Phase 10 schema migration and data model changes

**Files:**
- Modify: `backend/openforge/db/models.py`
- Create: `backend/openforge/db/migrations/versions/009_phase10_composite_workflows.py`
- Modify: `backend/openforge/domains/common/enums.py`
- Modify: `backend/openforge/domains/workflows/types.py`
- Modify: `backend/openforge/domains/runs/types.py`
- Modify: `backend/openforge/domains/workflows/schemas.py`
- Modify: `backend/openforge/domains/runs/schemas.py`

**Steps:**
1. Write a failing migration- or model-level test for new composite columns and enums.
2. Add new node and delegation enums plus workflow and run type fields.
3. Add workflow definition template metadata fields.
4. Add run and run-step composite fields.
5. Create the Alembic migration with default backfills.
6. Re-run the targeted model and phase tests until they pass.

### Task 4: Add workflow validation and composite template services

**Files:**
- Modify: `backend/openforge/domains/workflows/service.py`
- Modify: `backend/openforge/domains/workflows/router.py`
- Modify: `backend/openforge/domains/workflows/seed.py`
- Create: `backend/tests/domains/workflows/test_phase10_composite_validation.py`
- Modify: `backend/tests/domains/workflows/test_seed_contracts.py`

**Steps:**
1. Write failing tests for composite node validation, template listing, and template cloning.
2. Implement validation for target refs, fan-out or join rules, handoff rules, and reducer compatibility.
3. Add workflow template metadata support.
4. Seed at least three composite templates and one proof pattern template.
5. Add template APIs for list, get, and clone.
6. Re-run workflow service and API tests until they pass.

### Task 5: Add state transfer, merge, and composite runtime helpers

**Files:**
- Create: `backend/openforge/runtime/composite_types.py`
- Create: `backend/openforge/runtime/state_transfer.py`
- Create: `backend/openforge/runtime/merge_engine.py`
- Create: `backend/openforge/runtime/composite_inspector.py`
- Modify: `backend/openforge/runtime/events.py`
- Modify: `backend/openforge/runtime/langgraph_adapter.py`
- Modify: `backend/openforge/runtime/node_executors/base.py`

**Steps:**
1. Write failing unit tests for parent-child input mapping, output merge strategies, reducer behavior, and join readiness.
2. Implement state mapping helpers and schema checks.
3. Implement merge strategies for direct map, append, artifact refs, evidence refs, and reducer operations.
4. Extend compiled graph handling for composite metadata and branch groups.
5. Extend runtime events and executor result types for composite behavior.
6. Re-run the targeted runtime tests until they pass.

### Task 6: Implement composite node executors and coordinator behavior

**Files:**
- Modify: `backend/openforge/runtime/coordinator.py`
- Modify: `backend/openforge/runtime/node_executors/registry.py`
- Modify: `backend/openforge/runtime/node_executors/subworkflow.py`
- Modify: `backend/openforge/runtime/node_executors/tool.py`
- Create: `backend/openforge/runtime/node_executors/delegate_call.py`
- Create: `backend/openforge/runtime/node_executors/handoff.py`
- Create: `backend/openforge/runtime/node_executors/fanout.py`
- Create: `backend/openforge/runtime/node_executors/join.py`
- Create: `backend/openforge/runtime/node_executors/reduce.py`
- Create: `backend/tests/runtime/test_phase10_composite_runtime.py`

**Steps:**
1. Write failing runtime tests for delegate call, handoff, subworkflow, fan-out, join, reduce, partial failure, and child approval resume.
2. Implement composite child-run creation, lifecycle coordination, and event persistence in the coordinator.
3. Implement each composite executor and register it.
4. Upgrade subworkflow execution to use explicit mapping and merge behavior.
5. Implement parent reaction rules for child completion, failure, retry, and interrupt.
6. Re-run runtime tests until they pass.

### Task 7: Extend run inspection services and composite APIs

**Files:**
- Modify: `backend/openforge/domains/runs/service.py`
- Modify: `backend/openforge/domains/runs/router.py`
- Modify: `backend/openforge/api/runtime.py`
- Create: `backend/tests/api/test_phase10_composite_api.py`

**Steps:**
1. Write failing API tests for run tree, delegation history, branch groups, merge outcomes, and composite debug views.
2. Implement richer run serialization and inspection helpers.
3. Add new composite inspection endpoints.
4. Reduce or wrap the legacy delegation endpoint so it no longer bypasses canonical runtime behavior.
5. Re-run API tests until they pass.

### Task 8: Integrate artifact and evidence lineage for composite execution

**Files:**
- Modify: `backend/openforge/domains/artifacts/service.py`
- Modify: `backend/openforge/domains/artifacts/lineage.py`
- Modify: `backend/openforge/domains/artifacts/schemas.py`
- Modify: `backend/openforge/domains/retrieval/evidence.py`
- Create: `backend/tests/domains/artifacts/test_phase10_composite_lineage.py`

**Steps:**
1. Write failing tests for child artifact linkage, parent reducer artifact derivation, and aggregated evidence lineage.
2. Implement branch-aware artifact and evidence lineage helpers.
3. Ensure final artifacts can trace relevant delegated branches.
4. Re-run lineage tests until they pass.

### Task 9: Migrate one meaningful composite pattern end-to-end

**Files:**
- Modify: `backend/openforge/domains/workflows/seed.py`
- Modify: `backend/tests/runtime/test_phase10_composite_runtime.py`
- Modify: `backend/tests/api/test_phase10_composite_api.py`

**Steps:**
1. Write failing end-to-end tests for the `map-reduce-research` proof pattern.
2. Encode the pattern as a real seeded workflow template.
3. Ensure parent-child lineage, join or reduce state, and final output are persisted and inspectable.
4. Re-run proof-pattern tests until they pass.

### Task 10: Add frontend composite types, APIs, and workflow detail UI

**Files:**
- Modify: `frontend/src/types/workflows.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/features/workflows/hooks.ts`
- Modify: `frontend/src/pages/WorkflowDetailPage.tsx`
- Create: `frontend/src/pages/__tests__/WorkflowDetailPage.test.tsx`
- Modify: `frontend/package.json`

**Steps:**
1. Write failing frontend tests for composite node rendering, template badges, and strategy summaries.
2. Add any missing frontend test harness dependencies and scripts.
3. Extend workflow types and API clients for composite metadata.
4. Implement workflow detail UI for delegation, fan-out, join, reduce, and template pattern summaries.
5. Re-run workflow detail tests until they pass.

### Task 11: Add frontend composite run UI

**Files:**
- Modify: `frontend/src/types/runs.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/features/runs/hooks.ts`
- Modify: `frontend/src/pages/RunDetailPage.tsx`
- Create: `frontend/src/pages/__tests__/RunDetailPage.test.tsx`

**Steps:**
1. Write failing frontend tests for delegation timelines, branch grouping, merge visibility, and partial-failure display.
2. Extend run types and API clients for composite inspection payloads.
3. Implement run detail UI for parent-child grouping, branch state, join outcome, and merge outcome visibility.
4. Re-run run detail tests until they pass.

### Task 12: Run full verification, clean temporary files, and ship

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Move: `task_plan.md` -> `sdlc/task_plan.md`
- Move: `findings.md` -> `sdlc/findings.md`
- Move: `progress.md` -> `sdlc/progress.md`

**Steps:**
1. Run backend targeted tests, backend full tests if feasible, frontend tests, frontend typecheck, and frontend build.
2. Record verification output in `progress.md`.
3. Move temporary planning files into ignored `sdlc/`.
4. Stage all git-eligible changes.
5. Create one conventional commit on `main`.
6. Push to `origin/main`.
