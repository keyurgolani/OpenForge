# Runtime Orchestration Rules

## Purpose

These rules keep workflow orchestration aligned with the Phase 9 architecture instead of drifting back into implicit execution paths.

## Rules

1. Every workflow execution must create a durable `Run`.
2. Every executed node must create a durable `RunStep`.
3. Execution state changes must be recoverable from persisted run state, checkpoints, and runtime events.
4. New workflow behavior must be implemented through coordinator logic, executor logic, or explicit runtime services, not through ad hoc branches in `execution_engine.py`.
5. Approval and interrupt behavior must persist durable state before control returns to the user.
6. Artifact emission must go through the shared artifact service and be reflected in runtime state and events.
7. Child workflow execution must preserve `parent_run_id`, `root_run_id`, and `spawned_by_step_id`.
8. New node types must register through the executor registry and declare explicit transition behavior.
9. Retries, cancellations, and resumes must update durable lifecycle state instead of relying on transient in-memory flags.
10. Workflow inspection APIs and UI should read from durable runtime tables, not reconstruct state heuristically from logs.

## Anti-patterns

- adding workflow-specific branching keyed off profile IDs or agent IDs
- emitting meaningful run behavior only through websocket messages
- storing resumable execution state only in frontend memory
- bypassing run-step creation for “simple” nodes
- writing new orchestration logic only in chat execution paths
