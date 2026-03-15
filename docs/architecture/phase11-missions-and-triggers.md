# Phase 11 Missions and Triggers

## Why Missions Exist

Workflows define how tasks are executed. Profiles define worker capabilities. But neither answers the question: "What should happen, when, under what constraints, and with what oversight?"

A Mission is the product-level deployment unit. It packages a workflow, profile references, trigger rules, autonomy mode, approval policy, and budget policy into a single inspectable object that users create, activate, monitor, and retire. Without Missions, users would need to manually wire scheduling, budget enforcement, approval routing, and health tracking around bare workflow invocations.

Missions exist so that:

- Users have one place to deploy, pause, and monitor automated behavior
- The platform can enforce resource and safety constraints at the mission boundary
- Every automated run traces back to a named, versioned, ownable product unit
- Operators can answer "what is running, why, and who authorized it" at any time

## How Missions Differ from Other Domain Objects

| Concern | Profile | Workflow | Mission | Run |
|---------|---------|----------|---------|-----|
| Purpose | Worker capabilities | Execution graph | Deployment + automation unit | Execution instance |
| Contains behavior logic | No | Yes | No (references a workflow) | No (executes a workflow) |
| Owns scheduling | No | No | Yes (via trigger references) | No |
| Owns budget/approval policy | No | No | Yes | No (inherits from mission) |
| Has lifecycle status | Draft/Active/Archived | Draft/Active/Archived | Draft/Active/Paused/Disabled/Failed/Archived | Pending through Completed/Failed |
| Is user-deployable | No | No | Yes | No (produced by missions/triggers) |

A Workflow is reusable across many Missions. A Profile is reusable across many Workflows. A Mission is the concrete deployment that binds them together with automation policy.

## How Triggers Differ from Embedded Scheduling

Triggers are first-class domain objects with their own identity, status, fire history, and diagnostic surface. They are not schedule fields embedded on Missions, Profiles, or Workflows.

This separation matters because:

- A single Mission can have multiple Triggers (e.g., a cron schedule and a webhook)
- Triggers can be enabled/disabled independently of Mission status
- Trigger fire history is inspectable: every firing records the trigger ID, mission ID, resulting run ID, timestamp, and outcome
- Trigger types are extensible (`manual`, `cron`, `interval`, `event`, `heartbeat`, `webhook`) without modifying the Mission schema
- Triggers can target either Missions or Workflows directly, supporting both deployed and ad hoc invocation

If scheduling were a field on the Mission or Workflow model, it would couple automation rules to domain objects that should remain rule-free, make multi-trigger scenarios impossible without schema hacks, and hide fire history inside unrelated audit trails.

## Mission Lifecycle

```
draft ──→ active ──→ paused ──→ active (resume)
              │          │
              │          └──→ archived
              │
              ├──→ disabled (operator intervention)
              │        └──→ active (re-enable)
              │
              ├──→ failed (budget exhausted, repeated errors)
              │        └──→ active (after fix + manual reset)
              │
              └──→ archived (permanent retirement)
```

**draft**: Mission is being configured. Triggers will not fire. Manual launch is allowed for testing.

**active**: Triggers are armed. Runs are created according to trigger rules and autonomy mode. Health metadata is updated after each run.

**paused**: Triggers are temporarily suspended. No new runs are created. Existing runs continue to completion. Users resume by transitioning back to active.

**disabled**: Operator or system has disabled the mission due to policy, budget, or safety concerns. Requires explicit re-enablement.

**failed**: The mission has entered a failed state due to repeated run failures or budget exhaustion. The `last_error_summary` and health metadata explain why. Requires investigation and manual status reset.

**archived**: Permanently retired. Triggers are detached. Historical runs and artifacts remain queryable but no new execution occurs.

## Bounded and Inspectable Automation

All mission automation is constrained by:

1. **Budget policy**: `MissionBudgetPolicyModel` enforces `max_runs_per_day`, `max_runs_per_window`, `max_concurrent_runs`, `max_token_budget_per_window`, and `cooldown_seconds_after_failure`. When limits are reached, the mission transitions to `failed` or triggers skip with a recorded reason.

2. **Approval policy**: The mission's `approval_policy_id` determines which workflow nodes require human approval before proceeding. Approval nodes interrupt the run and create durable `ApprovalRequest` records.

3. **Autonomy mode**: `manual`, `interactive`, `supervised`, or `autonomous` -- each mode determines the default approval behavior for the mission's runs.

4. **Health tracking**: `health_status` (healthy/degraded/failing/unknown) is computed from recent run success rates. The `MissionDiagnosticsResponse` surfaces budget usage, trigger status, and error patterns.

5. **Trigger fire history**: Every trigger firing creates a `TriggerFireHistoryModel` record with launch status and error details, making the entire automation timeline inspectable.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Mission                        │
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Workflow   │  │ Profile   │  │ Budget       │ │
│  │ Reference  │  │ References│  │ Policy       │ │
│  └─────┬─────┘  └───────────┘  └──────┬───────┘ │
│        │                               │         │
│  ┌─────┴─────┐  ┌───────────┐  ┌──────┴───────┐ │
│  │ Workflow   │  │ Approval  │  │ Autonomy     │ │
│  │ Version    │  │ Policy    │  │ Mode         │ │
│  └───────────┘  └───────────┘  └──────────────┘ │
└───────────┬─────────────────────────────────────┘
            │
            │  referenced by
            ▼
┌───────────────────────┐
│     Trigger(s)        │
│  type: cron/interval/ │
│  event/webhook/       │
│  heartbeat/manual     │
│  target_id → Mission  │
└───────────┬───────────┘
            │
            │  fires → creates
            ▼
┌───────────────────────┐
│        Run            │
│  mission_id           │
│  trigger_id           │
│  workflow_version_id  │
│  status lifecycle     │
│  state/checkpoints    │
└───────────┬───────────┘
            │
            │  produces
            ▼
┌───────────────────────┐    ┌───────────────────────┐
│     RunStep(s)        │    │    Artifact(s)         │
│  node execution       │    │  linked to run/mission │
│  checkpoints          │    │  versioned content     │
│  events               │    │  lineage tracking      │
└───────────────────────┘    └───────────────────────┘
```

## Key Domain Contracts

- `MissionDefinitionModel` stores the mission identity, references, policies, and health metadata
- `TriggerDefinitionModel` stores trigger rules independently, linked to targets via `target_type` + `target_id`
- `TriggerFireHistoryModel` records every trigger firing with outcome
- `MissionBudgetPolicyModel` stores budget constraints evaluated before each run launch
- `RunModel` tracks `mission_id` and `trigger_id` for full provenance
- `ArtifactLinkModel` connects artifacts to missions for output lineage

## Integration with Phase 9 and Phase 10

### Phase 9 (Workflow Runtime)

Missions do not execute workflows directly. When a Mission launch occurs (via trigger or manual), the platform:

1. Resolves the mission's `workflow_id` to its active `WorkflowVersion`
2. Creates a `RunModel` with `mission_id`, `trigger_id`, and `workflow_version_id`
3. Delegates to `RuntimeCoordinator.execute_workflow()` from Phase 9
4. The coordinator walks the compiled graph, creating steps, checkpoints, and events
5. Mission health metadata is updated based on the run outcome

The mission layer adds policy enforcement (budget checks, autonomy mode) before handing off to the Phase 9 runtime. It does not replicate or bypass the runtime's execution path.

### Phase 10 (Composite Workflows)

Missions can reference composite workflows that use delegation, fan-out, join, and subworkflow patterns from Phase 10. The mission layer is unaware of composite internals -- it sees a single workflow version and tracks the root run. Child runs spawned by composite execution inherit the root run's `mission_id` for lineage, but the mission's budget policy evaluates against root-level runs only.
