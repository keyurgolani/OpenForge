# Phase 11 Objective Loop Model

## The Problem

Some missions need behavior that resembles "always running" -- monitoring a data source, maintaining a knowledge base, continuously researching a topic. But true always-running processes are opaque, unbudgeted, and difficult to inspect or stop. OpenForge approximates always-running behavior through repeated bounded runs, not hidden background loops.

## How "Always Running" Is Approximated

A mission achieves continuous behavior by combining:

1. **A heartbeat trigger** with a configured `interval_seconds` (e.g., every 300 seconds)
2. **A workflow** that performs one bounded iteration of work
3. **A budget policy** that constrains run frequency, concurrency, and total consumption

Each heartbeat firing creates a new, independent run. The run executes the workflow, produces artifacts, updates state, and completes. Then the next heartbeat fires and creates another run. From the outside, the mission appears continuously active. From the inside, it is a sequence of discrete, inspectable, bounded executions.

This is explicitly not a long-running process. Between heartbeat firings, nothing is executing. Each run is a complete unit with its own lifecycle, checkpoints, and event log.

## State Persistence Across Loop Iterations

Each run is independent, but missions that need continuity across iterations use two mechanisms:

### Mission Health Metadata

The `MissionDefinitionModel` tracks `last_run_at`, `last_success_at`, `last_failure_at`, `last_error_summary`, and `health_status`. This metadata is updated after each run completes, giving subsequent trigger evaluations context about recent history.

A trigger's `payload_template` can reference mission health metadata, allowing the workflow to receive context like "last run failed" or "3 consecutive successes" as input state.

### Artifact Linkage

Runs produce artifacts linked to the mission via `ArtifactLinkModel`. A workflow designed for objective-loop execution can query artifacts from prior runs of the same mission to build on previous work.

For example, a research monitoring mission might:

1. Run N produces a `research_brief` artifact with findings so far
2. Run N+1's workflow queries artifacts linked to this mission, retrieves the prior brief, and extends it with new findings
3. Run N+1 produces a new `research_brief` artifact version

This pattern uses the existing artifact versioning and linkage system from Phase 8 without introducing a separate cross-run state store.

### What Is Not Shared

Run-level operational state (`state_snapshot`, `input_payload`, `output_payload`) does not automatically carry over between iterations. Each run starts with the input constructed by its trigger's `payload_template` and the workflow's input schema. If cross-run state is needed beyond artifacts and health metadata, the workflow must explicitly read and write it through artifact or knowledge domain operations.

## Budget and Safety Controls

The objective loop is constrained by the same budget policy that applies to all mission runs:

- **`max_runs_per_day`**: Hard cap on total daily iterations. A heartbeat firing every 5 minutes would produce 288 runs per day. The budget policy can cap this to a lower number.
- **`max_runs_per_window`** + **`window_seconds`**: Sliding window rate limit. Prevents burst accumulation.
- **`max_concurrent_runs`**: Prevents overlapping runs if a prior run is still executing when the next heartbeat fires. The trigger skips and logs the skip reason.
- **`max_token_budget_per_window`**: Token consumption limit across runs within the window.
- **`cooldown_seconds_after_failure`**: Mandatory pause after a run failure before the next heartbeat can create a new run. Prevents rapid failure loops.

When any budget limit is reached, the trigger records a skip in `TriggerFireHistoryModel` with `launch_status` indicating the budget constraint that blocked it. The mission's health status may transition to `degraded` or `failing` depending on the pattern.

## Stop Conditions

The objective loop stops when any of the following occur:

1. **Mission status change**: Transitioning the mission to `paused`, `disabled`, or `archived` prevents all trigger firings. This is the primary user-facing stop mechanism.

2. **Budget exhaustion**: When `max_runs_per_day` or `max_runs_per_window` is reached, triggers skip until the window resets. The mission remains `active` but produces no runs until the budget replenishes.

3. **Cooldown after failure**: After a run failure, `cooldown_seconds_after_failure` blocks new runs for the specified duration. If failures repeat, the cooldown creates an exponential backoff pattern.

4. **Health-based transition**: If the mission's `health_status` reaches `failing` (computed from recent run success rates), the platform can transition the mission to `failed` status, halting all triggers until an operator investigates.

5. **Trigger disablement**: Individual triggers can be disabled via `is_enabled = false` without changing the mission status. This allows selective stopping of specific trigger rules.

There is no "run until objective is met" built-in stop condition in this phase. The workflow itself can produce an artifact or state signal indicating completion, but the trigger continues firing until the mission is explicitly paused or archived. The decision to stop is a human or policy decision, not a hidden internal judgment.

## Why True Infinite Loops Are Forbidden

A hidden infinite loop -- one that runs continuously inside a single execution context without producing discrete inspectable runs -- violates the core Phase 9 contract: every workflow execution must produce durable `RunModel` and `RunStepModel` records with checkpoints and events.

If a mission ran as an infinite loop:

- There would be no run boundaries to inspect, pause, or budget-constrain
- Checkpoint and event storage would grow unboundedly within a single run
- Failures would crash the entire loop rather than failing a single bounded iteration
- Budget enforcement would require mid-execution interruption instead of pre-launch evaluation
- The mission's health metadata would have no discrete run outcomes to compute from
- Operators could not answer "what happened in the last iteration" without parsing a single enormous run log

The heartbeat trigger model gives the same user-visible effect (continuous operation) with the same inspectability guarantees as any other mission pattern.

## Heartbeat Trigger Semantics

The `heartbeat` trigger type (`TriggerType.HEARTBEAT`) is an interval trigger with objective-loop semantics:

- **`interval_seconds`**: The time between heartbeat firings. This is the loop period.
- **Concurrency-aware**: If `max_concurrent_runs = 1` in the budget policy and a prior run is still executing, the heartbeat skip is recorded. The next firing will create a run only if no run is in progress. This prevents overlapping iterations.
- **Failure-aware**: After a run failure, the heartbeat respects `cooldown_seconds_after_failure` before creating the next run.
- **Fire history**: Every heartbeat firing, whether it creates a run or skips, is recorded in `TriggerFireHistoryModel` with the reason.

The heartbeat trigger differs from a plain `interval` trigger only in intent and default behavior: heartbeats default to `max_concurrent_runs = 1` and are designed for single-threaded iterative work. Interval triggers have no such default and can fire concurrently.

A heartbeat trigger on a mission with a well-designed iterative workflow and a budget policy produces a robust, inspectable, bounded approximation of continuous autonomous operation.
