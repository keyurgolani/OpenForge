# Phase 9 Runtime Extraction Map

## Goal

This map shows where monolithic execution responsibilities move as the workflow runtime becomes the canonical orchestration path.

## Responsibility moves

### Runtime coordination

From:

- `backend/openforge/runtime/execution_engine.py`

To:

- `backend/openforge/runtime/coordinator.py`

Owns:

- durable run creation
- node-to-node progression
- lifecycle transitions
- checkpoint boundaries
- interrupt, resume, cancel, and completion handling

### Run persistence

From:

- implicit or chat-scoped execution state

To:

- `RunModel`
- `RunStepModel`
- `CheckpointModel`
- `RuntimeEventModel`

Owns:

- inspectable run history
- lineage
- state snapshots
- replayable operational context

### Graph compilation

From:

- inline orchestration assumptions

To:

- `backend/openforge/runtime/langgraph_adapter.py`

Owns:

- runtime backend boundary
- workflow version compilation
- local fallback while LangGraph is optional

### Node behavior

From:

- special-case logic inside a broad execution path

To:

- `backend/openforge/runtime/node_executors/`

Owns:

- `llm`
- `tool`
- `router`
- `approval`
- `artifact`
- `subworkflow`
- `join` and terminal placeholders

### Checkpoint storage

From:

- ephemeral in-process state

To:

- `backend/openforge/runtime/checkpoint_store.py`

Owns:

- before-step and after-step snapshots
- future retry/replay foundations

### Event publishing

From:

- mixed logging and UI-only signals

To:

- `backend/openforge/runtime/event_publisher.py`
- `backend/openforge/runtime/stream_events.py`

Owns:

- durable runtime events
- redis fanout for live UI updates

### Approval and policy hooks

From:

- inline trust checks and special-case interrupt handling

To:

- approval executor
- coordinator lifecycle decisions
- existing approval service

Owns:

- durable approval requests
- explicit interrupt state
- resume routing

### Artifact emission

From:

- side-effecting output writes in execution code

To:

- artifact executor
- Phase 8 artifact service

Owns:

- durable output creation
- artifact lineage into runs and workflows

## Guardrail

`execution_engine.py` remains transitional during Phase 9. It can continue to serve legacy chat flow needs, but it must not absorb new graph-runtime features. Any new orchestration capability should be implemented in the Phase 9 runtime boundary instead.
