# Phase 13 Observability and Evaluation

## Why Observability Is a Separate Architecture Concern

Phases 9 through 12 built the workflow runtime, composite execution, missions, and the curated catalog. Each phase produced durable domain records (runs, steps, checkpoints, events, artifacts, trigger fire history, approval requests). But durable records alone do not constitute observability. Observability requires that those records are correlated, measurable, and surfaced in ways that let operators answer action-oriented questions about the platform's behavior.

Without an explicit observability architecture:

- Cost data accumulates in isolated logs without connecting to the run, step, or mission that incurred it
- Latency is measured ad hoc per service call rather than traced across the full execution path
- Operators cannot answer "why did this mission's cost spike last Tuesday" without manually joining tables
- Evaluation (repeatable quality measurement) is conflated with runtime telemetry (live operational signals)

This document defines the telemetry object hierarchy, naming conventions, metric levels, and evaluation boundaries for Phase 13.

## What Needs to Be Traced

Every product-visible execution boundary produces telemetry. The following are the traceable operations and why each matters:

### Runtime coordinator execution

The `RuntimeCoordinator.execute_workflow()` call is the root span for any workflow run. It establishes the run identity, walks the compiled graph, and produces the terminal outcome. Tracing this boundary answers: how long did the run take, what was its status, and what resources did it consume.

### Node executor dispatch

Each node executor invocation within a run is a child span. It captures the node type, executor used, input/output sizes, and edge routing decision. Tracing this boundary answers: which step was slow, which step failed, and what decision path was taken.

### Child-run spawn and join

Composite workflows (Phase 10) spawn child runs via delegation, fan-out, and subworkflow patterns. Each child-run spawn is a traceable event linking parent step to child run. Join and reduce operations are traceable events that record which branches completed, which failed, and what merge strategy was applied. Tracing this boundary answers: how did fan-out branches perform relative to each other, and where did the join block.

### Approval request creation and resolution

Approval nodes interrupt execution and create durable `ApprovalRequestModel` records. The time between creation and resolution is a measurable latency that is invisible to step-level timing alone. Tracing this boundary answers: how long are humans taking to respond to approval requests, and which approvals are timing out.

### Artifact emission

Artifact nodes produce durable output records via the Phase 8 artifact service. Each emission is a traceable event linking the run, step, and artifact identity. Tracing this boundary answers: what did this run produce, and how does output volume correlate with cost.

### Trigger firings

Every trigger firing (whether it creates a run or skips due to budget constraints) is a traceable event recorded in `TriggerFireHistoryModel`. Tracing this boundary answers: is the trigger firing on schedule, how often are firings skipped, and what budget constraints are blocking execution.

### Mission launches

The mission launch path -- from trigger firing through budget evaluation to run creation -- is a traceable sequence. Tracing this boundary answers: what fraction of trigger firings result in actual runs, and where in the launch path are requests being rejected.

## Telemetry Object Hierarchy

Telemetry signals are organized in a hierarchy that mirrors the domain model. Every signal is attributable to a position in this hierarchy, enabling drill-down from mission health to individual step metrics.

```
Mission
  │
  ├── TriggerFiring
  │     └── (skip reason OR run_id)
  │
  └── Run
        │
        ├── RunStep
        │     ├── LLM invocation spans
        │     ├── Tool invocation spans
        │     ├── Checkpoint writes
        │     └── Policy evaluation spans
        │
        ├── ChildRun (recursive Run structure)
        │     └── RunStep ...
        │
        ├── Artifact (emitted by artifact steps)
        │
        ├── ApprovalRequest (created by approval steps)
        │
        └── EvidencePacket (assembled by retrieval steps)
```

Every telemetry record carries the identifiers needed to locate it in this hierarchy:

- `mission_id` (nullable -- ad hoc runs have no mission)
- `trigger_id` (nullable -- manual runs have no trigger)
- `run_id` (always present for execution telemetry)
- `root_run_id` (for child runs, the top-level ancestor)
- `step_id` (nullable -- run-level events have no step)
- `workflow_id` and `workflow_version_id` (the definition and snapshot being executed)

These identifiers are propagated through span context, not reconstructed after the fact. The coordinator sets them at run creation and passes them through the executor dispatch path.

## Metrics by Level

### Run-level metrics

| Metric | What it measures | Why it matters |
|--------|-----------------|----------------|
| `openforge.run.duration_ms` | Wall-clock time from `started_at` to `completed_at` | Baseline for SLA evaluation and regression detection |
| `openforge.run.status` | Terminal status (completed, failed, cancelled) | Success rate computation |
| `openforge.run.total_tokens` | Sum of all LLM token usage across steps | Cost attribution and budget tracking |
| `openforge.run.total_cost_usd` | Computed cost from token counts and model pricing | Budget enforcement and billing |
| `openforge.run.step_count` | Number of steps executed | Complexity tracking and anomaly detection |
| `openforge.run.artifact_count` | Number of artifacts emitted | Output volume tracking |
| `openforge.run.error_code` | Failure classification from the failure taxonomy | Error pattern analysis |

### Step-level metrics

| Metric | What it measures | Why it matters |
|--------|-----------------|----------------|
| `openforge.step.duration_ms` | Wall-clock time for executor invocation | Identifies slow steps |
| `openforge.step.input_tokens` | Input token count for LLM steps | Cost attribution per step |
| `openforge.step.output_tokens` | Output token count for LLM steps | Cost attribution per step |
| `openforge.step.total_tokens` | Combined token count | Step-level budget tracking |
| `openforge.step.tool_calls` | Number of tool invocations within the step | Tool usage analysis |
| `openforge.step.tool_duration_ms` | Time spent in tool execution | Tool performance tracking |
| `openforge.step.retry_count` | Number of retries before success or failure | Reliability analysis |
| `openforge.step.checkpoint_write_ms` | Time to persist checkpoint | Storage performance |

### Workflow-level metrics (aggregated)

| Metric | What it measures | Why it matters |
|--------|-----------------|----------------|
| `openforge.workflow.success_rate` | Fraction of runs with status `completed` over a window | Workflow reliability |
| `openforge.workflow.avg_duration_ms` | Mean run duration over a window | Performance baseline |
| `openforge.workflow.avg_cost_usd` | Mean run cost over a window | Budget forecasting |
| `openforge.workflow.avg_step_count` | Mean steps per run | Complexity tracking |
| `openforge.workflow.p95_duration_ms` | 95th percentile run duration | Tail latency identification |

### Mission-level metrics (aggregated)

| Metric | What it measures | Why it matters |
|--------|-----------------|----------------|
| `openforge.mission.health_status` | Current health (healthy, degraded, failing, unknown) | Operator alerting |
| `openforge.mission.uptime_ratio` | Fraction of time the mission has been in `active` status | Availability tracking |
| `openforge.mission.budget_usage_ratio` | Consumed budget / allocated budget over window | Budget burn rate |
| `openforge.mission.trigger_fire_count` | Total trigger firings over a window | Automation activity |
| `openforge.mission.trigger_skip_count` | Firings that were skipped (budget, cooldown, concurrency) | Constraint pressure |
| `openforge.mission.run_count` | Runs created over a window | Throughput |
| `openforge.mission.failure_rate` | Fraction of runs with status `failed` over a window | Reliability |
| `openforge.mission.avg_approval_latency_ms` | Mean time from approval request creation to resolution | Human-in-the-loop responsiveness |

## Telemetry Naming Conventions

All telemetry names use the `openforge.` prefix and follow a hierarchical dot-separated convention:

### Span names

Spans represent durable operations with a start time, end time, and outcome:

- `openforge.run.execute` -- root span for a workflow run
- `openforge.step.execute` -- span for a single step execution
- `openforge.step.llm_call` -- span for an LLM provider call within a step
- `openforge.step.tool_call` -- span for a tool invocation within a step
- `openforge.step.checkpoint_write` -- span for checkpoint persistence
- `openforge.step.policy_eval` -- span for policy evaluation before a decision
- `openforge.approval.wait` -- span covering approval request lifetime (creation to resolution)
- `openforge.trigger.fire` -- span for trigger evaluation and run launch
- `openforge.mission.launch` -- span for the mission launch path (budget check through run creation)
- `openforge.composite.spawn` -- span for child-run spawn
- `openforge.composite.join` -- span for join/reduce aggregation

### Event names

Events are point-in-time signals emitted at boundaries:

- `openforge.run.started` -- run execution began
- `openforge.run.completed` -- run completed successfully
- `openforge.run.failed` -- run failed
- `openforge.run.cancelled` -- run was cancelled
- `openforge.step.started` -- step execution began
- `openforge.step.completed` -- step completed
- `openforge.step.failed` -- step failed
- `openforge.artifact.emitted` -- artifact was produced
- `openforge.approval.requested` -- approval request was created
- `openforge.approval.resolved` -- approval request was resolved
- `openforge.approval.timed_out` -- approval request expired
- `openforge.trigger.fired` -- trigger fired and created a run
- `openforge.trigger.skipped` -- trigger fired but was skipped (budget, cooldown, etc.)
- `openforge.child_run.spawned` -- child run was created by a composite step
- `openforge.child_run.joined` -- child run results were aggregated

### Metric names

Metrics follow the same hierarchy with a measurement suffix:

- `openforge.run.duration_ms`
- `openforge.step.duration_ms`
- `openforge.llm.input_tokens`
- `openforge.llm.output_tokens`
- `openforge.llm.total_tokens`
- `openforge.llm.cost_usd`
- `openforge.llm.latency_ms`
- `openforge.tool.duration_ms`
- `openforge.tool.error_count`
- `openforge.checkpoint.write_ms`
- `openforge.approval.wait_ms`

## How Operator Surfaces Consume These Signals

Operator surfaces are the dashboards, lists, and detail views that present telemetry to users. Every surface must answer at least one action-oriented question. Surfaces that display data without enabling a decision are not useful.

### Mission dashboard

Answers: "Which missions need attention right now?"

Consumes: `openforge.mission.health_status`, `openforge.mission.failure_rate`, `openforge.mission.budget_usage_ratio`, `openforge.mission.trigger_skip_count`. Missions are sorted by health severity. Clicking a degraded mission leads to the mission detail view.

### Mission detail view

Answers: "Why is this mission unhealthy, and what should I do about it?"

Consumes: recent run list with status and error codes, trigger fire history with skip reasons, budget usage breakdown, approval latency distribution. Each data point links to the specific run, trigger firing, or approval request.

### Run detail view

Answers: "What happened during this run, step by step?"

Consumes: step timeline with duration, token counts, and status. Each step links to its checkpoint snapshots, events, and any child runs spawned. Failed steps show the error code from the failure taxonomy and the error message.

### Cost analysis view

Answers: "Where is token budget being spent, and is it trending up?"

Consumes: `openforge.llm.total_tokens` and `openforge.llm.cost_usd` aggregated by mission, workflow, and time window. Cost is always attributable to a run and step, never orphaned.

### Approval queue

Answers: "What approvals are waiting, and how long have they been waiting?"

Consumes: pending `ApprovalRequestModel` records with `openforge.approval.wait_ms` for each. Shows the requesting run, step, tool name, risk category, and time since creation.

## Evaluation vs. Runtime Telemetry

Runtime telemetry and evaluation are distinct concerns that share infrastructure but differ in purpose, timing, and guarantees.

### Runtime telemetry

- **Purpose**: Observe live system behavior for operational awareness
- **Timing**: Emitted during production execution
- **Guarantees**: Best-effort delivery; missing a telemetry event must not fail the run
- **Scope**: Every run, step, trigger firing, and approval request in production
- **Consumers**: Operator dashboards, alerting, cost tracking
- **Mutability**: Telemetry records are append-only; they reflect what actually happened

### Evaluation

- **Purpose**: Measure quality, correctness, and performance in a repeatable way
- **Timing**: Executed on demand or on a schedule, against known inputs and expected outputs
- **Guarantees**: Deterministic execution path; same inputs must follow the same state machine transitions (LLM outputs may vary)
- **Scope**: Selected scenarios, benchmarks, or replayed runs
- **Consumers**: Workflow authors, quality reviewers, regression testing
- **Mutability**: Evaluation results are versioned and comparable across runs

### Why they must not be conflated

If evaluation bypasses the real execution path (e.g., calling LLM providers directly without going through the workflow runtime), it measures something other than what runs in production. Evaluation must execute through the same `RuntimeCoordinator`, node executors, and checkpoint path as production runs. The difference is in the input source (captured scenario vs. live trigger) and the output destination (evaluation result record vs. production artifact), not in the execution mechanism.

## Where Benchmark and Replay Systems Fit

### Benchmarks

A benchmark is a curated set of scenarios with known inputs and quality criteria. Benchmarks answer: "How well does this workflow perform across a representative set of cases?"

Benchmarks consume the evaluation infrastructure:

1. A benchmark suite defines a list of input payloads and expected output criteria
2. Each benchmark case is executed through the standard workflow runtime, producing a real run with real steps and checkpoints
3. The resulting artifacts and run metrics are compared against the expected criteria
4. Benchmark results are stored as evaluation records, not as production artifacts

Benchmarks are not runtime telemetry. They run on a separate schedule (or manually) and produce evaluation-specific records.

### Replay

Replay re-executes a workflow with captured inputs and state to reproduce or compare results. Replay is defined in detail in the companion document `phase13-run-replay-and-compare.md`.

Replay consumes the evaluation infrastructure by executing through the real runtime with snapshotted inputs. The resulting run is tagged as a replay run and its outputs are compared against the original run's outputs.

## Anti-Goals

### No unstructured log-only observability strategy

Telemetry must produce structured, queryable records with typed fields and hierarchical identifiers. `logger.info()` calls are acceptable for developer debugging but must not be the primary observability mechanism. If an operator question can only be answered by grepping log files, the observability architecture has failed.

### No isolated cost logs without object correlation

Every cost record must be attributable to a specific `run_id` and `step_id`. Cost data that exists only as a flat log entry without run/step/mission correlation is useless for budget analysis and must not be the production path. The telemetry hierarchy ensures that `openforge.llm.cost_usd` always carries `run_id`, `step_id`, and (when applicable) `mission_id` as attributes.

### No dashboard surfaces that cannot answer action-oriented questions

Every operator surface must have a defined question it answers. Surfaces that display raw metrics without context (e.g., "here is a graph of token counts over time" without mission/workflow attribution or trend analysis) do not satisfy the observability requirement. If a surface cannot tell the operator what to do next, it should not exist.

### No evaluation layer that bypasses the real platform execution paths

Evaluation, benchmarking, and replay must execute through the same `RuntimeCoordinator`, node executors, and checkpoint infrastructure as production runs. An evaluation system that calls LLM providers directly, skips checkpoint persistence, or uses a separate orchestration path produces results that do not reflect production behavior. The execution mechanism must be identical; only the input source and output destination differ.
