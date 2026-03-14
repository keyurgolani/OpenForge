# Phase 2 — Runtime Monolith Map

This document inventories the current execution path and identifies responsibilities
that should be moved out of the transitional execution engine.

## Current Execution Path

### Entry Points

1. **API Routes** (`backend/openforge/api/`)
   - Chat endpoints (`conversations.py`)
   - Knowledge endpoints (`knowledge.py`, `knowledge_upload.py`)
   - Task endpoints (`tasks.py`)
   - HITL endpoints (`hitl.py`)
   - WebSocket endpoints (`websocket.py`)

2. **Domain Routers** (`backend/openforge/domains/`)
   - Profiles router
   - Workflows router
   - Missions router
   - Triggers router
   - Runs router
   - Artifacts router

### Execution Flow

```
API Request
    ↓
API Router (thin mounting layer)
    ↓
Domain Router (thin composition layer)
    ↓
Domain Service (business logic)
    ↓
Runtime/Execution Engine (transitional monolith)
    ↓
Node Executors (LLM, Tool, Approval, etc.)
    ↓
Integrations (LLM, Tools, Workspace)
    ↓
Infrastructure (DB, Queue, Search)
```

## Responsibilities in Transitional Execution Engine

### Currently in Monolith (`backend/openforge/runtime/execution_engine.py`)

1. **Input Preparation**
   - Message parsing
   - Context assembly
   - Tool loading

2. **Execution Orchestration**
   - Workflow execution
   - Node execution coordination
   - State management

3. **Output Handling**
   - Response formatting
   - Stream event generation
   - Run persistence

4. **Tool Execution**
   - Tool dispatching
   - Tool result handling
   - Error handling

5. **LLM Integration**
   - LLM gateway calls
   - Response parsing
   - Token counting

### Should Move to Runtime Coordinator

1. **Workflow Execution**
   - Workflow definition loading
   - Node execution coordination
   - State transitions

2. **Run Management**
   - Run creation
   - Run status tracking
   - Run persistence

### Should Move to Node Executors

1. **LLM Node Execution**
   - LLM gateway integration
   - Response parsing
   - Token counting

2. **Tool Node Execution**
   - Tool dispatching
   - Tool result handling
   - Error handling

3. **Approval Node Execution**
   - HITL request creation
   - Approval handling
   - Denial handling

### Should Move to Domain Services

1. **State Definitions**
   - Workflow state definitions
   - Mission state definitions
   - Run state definitions

2. **Persistence**
   - Domain model persistence
   - State persistence
   - History tracking

### Should Move to Common/Utilities

1. **Schema Validation**
   - Input validation
   - Output validation
   - Type checking

2. **Formatting Helpers**
   - Response formatting
   - Error formatting
   - Log formatting

3. **Utility Code**
   - ID generation
   - Timestamp handling
   - JSON serialization

## Façade Modules for Future Extraction

### Already Created

1. **`runtime/launching.py`**
   - Mission launch boundary
   - Trigger launch boundary
   - Schedule management

### Should Create

1. **`runtime/input_preparation.py`**
   - Message parsing
   - Context assembly
   - Tool loading

2. **`runtime/tool_loading.py`**
   - Tool discovery
   - Tool registration
   - Tool validation

3. **`runtime/stream_events.py`**
   - Event generation
   - Event formatting
   - Event dispatching

4. **`runtime/run_persistence.py`**
   - Run creation
   - Run updates
   - Run history

## Summary

The current execution engine is a transitional monolith that contains:
- **Input preparation** (should move to runtime/input_preparation.py)
- **Execution orchestration** (should move to runtime/coordinator.py)
- **Output handling** (should move to runtime/stream_events.py)
- **Tool execution** (should move to runtime/node_executors/tool.py)
- **LLM integration** (should move to runtime/node_executors/llm.py)
- **State management** (should move to domain services)

The goal is to extract these responsibilities into clear ownership boundaries
so future phases can build behavior without navigating ambiguous module ownership.

## Next Steps

1. Create façade modules for future extraction
2. Move clearly non-runtime concerns out of monolith
3. Document ownership boundaries
4. Prepare for incremental extraction in future phases
