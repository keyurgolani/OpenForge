# Phase 11 Anti-Goals

Phase 11 introduces Missions and Triggers as the automation layer. The following behaviors are explicitly forbidden in this phase. If any of these appear in the implementation, the design has drifted from its intent.

## No Hidden Background Loops Without Mission Identity

Every automated execution must trace back to a named Mission with a visible lifecycle status, health metadata, and owning workspace. There must be no execution path where the platform performs AI work in the background without a corresponding `MissionDefinitionModel` record that users can find, inspect, pause, or retire.

If a system component needs recurring automated work, it must be modeled as a system-owned Mission (with `is_system = true`), not as an ad hoc background task hidden inside a service layer or Celery beat schedule.

## No Schedule Fields Embedded Inside Profiles or Workflows

Profiles define worker capabilities. Workflows define execution graphs. Neither should contain scheduling or trigger fields (`schedule_expression`, `interval_seconds`, `next_fire_at`, or equivalent). Scheduling belongs exclusively in `TriggerDefinitionModel`.

This rule prevents:

- Profiles that silently execute on a schedule without an explicit Mission deployment
- Workflows that auto-run themselves based on embedded timing fields
- Ambiguity about whether scheduling is configured on the trigger, the mission, the workflow, or the profile
- Trigger fire history being scattered across unrelated domain tables

If a user wants a workflow to run on a schedule, they create a Mission referencing that workflow and attach a Trigger to the Mission. There is no shortcut.

## No Automation Behavior Bypassing Workflow Runtime and Run Persistence

Every mission-initiated execution must flow through the Phase 9 `RuntimeCoordinator`, producing a `RunModel` with durable `RunStepModel` records, checkpoints, and events. There must be no execution path where a trigger fires a mission and the resulting work happens outside the workflow runtime.

This means:

- No direct LLM calls triggered by a schedule that bypass the workflow graph
- No tool invocations triggered by events that skip run and step creation
- No artifact production from automation that lacks a `run_id` and `mission_id` in its lineage
- No "lightweight" execution mode that trades run persistence for performance

If the work is important enough to automate, it is important enough to persist.

## No Silent Autonomous Execution Without Visible Status and Control Surfaces

Every active mission must be visible in the mission list with its current status, health, and recent run history. Every trigger must be visible with its type, schedule, enabled state, and fire history. Every run must be visible with its status, steps, and events.

There must be no execution where:

- A mission is running but does not appear in the workspace mission list
- A trigger is firing but its fire history is not recorded
- A run is in progress but cannot be found through the run API
- Budget limits are being enforced but the enforcement decisions are not logged
- Approval requests are being generated but are not surfaced to the user

The autonomy mode determines how much human involvement is required, not how much visibility is provided. Even fully autonomous missions expose the same inspection surfaces as supervised ones. The difference is whether the human must act, not whether the human can see.
