# Phase 9 Runtime Extraction Map

## Goal

This map shows where monolithic execution responsibilities move as the workflow runtime becomes the canonical orchestration path. Each section identifies the source (legacy location), destination (Phase 9 module), and what the new module owns.

## Responsibility moves

### Runtime coordinator

**File:** `backend/openforge/runtime/coordinator.py`

From:
- `backend/openforge/runtime/execution_engine.py` (orchestration loop, step sequencing, interrupt handling)

Owns:
- Durable run creation (`RunModel`)
- Node-to-node graph walking via `_continue_run()`
- Step creation, checkpoint boundaries, event emission per step
- Interrupt, resume, cancel, and completion handling
- Child-run spawning (delegated to node executors, tracked by coordinator)

### Node executors

**Directory:** `backend/openforge/runtime/node_executors/`

From:
- Special-case logic inside the broad execution path in `execution_engine.py`

Registered executors:
- `llm` -- LLM inference node
- `tool` -- tool dispatch node (also handles `transform`)
- `router` -- conditional routing node
- `approval` -- approval request + interrupt node
- `artifact` -- artifact emission node
- `subworkflow` -- child workflow invocation
- `delegate_call` -- delegation to another workflow with call semantics
- `handoff` -- handoff to another agent/workflow
- `fanout` -- parallel branch spawning
- `join` -- branch aggregation / wait gate
- `reduce` -- branch result reduction

Owns:
- Per-node-type execution logic
- `NodeExecutionResult` construction (state updates, edge routing, interrupts, artifact IDs, spawned run IDs)
- Executor registration via `NodeExecutorRegistry` and `build_default_registry()`

### Checkpoint store

**File:** `backend/openforge/runtime/checkpoint_store.py`

From:
- Ephemeral in-process state (no durable checkpoints in legacy engine)

Owns:
- `before_step` and `after_step` state snapshots persisted as `CheckpointModel` records
- Checkpoint retrieval by ID and listing by run ID
- Foundation for future retry/replay behavior

### Event publisher

**File:** `backend/openforge/runtime/event_publisher.py`

From:
- Mixed logging and UI-only WebSocket signals in the legacy path

Owns:
- Durable `RuntimeEventModel` persistence (append-only event log)
- Redis pub/sub fanout on `runtime:{run_id}` channels for live UI updates
- Structured event types: `run_started`, `step_started`, `step_completed`, `step_failed`, `run_interrupted`, `approval_requested`, `run_resumed`, `child_run_spawned`, `artifact_emitted`, `handoff_applied`, `fanout_started`, `join_completed`, `merge_applied`, `run_completed`, `run_failed`, `run_cancelled`

**File:** `backend/openforge/runtime/stream_events.py`

Owns:
- Redis-to-WebSocket relay bridge (`start_agent_relay()`)
- Subscribes to `agent:*` and `runtime:*` channels, forwards to workspace WebSocket connections

### Run persistence

**Models:** `RunModel`, `RunStepModel`, `CheckpointModel`, `RuntimeEventModel`

From:
- Implicit or chat-scoped execution state (conversations, messages, agent executions)

Owns:
- Inspectable run history with input/output payloads
- Parent/root run lineage for composite workflows
- Per-step state snapshots (input_snapshot, output_snapshot)
- Composite metadata (delegation_mode, merge_strategy, join_group_id, branch_key, branch_index)
- Replayable operational context via checkpoints and events

### Input preparation

**File:** `backend/openforge/runtime/input_preparation.py`

From:
- Inline context assembly in `execution_engine.py` and `context_assembler.py`

Owns:
- Trust-annotated context block construction (`PreparedInputBlock`, `TrustBoundary`)
- LLM message assembly with system instructions and context blocks
- Trust metadata tracking (source type, trust level, transformation path)
- Untrusted content wrapping via trust boundaries

Node executors consume prepared state from the workflow state dictionary. Input mapping from workflow state schema to node inputs is defined per-node in `WorkflowNode.input_mapping`.

### Tool loading

From:
- Direct tool dispatch calls in `execution_engine.py` via `tool_dispatcher`

To:
- `backend/openforge/runtime/node_executors/tool.py`

Owns:
- Tool resolution and dispatch through the tool node executor
- Tool call result integration into workflow state
- Also registered for `transform` node type

### Policy and approval hooks

From:
- Inline trust checks and special-case interrupt handling in `execution_engine.py`

To:
- `backend/openforge/runtime/node_executors/approval.py` -- approval request creation, interrupt signaling
- `backend/openforge/runtime/coordinator.py` -- interrupt handling, resume routing based on approval status
- Existing `approval_service` -- durable approval request persistence
- `PolicyEngine` -- policy evaluation before execution decisions

Owns:
- Durable approval requests with explicit interrupt state
- Resume routing through `approved`/`denied` edge types
- Approval status checking on run resume

### Artifact emission

From:
- Side-effecting output writes in execution code

To:
- `backend/openforge/runtime/node_executors/artifact.py`
- Phase 8 artifact service

Owns:
- Durable artifact creation through the shared artifact service
- Artifact ID tracking in `NodeExecutionResult.emitted_artifact_ids`
- `artifact_emitted` event emission for UI visibility
- Artifact lineage into runs and workflows

### Lifecycle management

**File:** `backend/openforge/runtime/lifecycle.py`

From:
- Ad hoc status updates scattered through `execution_engine.py`

Owns:
- `transition_run()` -- run status transitions with timestamp management (`started_at`, `completed_at`, `cancelled_at`)
- `start_step()` -- step activation with `running` status and timestamp
- `finish_step()` -- step completion with status, error code, error message, and timestamp
- `now_utc()` -- canonical UTC timestamp generation

### LangGraph adapter

**File:** `backend/openforge/runtime/langgraph_adapter.py`

From:
- Inline orchestration assumptions in the legacy execution path

Owns:
- `compile_workflow_graph()` -- compiles a workflow version into a `CompiledWorkflowGraph`
- `CompiledWorkflowGraph` -- node map, edge-by-source index, entry node, edge traversal via `next_node_id()`
- Runtime backend detection (LangGraph present vs. local fallback)
- Edge priority sorting during compilation
- Boundary layer isolating OpenForge product model from LangGraph internals

## Guardrail

`execution_engine.py` remains transitional during Phase 9. It continues to serve legacy chat flow needs but must not absorb new graph-runtime features. Any new orchestration capability -- routing, fan-out, delegation, approval, artifact emission, or composition -- must be implemented through the Phase 9 runtime boundary (coordinator, node executors, event publisher) instead.
