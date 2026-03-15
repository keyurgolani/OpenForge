# Phase 9 Workflow Runtime

## Purpose

Phase 9 replaces the old monolithic execution path with a durable workflow runtime built around explicit workflow graph versions, persisted run state, and modular node executors.

The runtime is designed to answer, for any run:

- what workflow and version executed
- which node ran at each step
- what state entered and exited each step
- where execution paused, resumed, failed, or was cancelled
- what artifacts, approvals, and child runs were produced

## Why the monolith is being replaced

The legacy execution engine was chat-oriented and convenient for synchronous flows, but it hid orchestration state inside a broad runtime path that was difficult to inspect, resume, and extend safely.

Phase 9 moves orchestration responsibilities into explicit runtime components so new workflow behavior does not accumulate inside a single opaque execution module.

## Core runtime objects

### WorkflowDefinition

The stable identity of a workflow within a workspace. It owns metadata, status, and the pointer to the active executable version.

### WorkflowVersion

An immutable executable graph snapshot. Each version stores the entry node, state schema, input/output schema defaults, and the exact node and edge set used for execution.

### WorkflowNode

A durable graph node with an explicit type, executor reference, config, input mapping, and output mapping.

### WorkflowEdge

A durable directed transition with edge type, condition payload, priority, and active status.

### Run

The durable execution record for a workflow or child workflow invocation. A run stores current workflow version, current node, root lineage, snapshots, and lifecycle timestamps.

### RunStep

The inspectable unit of execution within a run. Each step captures the node, order, state entering and leaving the step, and terminal outcome.

### Checkpoint

A persisted state snapshot before or after a step boundary. Checkpoints make resume, debugging, and future retry behavior explicit.

### RuntimeEvent

An append-only event record used for inspection, streaming, and UI hydration.

## Responsibility split

### LangGraph

LangGraph is the orchestration backend boundary. In Phase 9 it is integrated behind a compile/adapter layer so OpenForge owns the product model while still gaining durable graph execution semantics when the dependency is present.

LangGraph is responsible for:

- graph orchestration semantics
- future durable graph compilation
- interrupt/resume primitives
- eventual subgraph composition

### OpenForge runtime code

OpenForge remains responsible for:

- workflow, version, node, and edge persistence
- run and run-step persistence
- checkpoint storage
- event persistence and streaming
- node executor registration
- approval, policy, and artifact integration
- child-run lineage
- API and UI inspection surfaces

## Runtime flow

1. A workflow version is compiled through the adapter boundary.
2. The coordinator creates a durable run record.
3. Each node execution creates a durable run step.
4. The coordinator stores before/after checkpoints.
5. The executor returns state updates, interrupts, artifacts, or child-run information.
6. The coordinator persists runtime events and advances to the next node.
7. Terminal completion writes final output state to the run.

## Integration points

### Policies and approvals

Approval nodes interrupt execution through durable run state. Approval requests are first-class records owned by the trust layer, and resume decisions route the workflow through explicit edge types such as `approved` or `denied`.

### Artifacts

Artifact nodes emit durable Phase 8 artifacts through the shared artifact service. Runtime state stores the emitted artifact IDs, and runtime events surface that output to the UI.

### Retrieval and input preparation

Retrieval and preparation logic remain separate from orchestration. The runtime consumes prepared state and services rather than inlining retrieval behavior inside graph execution.

## Anti-goals

- No new orchestration business logic should be added to `execution_engine.py`.
- No new hidden workflow execution paths should bypass run and step persistence.
- No workflow behavior should depend on ad hoc hardcoded agent IDs.
- No approval or interrupt behavior should live only in frontend state or side-channel events.
