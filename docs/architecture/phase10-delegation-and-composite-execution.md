# Phase 10 Delegation And Composite Execution

Phase 10 turns delegation into an explicit runtime concept instead of a hidden subagent side path.

Supported modes:

- `call`
- `handoff`
- `subworkflow`
- `fanout`
- `join`
- `reduce`

Rules:

- every child execution must have durable run lineage
- parent-child state transfer must be explicit
- output merge must use named strategies
- fan-out must remain runtime-tracked and join-aware
- no new composite behavior belongs in `execution_engine.py`
