# Phase 14 Performance Test Plan

## Purpose

This document defines the performance test scenarios, thresholds, methodology, and tooling for validating that OpenForge meets its performance requirements before release. All tests target a standard Docker Compose deployment.

---

## 1. Test Environment

### Baseline Configuration

| Component | Specification |
|-----------|--------------|
| Deployment | Single-node Docker Compose (docker-compose.yml) |
| OpenForge container | 4GB memory limit |
| Celery workers | 1-2 replicas, 4GB memory limit each |
| PostgreSQL | postgres:16-alpine, default configuration |
| Qdrant | Default configuration, single node |
| Redis | Default configuration, single node |
| Knowledge corpus | ~50K chunks indexed in Qdrant |
| Workspace count | 3-5 active workspaces |
| LLM provider | At least one configured (mock provider acceptable for latency isolation tests) |

### Test Data Seeding

Before running performance tests, seed the environment with:

- 5 workspaces, each with 10-50 knowledge documents ingested
- 100+ runs across all workspaces (mix of completed, failed, cancelled)
- 500+ artifacts with version histories
- 200+ runtime events
- 50+ failure events across various classes
- 20+ approval requests (mix of pending, approved, rejected)
- Catalog fully seeded with all curated items
- 10+ entity types with 100+ relationships in the graph

---

## 2. Performance Thresholds

### API Route Latency

| Endpoint Category | p50 Target | p95 Target | p99 Target |
|-------------------|-----------|-----------|-----------|
| List endpoints (paginated, 20 items) | < 100ms | < 500ms | < 1s |
| Detail endpoints (single resource) | < 50ms | < 300ms | < 500ms |
| Create/Update endpoints | < 100ms | < 500ms | < 1s |
| Search endpoints | < 200ms | < 500ms | < 1.5s |
| Catalog list | < 100ms | < 500ms | < 1s |
| Observability summaries | < 200ms | < 500ms | < 1s |
| Failure rollup aggregations | < 200ms | < 500ms | < 1s |

### Runtime Operations

| Operation | Target |
|-----------|--------|
| Run startup (creation to first step execution) | < 2s |
| Scheduler trigger evaluation cycle | < 1s per trigger |
| HITL approval request creation | < 500ms |
| HITL resume-after-approval | < 2s |
| Knowledge document ingestion (single file) | < 30s |
| Retrieval query to evidence packet | < 1s |
| Graph entity neighborhood query | < 2s |
| Artifact creation from run step | < 500ms |

### Frontend

| Operation | Target |
|-----------|--------|
| Initial page load (any page) | < 2s |
| Navigation between pages (SPA) | < 500ms |
| WebSocket connection establishment | < 500ms |
| Chat first-token latency (excluding LLM) | < 3s |
| Catalog page with all items | < 500ms |
| Operator Dashboard full render | < 1s |

---

## 3. Test Scenarios

### Scenario 1: Concurrent Chat Sessions

**Objective**: Validate that the system handles multiple simultaneous chat sessions without degradation.

| Parameter | Value |
|-----------|-------|
| Concurrent users | 5, 10, 20 |
| Messages per user | 10 |
| Message interval | 3-5 seconds |
| Retrieval enabled | Yes |

**Measurements**:
- WebSocket connection success rate
- First-token latency per message (p50, p95)
- Retrieval query latency distribution
- Total message throughput (messages/minute)
- Error rate (failed messages / total messages)
- Memory usage of openforge container during peak load

**Pass criteria**:
- WebSocket connection success rate > 99%
- First-token latency p95 < 5s (at 10 concurrent users)
- Error rate < 1%
- No OOM kills on any container

### Scenario 2: Multiple Scheduled Mission Launches

**Objective**: Validate that the scheduler handles concurrent trigger evaluations and mission launches.

| Parameter | Value |
|-----------|-------|
| Active triggers | 10, 25, 50 |
| Trigger interval | 1 minute (all fire simultaneously) |
| Mission complexity | Mix of single-node and 3-5 node composite workflows |
| Concurrent runs | 5, 10, 20 |

**Measurements**:
- Time from trigger evaluation start to all runs created
- Scheduler poll cycle duration
- Celery task queue depth at peak
- Run startup latency distribution
- Run completion rate (% that finish without error)
- Database connection pool utilization

**Pass criteria**:
- All triggers evaluated within 1s per trigger
- Run startup < 2s for 95% of runs
- No triggers missed due to scheduler overload
- Database connection pool does not exhaust

### Scenario 3: Artifact-Heavy Workflows

**Objective**: Validate performance when workflows produce many artifacts per run.

| Parameter | Value |
|-----------|-------|
| Artifacts per run | 10, 50, 100 |
| Artifact size | 1KB - 1MB payloads |
| Concurrent runs | 3, 5, 10 |
| Version count per artifact | 1-5 |

**Measurements**:
- Artifact creation latency (per artifact)
- Artifact list endpoint latency (paginated, 20 per page)
- Artifact detail endpoint latency (with version history)
- Artifact link resolution latency
- Total run duration compared to artifact-free baseline
- Database row count growth rate

**Pass criteria**:
- Artifact creation < 500ms per artifact
- Artifact list endpoint p95 < 500ms (even with 1000+ total artifacts)
- Artifact detail with 5 versions p95 < 300ms
- Run duration overhead from artifact creation < 20% of total run time

### Scenario 4: Retrieval and Search Load

**Objective**: Validate retrieval pipeline under concurrent search pressure.

| Parameter | Value |
|-----------|-------|
| Concurrent queries | 5, 10, 20 |
| Corpus size | 50K chunks |
| Query types | Keyword, semantic, hybrid |
| Results requested | 5, 10, 20 per query |

**Measurements**:
- Qdrant search latency per query
- Evidence packet assembly time
- End-to-end retrieval latency (query to response)
- Qdrant memory usage at corpus size
- Search result relevance (spot-check, not automated)

**Pass criteria**:
- End-to-end retrieval p95 < 1s
- Qdrant search latency p95 < 500ms
- No query timeouts at 10 concurrent queries
- Qdrant memory stays within container limits

### Scenario 5: Graph Query Load

**Objective**: Validate graph query performance with a populated entity/relationship graph.

| Parameter | Value |
|-----------|-------|
| Entity count | 500, 1000, 5000 |
| Relationship count | 2000, 5000, 20000 |
| Concurrent queries | 5, 10 |
| Query types | Entity lookup, neighborhood traversal (1-hop, 2-hop), relationship filter |

**Measurements**:
- Entity lookup latency
- 1-hop neighborhood query latency
- 2-hop neighborhood query latency
- Relationship filter query latency
- Database query plan analysis (index usage)

**Pass criteria**:
- Entity lookup p95 < 200ms
- 1-hop neighborhood p95 < 1s
- 2-hop neighborhood p95 < 2s
- All queries use indexed scans (no full table scans)

### Scenario 6: Operator Surface Load

**Objective**: Validate that observability and operator endpoints perform under realistic data volumes.

| Parameter | Value |
|-----------|-------|
| Runtime events | 10K, 50K, 100K |
| Failure events | 500, 2000, 5000 |
| Active runs | 5, 20 |
| Pending approvals | 10, 50 |

**Measurements**:
- Usage summary endpoint latency
- Cost hotspots endpoint latency
- Failure list endpoint latency (paginated, filtered)
- Failure rollup aggregation latency
- Run telemetry summary latency
- Approval list endpoint latency

**Pass criteria**:
- Usage summary p95 < 500ms (at 100K events)
- Cost hotspots p95 < 500ms
- Failure list (paginated) p95 < 500ms
- Failure rollup p95 < 500ms
- Approval list p95 < 300ms

---

## 4. Load Test Approach

### Tooling

| Tool | Purpose |
|------|---------|
| **Locust** (primary) | HTTP load generation, scenario scripting, real-time metrics |
| **k6** (alternative) | HTTP load generation with precise latency histograms |
| **psql / pgbench** | Database-level performance validation |
| **docker stats** | Container resource monitoring during tests |
| **Prometheus + Grafana** (optional) | Time-series metrics collection and visualization |

### Methodology

1. **Baseline measurement**: Run each scenario with a single user to establish baseline latencies
2. **Ramp-up**: Gradually increase concurrent users/load in steps (1x, 2x, 5x, 10x baseline)
3. **Sustained load**: Hold peak load for 5 minutes to detect memory leaks and connection pool exhaustion
4. **Cool-down**: Reduce load to zero and measure recovery time
5. **Repeat**: Run each scenario 3 times and use the median results

### Test Execution

```
# Example Locust invocation
locust -f tests/performance/locustfile.py \
  --host=http://localhost:3100 \
  --users=10 \
  --spawn-rate=2 \
  --run-time=5m \
  --html=reports/perf-scenario-1.html
```

### Data Collection

For each test run, record:
- Scenario name and parameters
- Start/end timestamps
- Latency percentiles (p50, p95, p99)
- Throughput (requests/second)
- Error rate and error types
- Container resource usage (CPU, memory, network I/O)
- Database connection pool status
- Any container restarts or OOM events

---

## 5. Reporting

### Performance Test Report Template

```
## Scenario: [Name]
**Date**: YYYY-MM-DD
**Build**: [Git SHA or RC tag]
**Environment**: [Standard / Modified]

### Parameters
- [Parameter]: [Value]

### Results
| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| ... | ... | ... | ... |

### Resource Usage
- OpenForge container: [Peak CPU]%, [Peak Memory]MB
- PostgreSQL: [Peak connections], [Peak memory]MB
- Qdrant: [Peak memory]MB
- Redis: [Peak memory]MB

### Observations
- [Notable findings, bottlenecks, or anomalies]

### Verdict: PASS / FAIL / CONDITIONAL PASS
```

---

## 6. Regression Tracking

Performance results must be compared against previous RC builds to detect regressions.

| Metric | Acceptable Regression | Action Required |
|--------|----------------------|-----------------|
| Route latency p95 | < 10% increase | Investigate if > 10% |
| Run startup time | < 20% increase | Investigate if > 20% |
| Retrieval latency | < 10% increase | Investigate if > 10% |
| Memory usage at steady state | < 15% increase | Investigate if > 15% |
| Error rate | No increase from 0% | Blocker if > 0% |

Any regression exceeding these thresholds must be investigated and either resolved or documented with justification before release approval.
