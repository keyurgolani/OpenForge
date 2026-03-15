# Phase 14 Resilience Test Plan

## Purpose

This document defines the resilience and fault-tolerance test scenarios for OpenForge Phase 14. These tests validate that the system behaves correctly under adverse conditions: service restarts, interrupted operations, repeated failures, and recovery paths. Every scenario must pass on the release candidate before release.

---

## 1. Test Environment

### Configuration

Same as the performance test environment (see `phase14-performance-test-plan.md`), with the following additions:

- Docker Compose with access to `docker compose restart`, `docker compose stop`, and `docker compose kill` commands
- Ability to simulate network partitions (via `docker network disconnect` or iptables rules)
- Test data pre-seeded: active runs, pending approvals, scheduled triggers, indexed knowledge

### Prerequisites

- All services healthy before each test scenario begins
- Monitoring active to capture logs, events, and state changes during tests
- Database backup taken before destructive tests

---

## 2. Test Scenarios

### Scenario 1: Service Restart During Run Execution

**Objective**: Verify that an in-progress run can be recovered after the main OpenForge service restarts.

**Setup**:
1. Start a multi-step workflow run that takes at least 30 seconds to complete
2. Confirm the run is actively executing (status = "running", at least 1 step completed)

**Actions**:
1. Restart the openforge container: `docker compose restart openforge`
2. Wait for the service to become healthy (health check passes)

**Verifications**:
- [ ] The run record still exists in the database with its last known status
- [ ] CheckpointModel records exist for all completed steps
- [ ] The run either resumes from checkpoint or transitions to a recoverable state (not silently lost)
- [ ] If the run cannot auto-resume, it transitions to "failed" with a clear error indicating interrupted execution
- [ ] No data corruption: completed steps retain their outputs and artifacts
- [ ] New runs can be created and executed after restart

**Pass criteria**: Run state is consistent, no silent data loss, service recovers to operational state within 30 seconds.

---

### Scenario 2: Scheduler Restart and Trigger Rehydration

**Objective**: Verify that the TaskScheduler correctly rehydrates trigger state after a restart and does not miss or double-fire triggers.

**Setup**:
1. Configure 5 triggers with varying intervals (1min, 5min, 10min)
2. Let the scheduler run for at least 2 trigger cycles
3. Record which triggers have fired and their last execution timestamps

**Actions**:
1. Restart the openforge container (which hosts the scheduler): `docker compose restart openforge`
2. Wait for the service to become healthy
3. Wait for the next trigger evaluation cycle

**Verifications**:
- [ ] TaskScheduler starts its polling loop after container restart
- [ ] All 5 triggers are re-evaluated on the next poll cycle
- [ ] Triggers that were due during the restart window fire on the next cycle
- [ ] Triggers that are not yet due do not fire prematurely
- [ ] No trigger fires twice for the same interval (idempotency check via TaskLog)
- [ ] Scheduler logs confirm successful rehydration

**Pass criteria**: All triggers accounted for, no missed fires, no duplicate fires, scheduler operational within 60 seconds of restart.

---

### Scenario 3: Interrupted Approval Flows

**Objective**: Verify that HITL approval flows survive service disruptions without losing approval state or orphaning runs.

**Setup**:
1. Start a run that reaches an HITL approval node
2. Confirm the run is paused (waiting for approval)
3. Confirm the approval request appears in the Approvals inbox

**Actions (3a: Restart before approval)**:
1. Restart the openforge container while the approval is pending
2. After restart, approve the request

**Actions (3b: Restart during approval processing)**:
1. Submit an approval action (approve)
2. Immediately restart the openforge container (before the resume task completes)

**Actions (3c: Celery worker restart during resume)**:
1. Submit an approval action (approve)
2. Immediately restart the celery-worker container: `docker compose restart celery-worker`

**Verifications (3a)**:
- [ ] Approval request is still present in the database after restart
- [ ] Approvals inbox still shows the pending approval
- [ ] Approving the request after restart triggers the resume flow
- [ ] Run resumes from checkpoint and completes successfully

**Verifications (3b)**:
- [ ] Approval action is persisted before the restart
- [ ] After restart, the `resume_after_hitl` Celery task either completes or is retried
- [ ] Run eventually resumes and progresses past the approval node
- [ ] No duplicate approval actions are recorded

**Verifications (3c)**:
- [ ] Celery task is re-queued in Redis after worker restart
- [ ] Worker picks up the resume task after restart
- [ ] Run resumes from checkpoint correctly

**Pass criteria**: Approval state is never lost, runs always resume after approval regardless of restart timing.

---

### Scenario 4: Retry/Cancel/Resume Behavior After Failure

**Objective**: Verify that failed runs can be retried, cancelled runs stay cancelled, and resumed runs continue from checkpoint.

**Setup**:
1. Create a workflow with a step that can be made to fail (e.g., by pointing to an unreachable LLM provider)
2. Execute the workflow and let it fail at the expected step

**Actions (4a: Retry)**:
1. Trigger a retry of the failed run
2. Fix the failure condition (e.g., restore the LLM provider)

**Actions (4b: Cancel)**:
1. Start a new run of the same workflow
2. While the run is in progress, cancel it

**Actions (4c: Resume)**:
1. Start a run, let it fail at a specific step
2. Fix the failure condition
3. Resume the run from checkpoint

**Verifications (4a)**:
- [ ] Retry creates a new run (not modifying the failed run)
- [ ] New run starts from the beginning or from the last checkpoint (depending on implementation)
- [ ] Failed run retains its "failed" status and is not modified
- [ ] Retry run completes successfully after the fix

**Verifications (4b)**:
- [ ] Cancel request is acknowledged immediately
- [ ] Run transitions to "cancelled" status
- [ ] No further steps execute after cancellation
- [ ] Artifacts created before cancellation are preserved (not deleted)
- [ ] A cancelled run cannot be resumed

**Verifications (4c)**:
- [ ] Resume starts from the last checkpoint, not from the beginning
- [ ] Completed steps are not re-executed
- [ ] Resume run completes successfully
- [ ] Artifacts from both the original and resumed portions are linked correctly

**Pass criteria**: Retry/cancel/resume all behave predictably, no silent state corruption, no orphaned resources.

---

### Scenario 5: Artifact Version Integrity After Retry/Restart

**Objective**: Verify that artifact versioning remains consistent and correct after run retries and service restarts.

**Setup**:
1. Create a workflow that produces an artifact with a specific sink
2. Run the workflow to completion (creates artifact v1)
3. Run the workflow again (creates artifact v2)

**Actions (5a: Retry with artifacts)**:
1. Run the workflow, let it fail after creating some artifacts
2. Retry the run
3. Let the retry complete successfully

**Actions (5b: Restart with artifacts)**:
1. Run the workflow
2. Restart the openforge container mid-run (after at least one artifact is created)
3. After restart, retry or resume the run

**Verifications**:
- [ ] Artifact version numbers are sequential and gapless (v1, v2, v3...)
- [ ] No duplicate artifact versions created from retried steps
- [ ] Artifacts from failed runs are preserved (not cleaned up) unless explicitly deleted
- [ ] Artifacts from the retry run are linked to the retry run, not the original
- [ ] ArtifactLinkModel relationships remain valid after retry/restart
- [ ] Artifact content (if stored) matches the step output that produced it
- [ ] Artifact list endpoint correctly shows all versions in order

**Pass criteria**: Version integrity maintained, no duplicates, no gaps, all links valid.

---

### Scenario 6: Mission Health Transitions After Repeated Failures

**Objective**: Verify that mission health state machine transitions correctly after consecutive run failures and recoveries.

**Setup**:
1. Create a mission with an associated workflow
2. Record the initial health state (expected: "healthy")

**Actions**:
1. Run the mission; let it fail (run 1: failed)
2. Record health state
3. Run the mission again; let it fail (run 2: failed)
4. Record health state
5. Run the mission again; let it succeed (run 3: completed)
6. Record health state
7. Run the mission with 3 consecutive failures
8. Record health state after each

**Verifications**:
- [ ] Initial state: healthy
- [ ] After 1 failure: health may transition to "degraded" (or remain healthy depending on threshold)
- [ ] After 2 consecutive failures: health transitions to "degraded"
- [ ] After 1 success following failures: health recovers toward "healthy"
- [ ] After 3+ consecutive failures: health transitions to "unhealthy"
- [ ] Health state is persisted and survives service restart
- [ ] Health state is reflected in the Missions list UI and Mission detail page
- [ ] Operator Dashboard shows missions with degraded/unhealthy health prominently

**Pass criteria**: Health state machine transitions are predictable, recoverable, and visible to operators.

---

### Scenario 7: Controlled Restart/Recovery Tests

**Objective**: Verify that each service in the Docker Compose stack can be individually restarted without cascading failures.

**Actions**: For each service, perform a restart while the system is under light load.

| Service | Restart Command | Expected Recovery Time |
|---------|----------------|----------------------|
| openforge | `docker compose restart openforge` | < 30s |
| celery-worker | `docker compose restart celery-worker` | < 30s |
| postgres | `docker compose restart postgres` | < 60s |
| qdrant | `docker compose restart qdrant` | < 30s |
| redis | `docker compose restart redis` | < 30s |
| tool-server | `docker compose restart tool-server` | < 15s |

**Verifications for each service restart**:
- [ ] Other services remain operational during the restart (or degrade gracefully)
- [ ] The restarted service returns to healthy state within the expected recovery time
- [ ] In-progress operations either complete, retry, or fail cleanly (no hangs)
- [ ] No data loss from the restart
- [ ] Logs show clear indication of disconnection and reconnection

**Specific verifications**:
- [ ] **PostgreSQL restart**: API returns 503 during downtime, reconnects automatically, no data loss
- [ ] **Redis restart**: Celery workers reconnect, task queue is not lost (persistent Redis config), scheduler resumes
- [ ] **Qdrant restart**: Search returns errors during downtime, reconnects, search results consistent after recovery
- [ ] **Tool server restart**: Tool calls fail during downtime, tool sync recovers tool registry after restart

**Pass criteria**: Every service restart results in full recovery with no permanent degradation.

---

### Scenario 8: Stability Tests for Repeated Mission Execution

**Objective**: Verify long-running stability by executing missions repeatedly over an extended period.

**Setup**:
1. Configure 3 missions with varying complexity (simple, moderate, complex)
2. Set up triggers to execute each mission every 2 minutes

**Actions**:
1. Let the system run for 1 hour with all 3 missions firing on schedule
2. Monitor resource usage throughout

**Verifications**:
- [ ] All scheduled mission runs execute (no missed triggers)
- [ ] Run success rate is consistent (no increasing failure rate over time)
- [ ] Memory usage of all containers remains stable (no monotonic increase indicating leaks)
- [ ] Database connection count remains stable
- [ ] Redis memory usage remains stable (no unbounded queue growth)
- [ ] Artifact count grows linearly (no duplication)
- [ ] Qdrant memory usage is stable (no unexpected collection growth)
- [ ] Log volume is proportional to activity (no log flooding)
- [ ] After 1 hour, all services are still responsive and healthy

**Pass criteria**: System remains stable with no resource leaks, no increasing failure rates, and predictable resource growth over the test period.

---

## 3. Failure Injection Techniques

| Technique | Tool | Use Case |
|-----------|------|----------|
| Container restart | `docker compose restart <service>` | Clean restart simulation |
| Container kill | `docker compose kill <service>` | Ungraceful shutdown simulation |
| Network partition | `docker network disconnect` | Simulate network failure between services |
| Resource exhaustion | `docker update --memory=256m <container>` | Simulate OOM conditions |
| LLM provider failure | Remove/invalid API key in config | Simulate external dependency failure |
| Disk full | Fill volume mount | Simulate storage exhaustion |
| Slow responses | Network traffic shaping (tc/netem) | Simulate degraded network |

---

## 4. Reporting

### Resilience Test Report Template

```
## Scenario: [Name]
**Date**: YYYY-MM-DD
**Build**: [Git SHA or RC tag]

### Test Steps Executed
1. [Step description] - [Observed behavior]
2. ...

### Verification Results
- [ ] [Verification item] - PASS / FAIL
  - Notes: [Any observations]

### Recovery Metrics
- Service recovery time: [Xs]
- Data consistency: [Verified / Issues found]
- User impact duration: [Xs]

### Verdict: PASS / FAIL
### Notes: [Any findings, recommendations, or follow-up items]
```

---

## 5. Execution Schedule

| Phase | Scenarios | Duration |
|-------|-----------|----------|
| Phase A: Individual service restarts | Scenarios 1, 2, 7 | 1 day |
| Phase B: Approval and HITL resilience | Scenario 3 | 0.5 day |
| Phase C: Run lifecycle resilience | Scenarios 4, 5 | 1 day |
| Phase D: Mission health and stability | Scenarios 6, 8 | 1.5 days |
| **Total estimated time** | | **4 days** |

All resilience tests must be completed and passing before the release candidate can proceed to the final sign-off stage.
