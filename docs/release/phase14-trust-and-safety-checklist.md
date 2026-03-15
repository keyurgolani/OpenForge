# Phase 14 Trust and Safety Checklist

Pre-release checklist for trust, safety, and operator-control surfaces.

## Untrusted Content Handling Audit

- [ ] All user-supplied text passed through prompt templates is wrapped and delimited to prevent prompt injection
- [ ] Content rendered in chat, artifacts, and previews is sanitized against XSS and markup injection
- [ ] External tool outputs are treated as untrusted and not directly interpolated into system prompts
- [ ] File uploads are validated for type, size, and content before processing

## Approval-Required Actions Review

- [ ] Tool execution respects per-tool policy (allow/deny/ask) and defaults to ask for unknown tools
- [ ] Autonomous mission steps that modify external state require explicit operator approval
- [ ] Budget overrides and cost-limit changes require confirmation before taking effect
- [ ] Batch operations (bulk delete, bulk publish) require confirmation

## Policy Defaults Review

- [ ] Tool policies default to the most restrictive setting (ask or deny) rather than allow
- [ ] Safety policies (content filtering, output review) are active by default
- [ ] Rate limits and cost caps are set to conservative defaults on new workspaces
- [ ] New LLM provider configurations default to non-streaming with moderate token limits

## Mission Automation Defaults

- [ ] New missions default to supervised mode, not fully autonomous
- [ ] Autonomous mode requires explicit opt-in with acknowledgement of risk
- [ ] Mission escalation thresholds are set conservatively (escalate early, not late)
- [ ] Heartbeat/interval triggers default to reasonable minimum intervals (not sub-second)

## Artifact and Publication Visibility Defaults

- [ ] New artifacts default to private/workspace visibility, not public
- [ ] Publishing or sharing an artifact requires explicit action
- [ ] Shared links include appropriate access controls
- [ ] Artifact metadata does not leak internal system details

## Operator Intervention Capabilities

- [ ] Operators can pause any running mission from the dashboard
- [ ] Operators can cancel any running workflow or mission
- [ ] Operators can disable triggers without deleting them
- [ ] Operators can revoke tool approvals and they take effect immediately
- [ ] Operators can force-stop autonomous agents mid-execution

## Debug and Internal Surface Visibility

- [ ] Operator dashboard is accessible and shows system health, active missions, and recent errors
- [ ] Internal metrics (DB query times, queue depths, memory usage) are available only in operator views
- [ ] End-user chat interface does not expose internal error details or stack traces
- [ ] API error responses use generic messages; details go to server logs only

## Surface Classification

- [ ] **Release-visible**: Chat UI, artifact viewer, workspace settings, prompt catalog
- [ ] **Operator-only**: System dashboard, evaluation harness, trigger scheduler status, cost analytics
- [ ] **Internal-only**: Debug endpoints, raw DB access, profiling tools, migration scripts
