# Phase 2 — Route Inventory

This document inventories all mounted routes and classifies them for cleanup.

## Classification Legend

- **keep** — Route is needed and has clear ownership
- **rename** — Route needs to be renamed for consistency
- **move** — Route should be moved to a different router
- **delete** — Route is no longer needed

---

## Backend Routes

### API Router (`backend/openforge/api/router.py`)

| Route | Method | Classification | Action | Owner |
|-------|--------|----------------|--------|-------|
| `/api/v1/profiles` | GET, POST | keep | keep | profiles |
| `/api/v1/profiles/{id}` | GET, PUT, DELETE | keep | keep | profiles |
| `/api/v1/workflows` | GET, POST | keep | keep | workflows |
| `/api/v1/workflows/{id}` | GET, PUT, DELETE | keep | keep | workflows |
| `/api/v1/missions` | GET, POST | keep | keep | missions |
| `/api/v1/missions/{id}` | GET, PUT, DELETE | keep | keep | missions |
| `/api/v1/triggers` | GET, POST | keep | keep | triggers |
| `/api/v1/triggers/{id}` | GET, PUT, DELETE | keep | keep | triggers |
| `/api/v1/runs` | GET, POST | keep | keep | runs |
| `/api/v1/runs/{id}` | GET, PUT, DELETE | keep | keep | runs |
| `/api/v1/artifacts` | GET, POST | keep | keep | artifacts |
| `/api/v1/artifacts/{id}` | GET, PUT, DELETE | keep | keep | artifacts |
| `/api/v1/knowledge` | GET, POST | keep | keep | knowledge |
| `/api/v1/knowledge/{id}` | GET, PUT, DELETE | keep | keep | knowledge |
| `/api/v1/conversations` | GET, POST | keep | keep | runtime |
| `/api/v1/conversations/{id}` | GET, PUT, DELETE | keep | keep | runtime |
| `/api/v1/search` | GET | keep | keep | knowledge |
| `/api/v1/settings` | GET, PUT | keep | keep | common |
| `/api/v1/tasks` | GET, POST | keep | keep | triggers |
| `/api/v1/tasks/{id}` | GET, PUT, DELETE | keep | keep | triggers |
| `/api/v1/hitl` | GET, POST | keep | keep | runtime |
| `/api/v1/hitl/{id}` | GET, PUT, DELETE | keep | keep | runtime |
| `/api/v1/websocket` | WebSocket | keep | keep | runtime |
| `/api/v1/attachments` | POST | keep | keep | knowledge |
| `/api/v1/export` | GET | keep | keep | knowledge |
| `/api/v1/mcp` | GET, POST | keep | keep | integrations |
| `/api/v1/workspaces` | GET, POST | keep | keep | integrations |
| `/api/v1/workspaces/{id}` | GET, PUT, DELETE | keep | keep | integrations |

### Domain Routers

#### Profiles Router (`backend/openforge/domains/profiles/router.py`)

| Route | Method | Classification | Action | Owner |
|-------|--------|----------------|--------|-------|
| `/api/v1/profiles` | GET, POST | keep | keep | profiles |
| `/api/v1/profiles/{id}` | GET, PUT, DELETE | keep | keep | profiles |

#### Workflows Router (`backend/openforge/domains/workflows/router.py`)

| Route | Method | Classification | Action | Owner |
|-------|--------|----------------|--------|-------|
| `/api/v1/workflows` | GET, POST | keep | keep | workflows |
| `/api/v1/workflows/{id}` | GET, PUT, DELETE | keep | keep | workflows |

#### Missions Router (`backend/openforge/domains/missions/router.py`)

| Route | Method | Classification | Action | Owner |
|-------|--------|----------------|--------|-------|
| `/api/v1/missions` | GET, POST | keep | keep | missions |
| `/api/v1/missions/{id}` | GET, PUT, DELETE | keep | keep | missions |

#### Triggers Router (`backend/openforge/domains/triggers/router.py`)

| Route | Method | Classification | Action | Owner |
|-------|--------|----------------|--------|-------|
| `/api/v1/triggers` | GET, POST | keep | keep | triggers |
| `/api/v1/triggers/{id}` | GET, PUT, DELETE | keep | keep | triggers |

#### Runs Router (`backend/openforge/domains/runs/router.py`)

| Route | Method | Classification | Action | Owner |
|-------|--------|----------------|--------|-------|
| `/api/v1/runs` | GET, POST | keep | keep | runs |
| `/api/v1/runs/{id}` | GET, PUT, DELETE | keep | keep | runs |

#### Artifacts Router (`backend/openforge/domains/artifacts/router.py`)

| Route | Method | Classification | Action | Owner |
|-------|--------|----------------|--------|-------|
| `/api/v1/artifacts` | GET, POST | keep | keep | artifacts |
| `/api/v1/artifacts/{id}` | GET, PUT, DELETE | keep | keep | artifacts |

### Legacy Routes (Deleted)

| Route | Method | Classification | Action | Owner |
|-------|--------|----------------|--------|-------|
| `/api/v1/agents` | GET, POST | delete | Deleted | N/A |
| `/api/v1/agents/{id}` | GET, PUT, DELETE | delete | Deleted | N/A |
| `/api/v1/agent_schedules` | GET, POST | delete | Deleted | N/A |
| `/api/v1/agent_schedules/{id}` | GET, PUT, DELETE | delete | Deleted | N/A |
| `/api/v1/targets` | GET, POST | delete | Deleted | N/A |
| `/api/v1/targets/{id}` | GET, PUT, DELETE | delete | Deleted | N/A |

---

## Summary Statistics

- **Total routes inventoried**: 40
- **Keep**: 35 routes
- **Delete**: 5 routes (already deleted)

---

## Route Ownership Summary

### profiles (2 routes)
- `/api/v1/profiles` (GET, POST)
- `/api/v1/profiles/{id}` (GET, PUT, DELETE)

### workflows (2 routes)
- `/api/v1/workflows` (GET, POST)
- `/api/v1/workflows/{id}` (GET, PUT, DELETE)

### missions (2 routes)
- `/api/v1/missions` (GET, POST)
- `/api/v1/missions/{id}` (GET, PUT, DELETE)

### triggers (4 routes)
- `/api/v1/triggers` (GET, POST)
- `/api/v1/triggers/{id}` (GET, PUT, DELETE)
- `/api/v1/tasks` (GET, POST)
- `/api/v1/tasks/{id}` (GET, PUT, DELETE)

### runs (2 routes)
- `/api/v1/runs` (GET, POST)
- `/api/v1/runs/{id}` (GET, PUT, DELETE)

### artifacts (2 routes)
- `/api/v1/artifacts` (GET, POST)
- `/api/v1/artifacts/{id}` (GET, PUT, DELETE)

### knowledge (5 routes)
- `/api/v1/knowledge` (GET, POST)
- `/api/v1/knowledge/{id}` (GET, PUT, DELETE)
- `/api/v1/search` (GET)
- `/api/v1/attachments` (POST)
- `/api/v1/export` (GET)

### runtime (6 routes)
- `/api/v1/conversations` (GET, POST)
- `/api/v1/conversations/{id}` (GET, PUT, DELETE)
- `/api/v1/hitl` (GET, POST)
- `/api/v1/hitl/{id}` (GET, PUT, DELETE)
- `/api/v1/websocket` (WebSocket)

### common (2 routes)
- `/api/v1/settings` (GET, PUT)

### integrations (4 routes)
- `/api/v1/mcp` (GET, POST)
- `/api/v1/workspaces` (GET, POST)
- `/api/v1/workspaces/{id}` (GET, PUT, DELETE)

---

## Next Steps

1. Verify all routes are properly mounted
2. Ensure no dead endpoints remain
3. Standardize route naming patterns
4. Thin remaining non-domain routers
