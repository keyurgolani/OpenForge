# Phase 13 Run Replay and Compare

## What Replay Means

Replay is the ability to re-execute a workflow using the captured inputs, state, and references from a prior run. The goal is to reproduce or compare results: did the same workflow with the same inputs produce the same output, and if not, what changed?

Replay is not "rewind and watch." It is a real execution through the same `RuntimeCoordinator`, node executors, and checkpoint infrastructure that production runs use. The replay produces a new `RunModel` with its own steps, checkpoints, events, and artifacts. The new run is then compared against the original.

## Why Replay Exists

Without replay, answering "would this workflow still produce the same result?" requires manually reconstructing the original input, guessing which prompt versions were active, hoping the evidence base has not changed, and running the workflow by hand. This is error-prone and unrepeatable.

Replay enables:

- **Regression detection**: After modifying a prompt, policy, or workflow graph, replay the original inputs to see if the output changed
- **Failure reproduction**: When a run fails, replay it to reproduce the failure in an inspectable environment
- **Quality comparison**: Replay the same input with a different workflow version, model, or prompt to compare output quality
- **Audit**: Demonstrate that a given input would produce the same output if the run were repeated

## What Inputs, State, and Evidence Are Captured

A replay snapshot captures everything needed to reproduce the execution context of the original run. The snapshot is assembled from the original run's metadata and the domain objects that were active at the time of execution.

### Captured references

| Field | Source | Purpose |
|-------|--------|---------|
| `workflow_version_id` | `RunModel.workflow_version_id` | The exact compiled graph that was executed |
| `input_payload` | `RunModel.input_payload` | The input state that entered the workflow |
| `prompt_snapshot_refs` | Prompt versions active at run time | The exact prompt templates used for LLM nodes |
| `evidence_snapshot_refs` | `EvidencePacketModel` records linked to the run | The retrieval results that informed LLM context |
| `policy_snapshot_refs` | Policy versions active at run time | The policy rules that governed approval and tool access |
| `expected_artifacts` | `ArtifactModel` records produced by the original run | The output artifacts to compare against |

### Why each reference matters

**`workflow_version_id`**: Workflows are versioned. If the workflow graph has been modified since the original run, replaying against the current active version would test a different graph. The snapshot locks the version.

**`input_payload`**: The input state is the starting condition for the entire execution. Without capturing it, replay would need to guess or reconstruct what triggered the run.

**`prompt_snapshot_refs`**: LLM nodes render prompts from templates. If a prompt template has been edited since the original run, replaying with the new template tests a different prompt, not the original behavior. The snapshot captures which prompt versions were in use.

**`evidence_snapshot_refs`**: Retrieval nodes assemble evidence from the knowledge base. The knowledge base changes over time as documents are added, removed, or re-chunked. The snapshot captures the evidence packets that were actually assembled during the original run, enabling replay to either re-retrieve (testing current evidence) or inject the original evidence (testing prompt behavior in isolation).

**`policy_snapshot_refs`**: Policy rules determine what actions are permitted and what requires approval. Replaying with different policy rules tests a different permission model. The snapshot captures the active policy versions for faithful reproduction.

**`expected_artifacts`**: The original run's output artifacts serve as the comparison baseline. Replay produces new artifacts which are compared against these expected outputs.

## Deterministic vs. Non-Deterministic Components

### Deterministic

The following components produce the same behavior given the same inputs:

- **State machine transitions**: The workflow graph's edge routing is deterministic. Given a node execution result with a specific `next_edge_type`, the compiled graph always resolves to the same next node.
- **Input mapping and output mapping**: State transformations defined by node input/output mappings are pure functions of the state dictionary.
- **Policy evaluation**: Given the same policy rules and the same requested action, the `PolicyEngine` produces the same verdict (permit, deny, require approval).
- **Checkpoint persistence**: Given the same state, the checkpoint store writes the same content.
- **Merge and reduce strategies**: Given the same branch results and the same merge strategy, join and reduce nodes produce the same aggregated output.

### Non-deterministic

The following components may produce different results across replays:

- **LLM outputs**: Language model responses vary across invocations even with identical prompts and temperature=0. This is the primary source of non-determinism in the platform.
- **Tool outputs**: Tools that call external services (web search, API calls, database queries) return results that depend on external state at invocation time.
- **Retrieval results**: If replay re-retrieves from the knowledge base rather than injecting snapshotted evidence, results may differ because the knowledge base has changed.
- **Timing-dependent behavior**: Timeouts, rate limits, and approval wait times are timing-dependent and will differ across replays.

### Implications for replay

Because LLM outputs are non-deterministic, replay cannot guarantee identical output. Replay guarantees that the same workflow graph is traversed with the same starting state and the same execution mechanism. The comparison then measures what changed in the non-deterministic components and whether those changes affected the outcome.

This is a feature, not a limitation. If replay produced identical output every time, it would be useless for quality evaluation. The value of replay is in measuring how output varies when inputs are held constant.

## Replay Snapshot Schema

The replay snapshot is the durable record that captures everything needed to initiate a replay. It is created from an original run and stored as a reference-based structure, not a full copy of all domain objects.

```
ReplaySnapshot:
  id:                       UUID
  original_run_id:          UUID        # the run being replayed
  workspace_id:             UUID        # workspace scope
  workflow_version_id:      UUID        # exact graph version
  input_payload:            JSONB       # copied from original run
  prompt_snapshot_refs:     JSONB       # list of {prompt_id, version_id} active at run time
  evidence_snapshot_refs:   JSONB       # list of {evidence_packet_id} linked to original run
  policy_snapshot_refs:     JSONB       # list of {policy_id, version_id} active at run time
  expected_artifacts:       JSONB       # list of {artifact_id, version_id, artifact_type, title}
  snapshot_metadata:        JSONB       # additional context (mission_id, trigger_id, original timestamps)
  created_at:               timestamp
```

### How the snapshot is assembled

1. Read the original `RunModel` to extract `workflow_version_id`, `input_payload`, `mission_id`, and `trigger_id`
2. Query the prompt versions that were active in the workspace at the original run's `started_at` timestamp for each prompt referenced by the workflow's LLM nodes
3. Query `EvidencePacketModel` records where `run_id` matches the original run
4. Query the policy versions that were active in the workspace at the original run's `started_at` timestamp
5. Query `ArtifactModel` records where `source_run_id` matches the original run
6. Assemble the snapshot record with all references

The snapshot stores references (IDs and version IDs), not deep copies. The referenced objects are immutable (workflow versions are never mutated, artifact versions are append-only, prompt versions are immutable once created). This means the snapshot remains valid as long as the referenced records exist.

## How Replay Differs from Benchmarking

Replay and benchmarking both execute workflows through the real runtime. They differ in intent, input source, and comparison method.

### Replay

- **Intent**: Reproduce a specific historical run to compare or debug
- **Input source**: Captured from a single prior run via `ReplaySnapshot`
- **Comparison baseline**: The original run's artifacts and metrics
- **Scope**: One run at a time
- **Question answered**: "Does this workflow still produce the same result for this specific input?"

### Benchmarking

- **Intent**: Measure quality across a representative set of scenarios
- **Input source**: A curated benchmark suite with synthetic or sampled inputs
- **Comparison baseline**: Quality criteria defined in the benchmark suite (not necessarily from prior runs)
- **Scope**: Many inputs evaluated in batch
- **Question answered**: "How well does this workflow perform across a range of cases?"

A benchmark suite may include replay snapshots as individual cases, but benchmarking is not a special case of replay. Benchmarking evaluates against quality criteria; replay evaluates against a specific historical outcome.

## Run Comparison Dimensions

When a replay run completes, it is compared against the original run across the following dimensions. Each dimension answers a specific question about what changed.

### Steps taken

- **Original**: Ordered list of `RunStepModel` records with node keys and step indices
- **Replay**: Ordered list of `RunStepModel` records from the replay run
- **Comparison**: Did the replay follow the same path through the graph? If the step sequences differ, the workflow took a different branch, which indicates that a non-deterministic node (LLM, tool) produced a different routing decision.

### Branches used

- **Original**: For composite workflows, the set of child runs with `branch_key` and `branch_index`
- **Replay**: The set of child runs from the replay
- **Comparison**: Were the same branches spawned? Did the same branches complete or fail? Branch differences indicate that fan-out or delegation decisions changed.

### Artifacts emitted

- **Original**: Artifacts from `expected_artifacts` in the replay snapshot
- **Replay**: Artifacts produced by the replay run
- **Comparison**: Same count? Same types? Content similarity? Artifact comparison is the primary quality signal. If the replay produces artifacts with the same structure and similar content, the workflow behavior is stable. If artifacts differ significantly, the non-deterministic components produced meaningfully different results.

### Failure points

- **Original**: Steps with `error_code` set, or the run's terminal `error_code`
- **Replay**: Steps or run with failure codes from the replay
- **Comparison**: Did the replay fail at the same step with the same error code? Did it fail at a different step? Did it succeed where the original failed (or vice versa)? Failure point comparison is the primary debugging signal for replay-for-reproduction scenarios.

### Costs and tokens

- **Original**: Aggregated `openforge.llm.total_tokens` and `openforge.llm.cost_usd` from the original run's telemetry
- **Replay**: Same metrics from the replay run
- **Comparison**: Did the replay consume more or fewer tokens? Cost comparison across replays detects prompt regressions (a prompt change that causes the model to produce longer outputs) and model-level cost changes.

### Output-contract conformity

- **Original**: Whether the original run's output matched the workflow's output schema
- **Replay**: Whether the replay run's output matches the same schema
- **Comparison**: Both runs should conform to the output contract defined by the workflow version. If either deviates, the output mapping or the LLM output format is unstable. This dimension measures structural correctness independently of content quality.

## Replay Execution Path

A replay execution follows this sequence:

1. **Load snapshot**: Retrieve the `ReplaySnapshot` for the specified original run
2. **Resolve references**: Verify that the `workflow_version_id`, prompt snapshot refs, and policy snapshot refs still exist in the database
3. **Create replay run**: Call `RuntimeCoordinator.execute_workflow()` with the snapshot's `workflow_version_id` and `input_payload`. Tag the new run with metadata indicating it is a replay: `run_type = "replay"`, original `run_id` in `composite_metadata`
4. **Execute**: The workflow executes through the standard runtime path. LLM nodes use current model endpoints (outputs will vary). Retrieval nodes can either re-retrieve from the current knowledge base or inject snapshotted evidence packets, depending on the replay mode.
5. **Collect results**: On completion, gather the replay run's steps, artifacts, metrics, and any failure codes
6. **Compare**: Evaluate the replay run against the original across all comparison dimensions
7. **Store comparison**: Persist the comparison result as an evaluation record linked to both the original and replay run IDs

### Replay modes

**Full replay**: Re-execute everything, including retrieval and tool calls. This tests the entire pipeline with current external state.

**Evidence-pinned replay**: Inject the snapshotted evidence packets instead of re-retrieving. This isolates the prompt and model behavior from knowledge base changes.

**Dry-run replay**: Walk the graph and resolve mappings without invoking LLM or tool executors. This validates that the workflow structure and state flow are correct without incurring execution cost.

## Anti-Goals

### No replay outside the real execution path

Replay must execute through `RuntimeCoordinator`, not through a separate "replay engine" that simulates execution. If replay bypasses the production execution path, it cannot detect failures that only manifest in the real coordinator, checkpoint store, or event publisher.

### No mutation of original run records

Replaying a run must not modify the original `RunModel`, `RunStepModel`, `CheckpointModel`, or `RuntimeEventModel` records. The replay produces its own run with its own records. The original remains an immutable historical record.

### No implicit snapshot assembly

Replay snapshots must be explicitly created and stored. There must be no execution path where a replay is initiated by ad hoc reconstruction of inputs from log files or partial database queries. If the snapshot does not exist, the replay cannot proceed.

### No comparison without structured dimensions

Replay comparison must produce structured results across the defined dimensions (steps, branches, artifacts, failures, costs, output conformity). A comparison that produces only a boolean "same/different" or a free-text summary does not satisfy the requirement. Each dimension must be independently queryable and aggregable.
