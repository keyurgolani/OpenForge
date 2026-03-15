# Phase 10 Composite Workflows Design

## Goal

Implement the full Phase 10 plan by extending the Phase 9 workflow runtime into a first-class composite orchestration system with explicit delegation semantics, child-run lineage, fan-out and reduction patterns, template support, and inspectable UI and API surfaces.

## Scope Decision

This design follows `sdlc/Phase10Plan.md` literally. Where an implementation question is not fully specified, the implementation should prefer the existing Phase 9 runtime boundary and extend it in place instead of creating a parallel composite subsystem.

## Architectural Direction

Phase 10 builds directly on the Phase 9 runtime:

- `backend/openforge/runtime/` remains the canonical orchestration boundary.
- `backend/openforge/domains/workflows/` remains the canonical definition and template boundary.
- `backend/openforge/domains/runs/` remains the canonical inspection boundary.
- `backend/openforge/domains/artifacts/` and `backend/openforge/domains/retrieval/` remain the canonical durable output and evidence boundaries.

No new orchestration behavior should be added to `execution_engine.py`. The existing legacy delegation endpoint must either become a compatibility wrapper over the canonical runtime or be reduced to a non-canonical bridge.

## Delegation Taxonomy

Phase 10 uses a runtime-native delegation taxonomy:

- `call`: the parent delegates bounded work to a child run and resumes after merge.
- `handoff`: active control transfers to a target profile or workflow path with explicit lineage and reason metadata.
- `subworkflow`: a child workflow run with durable lineage and explicit state mapping.
- `fanout`: one parent step launches multiple child runs as tracked branches.
- `join`: the runtime waits for branch completion and normalizes branch state into a single merge point.
- `reduce`: the runtime aggregates normalized branch outputs into parent state through a configured reducer strategy.

These modes are explicit runtime concepts. They must not be implied by profile names, hidden tool calls, or special-case ids.

## Workflow Model Changes

The workflow model remains versioned and durable. Phase 10 extends it with:

- new node types: `delegate_call`, `handoff`, `fanout`, `reduce`
- richer node configuration for target references, mapping rules, concurrency, failure policy, reducer strategy, and join grouping
- workflow template metadata that describes composite pattern semantics and intended use

The graph remains expressed through nodes and edges. Composite behavior must be representable in the workflow definition, not reconstructed from ad hoc runtime branches.

## State Transfer and Merge

State transfer is explicit and schema-aware.

Parent-to-child rules:

- a node selects the subset of parent state to send
- the runtime can reshape input through mapping rules
- the mapped child payload is validated against the target input schema before launch

Child-to-parent rules:

- a child output is merged through explicit mapping rules
- merge strategies support direct assignment, append, artifact-reference aggregation, evidence aggregation, and reducer functions
- merge failures become durable runtime state, not silent best-effort behavior

Approvals, artifacts, and evidence references propagate through explicit state and lineage links rather than opaque nested metadata.

## Runtime Deepening

The Phase 9 run and step model is extended rather than replaced.

Runs must track:

- `delegation_mode`
- `merge_strategy`
- `join_group_id`
- `branch_key`
- `branch_index`
- `handoff_reason`
- `composite_metadata`

Run steps must track:

- the composite operation initiated by the step
- branch grouping and branch result status
- merge outcome metadata
- retry and partial-failure behavior per branch where applicable

Runtime events must expose:

- child run spawn and completion
- fan-out start and branch status
- join waiting and join completion
- merge application and merge failure
- handoff activation
- composite debug facts needed by APIs and UI

## Failure and Retry Semantics

Composite nodes must define explicit failure policy. The runtime supports:

- fail parent immediately
- ignore failure and continue
- collect failure into join or reduce state
- retry failed child branch
- pause for operator intervention

Join and reduce behavior must remain inspectable under mixed branch states:

- success
- failure
- cancelled
- interrupted
- waiting approval

## Pattern Library

Phase 10 introduces a durable composite pattern catalog and starter templates. At minimum:

- supervisor routing
- plan -> execute -> review
- map -> reduce research
- fan-out -> summarize -> verify
- reviewer council -> reduce
- retrieve -> synthesize -> validate

At least three templates must be encoded as real workflow records, and one meaningful pattern must run end-to-end through the runtime.

## API Surfaces

Workflow APIs must support:

- composite node creation and update
- template listing and retrieval
- template cloning into workspace workflows
- template metadata inspection

Run APIs must support:

- full parent-child tree retrieval
- delegation history retrieval
- branch and join-group inspection
- merge outcome inspection
- composite debug views for operator and development use

## UI Surfaces

Workflow detail UI must explain composite structure:

- delegation node types
- target workflow or profile refs
- fan-out and join relationships
- merge and reduction strategies
- template and pattern badges

Run detail UI must explain composite execution:

- delegation timeline
- child runs grouped by origin step
- fan-out branches and branch states
- join and reduce outcomes
- handoff transitions
- partial-failure and waiting-approval visibility

## Artifact and Evidence Flow

Composite execution must not produce disconnected durable outputs.

- child outputs may remain child-local, produce child artifacts, or contribute references back to the parent
- reducers may synthesize final artifacts from child state and child artifact references
- evidence aggregation must remain explicit and traceable
- final artifact lineage must survive through delegated branches where relevant

## Migration Strategy

Phase 10 extends the Phase 9 schema in place with a new migration. The migration must:

- extend workflow definition metadata for composite templates
- extend runs and run steps with composite execution fields
- preserve existing Phase 9 data by backfilling default values

Breaking changes are acceptable where required for plan fidelity.

## Proof Pattern

The first end-to-end proof pattern should be `map-reduce-research` because it exercises:

- fan-out branch creation
- branch lineage
- join waiting
- reduce aggregation
- partial failure handling
- final artifact output

## Guardrails

Contributor rules must state:

- no new hidden child execution through generic tool calls
- no output merge without explicit mapping or reducer strategy
- no fan-out without tracked join semantics and lineage
- no composite execution logic in `execution_engine.py`

## Implementation Note

The user requested one final commit only. This design document and the implementation plan should be included in that final commit rather than committed separately.
