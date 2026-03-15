# Phase 14 Release Candidate Process

## Purpose

This document defines how release candidates (RCs) are built, tested, evaluated, and promoted (or rejected) for the OpenForge Phase 14 release. It covers the full lifecycle from RC creation through final release.

---

## 1. Release Candidate Build Process

### Tagging

Release candidates follow the naming convention: `v0.14.0-rc.N` where N is an incrementing integer starting at 1.

```bash
# Create an RC tag from the current main branch
git tag -a v0.14.0-rc.1 -m "Phase 14 release candidate 1"
git push origin v0.14.0-rc.1
```

### Build

1. **Build all Docker images** from the tagged commit:
   ```bash
   git checkout v0.14.0-rc.1
   docker compose build
   ```

2. **Tag Docker images** with the RC version:
   ```bash
   docker tag openforge:latest openforge:v0.14.0-rc.1
   docker tag openforge-worker:latest openforge-worker:v0.14.0-rc.1
   docker tag openforge-tool-server:latest openforge-tool-server:v0.14.0-rc.1
   ```

3. **Push images** to the container registry (if applicable):
   ```bash
   docker push registry.example.com/openforge:v0.14.0-rc.1
   docker push registry.example.com/openforge-worker:v0.14.0-rc.1
   docker push registry.example.com/openforge-tool-server:v0.14.0-rc.1
   ```

### Deploy to Staging

1. Pull the tagged images on the staging environment
2. Run database migrations: `docker compose exec openforge alembic upgrade head`
3. Verify all services are healthy: `docker compose ps`
4. Verify the catalog seeder ran: check Catalog page has curated items
5. Record the deployment timestamp and build SHA

---

## 2. Mandatory Smoke Test Suite

The following smoke tests must pass on every RC build before any further testing proceeds. A smoke test failure is an automatic RC rejection.

### Smoke Tests

| # | Test | Method | Pass Criteria |
|---|------|--------|---------------|
| 1 | All containers start and pass health checks | `docker compose ps` | All services show "healthy" or "running" |
| 2 | Database migrations complete without error | Check Alembic output | No migration errors, head revision matches |
| 3 | API root responds | `curl http://localhost:3100/api/v1/` | HTTP 200 |
| 4 | Frontend loads | `curl http://localhost:3100/` | HTTP 200 with HTML content |
| 5 | Create a workspace | POST /api/v1/workspaces | HTTP 201, workspace ID returned |
| 6 | Upload a document | POST /api/v1/workspaces/{id}/knowledge/upload | HTTP 200/201, processing starts |
| 7 | Send a chat message | WebSocket /api/v1/ws/chat | Connection established, response received |
| 8 | List catalog items | GET /api/v1/catalog/items | HTTP 200, items array non-empty |
| 9 | List runs | GET /api/v1/workspaces/{id}/runs | HTTP 200 |
| 10 | Operator dashboard data | GET /api/v1/observability/usage-summary | HTTP 200 |
| 11 | Tool server reachable | GET http://tool-server:8001/health (internal) | HTTP 200 |
| 12 | Tool sync succeeds | POST /api/v1/tools/sync | HTTP 200, tools registered |
| 13 | Celery worker responsive | Check Celery inspect ping | At least 1 worker responds |
| 14 | Redis connectivity | Check Redis PING | PONG response |
| 15 | Qdrant connectivity | Check Qdrant collections endpoint | HTTP 200 |

### Smoke Test Execution

```bash
# Run the automated smoke suite
./scripts/smoke-test.sh --host http://localhost:3100

# Or run manually and record results in the smoke test report
```

### Smoke Test Report

| Test # | Description | Result | Notes |
|--------|-------------|--------|-------|
| 1 | Container health | | |
| 2 | Migrations | | |
| ... | ... | | |

**Smoke Suite Verdict**: PASS / FAIL
**Tested by**: [Name]
**Date**: [YYYY-MM-DD]
**Build**: [RC tag]

---

## 3. Bug Tracking and Severity Classification

### Severity Levels

| Severity | Definition | Release Impact |
|----------|-----------|----------------|
| **Blocker** | Prevents a P0 critical user journey from completing. Data loss or corruption. Security vulnerability. | RC is rejected. Must be fixed before next RC. |
| **Major** | Degrades a critical journey but has a workaround. Performance threshold exceeded by >2x. Non-P0 feature completely broken. | Maximum 3 open at release. Each must have a documented workaround. |
| **Minor** | Cosmetic issue in a critical journey. Non-critical feature partially broken. Performance threshold exceeded by <2x. | Tracked for next release. No release gate. |
| **Polish** | Visual inconsistency. Copy/terminology issue. Non-functional improvement. | Tracked for next release. No release gate. |

### Bug Lifecycle

1. **Discovered**: Bug filed with severity, reproduction steps, affected journey, and RC build
2. **Triaged**: Severity confirmed or adjusted by the release lead
3. **Assigned**: Developer assigned for blocker/major bugs
4. **Fixed**: Fix committed to main branch
5. **Verified**: Fix verified in next RC build
6. **Closed**: Bug marked as resolved

### Bug Report Template

```
## Bug: [Short description]

**Severity**: Blocker / Major / Minor / Polish
**RC Build**: v0.14.0-rc.N
**Affected Journey**: [Journey # from critical-user-journeys.md]
**Reporter**: [Name]
**Date**: [YYYY-MM-DD]

### Reproduction Steps
1. [Step 1]
2. [Step 2]
3. ...

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Workaround (if any)
[Steps to work around the issue]

### Screenshots/Logs
[Attach relevant evidence]
```

---

## 4. Rollback and Hold Decisions

### Decision Matrix

| Condition | Decision | Action |
|-----------|----------|--------|
| Smoke test failure | **Reject RC** | Fix the issue, build new RC |
| Blocker bug found during testing | **Hold RC** | Assess fix timeline; if < 1 day, fix and build new RC; if > 1 day, investigate scope |
| Multiple major bugs (> 3) | **Hold RC** | Triage and assess; may need to defer features |
| Performance threshold missed by > 2x | **Hold RC** | Profile and fix; build new RC |
| Resilience test failure | **Hold RC** | Assess severity; may be reclassified as blocker |
| All tests pass, < 3 major bugs with workarounds | **Promote RC** | Proceed to sign-off |

### Rollback Process

If a promoted RC is found to have issues after deployment:

1. **Identify the issue**: Capture logs, reproduction steps, and affected users
2. **Assess severity**: Use the severity classification above
3. **Decide**:
   - If blocker: Rollback to the previous stable version immediately
   - If major: Apply a hotfix if available within 4 hours; otherwise rollback
   - If minor: Document and schedule for next release
4. **Execute rollback** (if needed):
   ```bash
   # Switch to the previous stable tag
   git checkout v0.13.x  # or whatever the last stable tag is
   docker compose build && docker compose up -d
   # Run any necessary reverse migrations (if applicable)
   ```
5. **Communicate**: Notify all stakeholders of the rollback and timeline for the fix

---

## 5. Release Freeze and Change-Control Rules

### Freeze Timeline

| Phase | Duration | Rules |
|-------|----------|-------|
| **Code freeze** | RC tag to release | No new features merged to main. Only blocker/major bug fixes allowed. |
| **Hard freeze** | 48 hours before release | Only blocker fixes allowed. Each fix requires release lead approval. |
| **Release day** | Day of release | No changes. Promote the signed-off RC or postpone. |

### Change-Control Process During Freeze

1. Developer identifies a fix needed during freeze
2. Developer opens a PR with:
   - Bug reference (linked to the bug report)
   - Severity classification
   - Test evidence (before/after)
   - Impact assessment (what else could this change affect)
3. Release lead reviews and approves/rejects
4. If approved:
   - Merge to main
   - Build new RC (increment N)
   - Re-run smoke tests on new RC
   - Re-run any affected test scenarios
5. If rejected: Document the bug with workaround, defer to post-release

### What Is NOT Allowed During Freeze

- New feature development
- Refactoring
- Dependency updates (unless required for a blocker fix)
- Database schema changes (unless required for a blocker fix)
- Configuration changes to defaults
- Documentation changes that alter product behavior descriptions

---

## 6. Sign-Off Matrix

Each area must be signed off by the designated reviewer before the RC can be promoted to release. All sign-offs must reference the specific RC build (e.g., v0.14.0-rc.3).

| Area | Reviewer | Criteria | RC Build | Date | Signed Off |
|------|----------|----------|----------|------|------------|
| **Architecture** | Technical Lead | All domain models migrated, runtime execution functional, composite workflows operational | | | [ ] |
| **QA** | QA Lead | All critical user journeys pass, regression suite green, smoke tests pass, performance thresholds met | | | [ ] |
| **UX/Copy** | Design Lead | Terminology audit complete, empty states present, onboarding functional, action consistency verified | | | [ ] |
| **Trust/Safety** | Security Lead | No known security vulnerabilities, auth middleware functional when configured, no exposed secrets in logs/responses | | | [ ] |
| **Documentation** | Docs Lead | All required docs exist and are accurate for the RC, deployment guide tested | | | [ ] |
| **Operator Readiness** | DevOps Lead | Observability surfaces functional, cost accounting accurate, failure taxonomy useful, deployment process documented | | | [ ] |

### Sign-Off Process

1. Reviewer tests the RC build against their criteria
2. Reviewer documents any findings (issues, concerns, conditions)
3. Reviewer marks their sign-off as:
   - **Approved**: No issues found, criteria fully met
   - **Approved with conditions**: Minor issues found that do not block release; conditions documented
   - **Rejected**: Criteria not met; blocker or major issues documented
4. All areas must be "Approved" or "Approved with conditions" for the RC to be promoted
5. Any "Rejected" status requires a new RC after the issue is resolved

---

## 7. Final Release Notes Structure

Release notes for the final release follow this structure and are published alongside the release tag.

### Template

```markdown
# OpenForge v0.14.0 Release Notes

## Highlights
- [1-3 sentence summary of the most important changes]

## New Features
- **[Feature name]**: [1-2 sentence description]
- ...

## Improvements
- **[Improvement area]**: [Description]
- ...

## Bug Fixes
- **[Bug summary]**: [What was fixed and its impact]
- ...

## Breaking Changes
- **[Change description]**: [Migration steps or actions required]
- ...

## Known Issues
- **[Issue summary]**: [Description and workaround if available]
- ...

## Deployment Notes
- [Any special deployment steps for this release]
- [Database migration notes]
- [Configuration changes]

## Upgrade Guide
1. [Step-by-step upgrade instructions]
2. ...

## Component Versions
| Component | Version |
|-----------|---------|
| Backend (FastAPI) | [version] |
| Frontend (React) | [version] |
| Tool Server | [version] |
| PostgreSQL | 16 |
| Qdrant | [version] |
| Redis | [version] |
```

### Release Notes Authoring Process

1. Collect all merged PRs since the last release
2. Group changes into Features, Improvements, Bug Fixes, Breaking Changes
3. Write user-facing descriptions (not internal implementation details)
4. Document all breaking changes with specific migration steps
5. List known issues with workarounds
6. Have the release notes reviewed by at least one person from each sign-off area
7. Publish alongside the release tag

---

## 8. RC Lifecycle Summary

```
main branch (code freeze)
    |
    v
Tag v0.14.0-rc.1
    |
    v
Build & deploy to staging
    |
    v
Run smoke tests ──── FAIL ──> Fix, tag rc.2, restart
    |
    PASS
    |
    v
Run critical user journeys
Run performance tests
Run resilience tests ──── BLOCKER FOUND ──> Fix, tag rc.N+1, restart
    |
    ALL PASS
    |
    v
Bug triage: 0 blockers, ≤3 major
    |
    v
Sign-off matrix: all areas approved
    |
    v
Hard freeze (48 hours)
    |
    v
Final review, release notes finalized
    |
    v
Tag v0.14.0 (final release)
    |
    v
Publish release notes
Deploy to production
```
