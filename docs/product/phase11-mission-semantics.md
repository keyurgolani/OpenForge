# Phase 11 Mission Semantics

## What a Mission Is

A Mission is the deployment unit in OpenForge. It is the thing users create when they want automated, repeatable AI work to happen on their behalf.

A Mission binds together:

- **A Workflow** that defines the execution logic (what steps to perform)
- **Profile(s)** that define the AI worker capabilities (how the AI behaves)
- **Trigger(s)** that define when execution happens (on schedule, on event, on demand)
- **An autonomy mode** that defines how much human oversight is required
- **An approval policy** that defines which actions need human sign-off
- **A budget policy** that constrains how much the mission can consume

Users deploy Missions. They monitor Missions. They pause, resume, and retire Missions. The Mission is where "what the AI does" meets "when, how often, and under what constraints."

## What a Mission Is Not

- **Not a Workflow.** A Workflow defines execution steps. A Mission deploys a workflow with scheduling and policy. The same workflow can back multiple missions with different triggers and constraints.
- **Not a Profile.** A Profile defines worker capabilities. A Mission references profiles but does not contain prompt, model, or tool configuration.
- **Not a Run.** A Run is a single execution instance. A Mission may produce many runs over its lifetime. The mission persists; runs are transient execution records.
- **Not a cron job.** Missions have lifecycle states, health tracking, budget enforcement, and approval routing. A cron job just fires on schedule.
- **Not a background daemon.** Missions do not run continuously. They produce discrete, bounded runs. Between runs, nothing is executing.

## When to Create a Workflow vs a Mission

**Create a Workflow when:**

- You are defining reusable execution logic (steps, routing, tool calls)
- You want to test execution in isolation without scheduling or automation
- You want to compose the logic into different deployment contexts
- You are building a template that other users will customize

**Create a Mission when:**

- You want execution to happen automatically on a schedule or in response to events
- You need budget constraints on how much AI work can happen
- You need approval policies for sensitive operations
- You want health monitoring and diagnostics for ongoing automation
- You want a single control surface to pause, resume, or retire automated work

The typical flow: build and test a Workflow, then deploy it as a Mission with triggers and policies.

## Execution Modes

Missions declare an autonomy mode that determines the default level of human involvement.

### Manual

Every run must be explicitly launched by a user. Triggers of type `manual` are the only valid trigger type. The mission never executes without direct human initiation.

Use when: testing, sensitive one-off tasks, or workflows that should only run when a human decides.

### Interactive

Runs can be triggered automatically, but the workflow pauses at every significant decision point for human input. The human is in the loop throughout execution.

Use when: the AI assists but the human drives decisions, such as guided research or collaborative drafting.

### Supervised

Runs execute autonomously for most steps, but pause at designated approval nodes for human sign-off before proceeding. The approval policy determines which actions require review.

Use when: the workflow includes high-risk operations (external API calls, data modifications, publishing) but routine steps should proceed without waiting.

### Autonomous

Runs execute to completion without human intervention. Approval nodes are skipped unless the approval policy explicitly requires them for specific high-risk actions.

Use when: the workflow is well-tested, low-risk, and the budget policy provides sufficient guardrails.

## Safety and Approvals

Missions inherit safety behavior from three layers:

1. **Autonomy mode** sets the baseline: how much human oversight the mission expects by default.

2. **Approval policy** overrides the baseline for specific actions: even in autonomous mode, an approval policy can require human sign-off for tool calls, external writes, or high-cost operations.

3. **Budget policy** sets hard limits: maximum runs per day, maximum concurrent runs, token budgets per window, and mandatory cooldown after failures. When a budget limit is reached, the mission stops producing new runs regardless of autonomy mode.

Safety is not optional. Every mission has at least an autonomy mode. Budget and approval policies are recommended for any mission beyond manual mode.

When a run pauses for approval, the mission remains in `active` status. The individual run transitions to `waiting_approval`. The approval request is a durable record visible in the run's event log and the mission's diagnostics.

## User-Facing Terminology

| Term | Meaning |
|------|---------|
| Mission | A deployed automation unit with a workflow, triggers, and policies |
| Trigger | A rule that determines when a mission produces a run |
| Run | A single execution of the mission's workflow |
| Artifact | A durable output produced by a run |
| Health | The mission's recent success/failure pattern (healthy, degraded, failing) |
| Budget | Resource limits that constrain how often and how much a mission can execute |
| Autonomy mode | How much human oversight the mission requires |

## Mental Model

Think of a Mission as a deployed worker with a job description:

- The **Workflow** is the job description (what to do and in what order)
- The **Profile(s)** are the worker's skills and personality
- The **Trigger(s)** are the worker's schedule (when to show up)
- The **Budget** is the worker's resource allocation (how much they can spend)
- The **Approval policy** is the worker's escalation rules (when to check with a manager)
- The **Runs** are the worker's completed shifts
- The **Artifacts** are the worker's deliverables

You deploy the mission. It does work on schedule. You monitor its health. You adjust its budget. You retire it when it is no longer needed.
