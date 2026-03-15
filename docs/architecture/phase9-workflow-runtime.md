# Phase 9 Workflow Runtime

## Purpose

Phase 9 replaces the monolithic execution engine with a durable, graph-based workflow runtime. The runtime is built around explicit workflow graph versions, persisted run state, modular node executors, and structured event emission.

For any run, the runtime can answer:

- What workflow definition and version executed
- Which node ran at each step, and in what order
- What state entered and exited each step (via checkpoints)
- Where execution paused, resumed, failed, or was cancelled
- What artifacts, approvals, child runs, and events were produced

## Why the monolith is being replaced

The legacy `execution_engine.py` was designed around synchronous chat interactions. It accumulated orchestration, tool dispatch, approval handling, and output generation into a single broad execution path. This made it difficult to:

- Inspect or replay what happened during a run
- Resume execution after interrupts (approvals, failures) without ad hoc state reconstruction
- Add new workflow patterns (routing, fan-out, delegation) without growing the monolith
- Test orchestration behavior independently from LLM and tool side effects

Phase 9 moves orchestration into explicit, composable runtime components so new workflow behavior does not accumulate inside a single opaque module.

## Core runtime objects

### WorkflowDefinition

The stable identity of a workflow within a workspace. Owns metadata, status, and the pointer to the active executable version.

### WorkflowVersion

An immutable executable graph snapshot. Each version stores the entry node, state schema, input/output schema defaults, and the exact node and edge set used for execution. Versions are never mutated after creation.

### WorkflowNode

A durable graph node with an explicit type, executor reference, config, input mapping, and output mapping. Node types include: `llm`, `tool`, `router`, `approval`, `artifact`, `subworkflow`, `delegate_call`, `handoff`, `fanout`, `join`, `reduce`, `transform`, and `terminal`.

### WorkflowEdge

A durable directed transition with edge type (e.g. `success`, `approved`, `denied`), condition payload, priority, and active status. Edges are sorted by priority during graph compilation.

### Run (RunModel)

The durable execution record for a workflow invocation. Stores the current workflow version, current node, root/parent run lineage, state snapshot, input/output payloads, lifecycle timestamps, and composite metadata (delegation mode, merge strategy, branch info).

### RunStep (RunStepModel)

The inspectable unit of execution within a run. Each step captures the node, step index, input/output state snapshots, checkpoint references, and terminal outcome.

### Checkpoint (CheckpointModel)

A persisted state snapshot at a step boundary. The coordinator writes `before_step` and `after_step` checkpoints around every node execution, enabling resume, debugging, and future retry/replay.

### RuntimeEvent (RuntimeEventModel)

An append-only event record persisted to the database and relayed via Redis pub/sub to WebSocket clients. Event types include: `run_started`, `step_started`, `step_completed`, `step_failed`, `run_interrupted`, `approval_requested`, `run_resumed`, `child_run_spawned`, `artifact_emitted`, `handoff_applied`, `fanout_started`, `join_completed`, `merge_applied`, `run_completed`, `run_failed`, `run_cancelled`.

## Responsibility split

### LangGraph

LangGraph is the orchestration backend boundary. It is integrated behind the `langgraph_adapter.py` compile/adapter layer so OpenForge owns the product model while still gaining durable graph execution semantics when the dependency is present. When LangGraph is not installed, the adapter falls back to a local graph walker.

LangGraph is responsible for:

- Graph orchestration semantics (node dispatch, edge traversal)
- State transitions within the graph execution model
- Interrupt/resume primitives for durable execution
- Composable workflow and subgraph composition

### OpenForge runtime code

OpenForge remains responsible for all product-visible behavior:

- Workflow, version, node, and edge persistence (domain models)
- Run and run-step persistence (`RunModel`, `RunStepModel`)
- Checkpoint storage (`checkpoint_store.py`)
- Event persistence and streaming (`event_publisher.py`, `stream_events.py`)
- Node executor registration and dispatch (`node_executors/registry.py`)
- Approval creation, interrupt state, and resume routing (`approval` executor, `approval_service`)
- Policy evaluation before execution decisions (`PolicyEngine`)
- Artifact emission through the Phase 8 artifact service (`artifact` executor)
- Child-run lineage and composite metadata (parent/root run tracking)
- Lifecycle management: status transitions, timestamps (`lifecycle.py`)
- API and UI inspection surfaces (run list, step list, event stream)
- Redis-to-WebSocket relay for live UI updates (`stream_events.py`)

## Execution flow

The concrete execution path through the runtime:

1. **WorkflowDefinition** is resolved to its active **WorkflowVersion** via `workflow_service.get_runtime_workflow()`.
2. **`compile_workflow_graph()`** in `langgraph_adapter.py` compiles the version's nodes and edges into a `CompiledWorkflowGraph` with a node map, edge-by-source index, and entry node pointer.
3. **`RuntimeCoordinator.execute_workflow()`** creates a durable `RunModel` record, emits a `run_started` event, and calls `_continue_run()`.
4. **`RuntimeCoordinator._continue_run()`** walks the compiled graph starting from the entry node (or current node on resume):
   - Creates a `RunStepModel` for the current node
   - Writes a `before_step` checkpoint via `CheckpointStore`
   - Emits a `step_started` event via `EventPublisher`
   - Resolves and invokes the registered **node executor** for the node type
   - Writes an `after_step` checkpoint with the resulting state
   - Handles interrupts (approval requests), failures, artifacts, child-run spawns
   - Emits `step_completed` (and type-specific events like `artifact_emitted`, `child_run_spawned`)
   - Resolves the next node via `graph.next_node_id()` using the executor's `next_edge_type`
   - Repeats until terminal node, interrupt, failure, or no outgoing edge
5. **Node executors** return `NodeExecutionResult` with updated state, edge routing, interrupt flags, artifact IDs, and spawned run IDs.
6. On completion, the coordinator writes `output_payload` to the run and emits `run_completed`.

## Integration points

### State and checkpoints

Workflow state is a dictionary that flows through the graph. Each step receives the current state as `input_snapshot` and produces updated state as `output_snapshot`. Checkpoints persist the full state at every step boundary, making the entire execution history inspectable and resumable.

### Events and UI

Every lifecycle transition and step outcome emits a structured `RuntimeEvent` that is both persisted to the database and published to a Redis channel (`runtime:{run_id}`). The `stream_events.py` relay bridges Redis pub/sub to workspace WebSocket channels for live UI hydration.

### Artifacts

Artifact nodes invoke the Phase 8 artifact service to create durable output records. Emitted artifact IDs are tracked in `NodeExecutionResult.emitted_artifact_ids` and surfaced via `artifact_emitted` events.

### Policies and approvals

Approval nodes interrupt execution by setting `interrupt=True` and `interrupt_status="waiting_approval"` on the result. The coordinator transitions the run to `waiting_approval`, persists the approval request ID in state, and emits `approval_requested`. On resume, the coordinator checks approval status and routes through the appropriate edge (`approved`/`denied`).

Policy evaluation hooks integrate with the `PolicyEngine` before execution decisions, enforced through approval and policy-aware executors.

### Retrieval and input preparation

Retrieval and input preparation logic (`input_preparation.py`) remain separate from orchestration. The runtime consumes prepared state and trust-annotated context blocks rather than inlining retrieval behavior inside graph execution. Node executors receive state that has already been prepared by upstream nodes or the workflow input.

### Child runs and composition

Subworkflow, delegate_call, fanout, and handoff executors can spawn child runs via the coordinator. Child runs track `parent_run_id`, `root_run_id`, and `spawned_by_step_id` for full lineage. Join and reduce nodes aggregate results from child branches.

## Anti-goals

- No new orchestration business logic should be added to `execution_engine.py`. It remains transitional for legacy chat flow only.
- No hidden execution paths should bypass run and step persistence. Every workflow execution must produce durable `RunModel` and `RunStepModel` records.
- No workflow execution should occur without checkpoint persistence at step boundaries.
- No workflow behavior should depend on ad hoc hardcoded agent IDs.
- No approval or interrupt behavior should live only in frontend state or side-channel events -- all must be durable and inspectable through the runtime event log.
