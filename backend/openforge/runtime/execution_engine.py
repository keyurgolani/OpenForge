"""
TRANSITIONAL: Agent Execution Engine

This module re-exports the transitional monolith execution engine.
The engine is scheduled for extraction and refactoring in a later phase.

Architecture Evolution:
- Phase 2: This module provides a stable import path
- Phase 3+: Will be extracted into:
  - Runtime coordinator (runtime/coordinator.py)
  - Node executors (runtime/node_executors/)
  - State management (runtime/state_store.py)

New development should target the domain architecture (openforge.domains.*) when possible.
"""

# Re-export from the transitional monolith for stable import paths
from openforge.services.agent_execution_engine import (
    AgentExecutionEngine,
    agent_engine,
)

__all__ = [
    "AgentExecutionEngine",
    "agent_engine",
]
