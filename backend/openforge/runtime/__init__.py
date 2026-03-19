"""
OpenForge Runtime Package

Components:
- checkpoint_store: Handles execution checkpoints
- event_publisher: Event publishing and subscription
- events: Event type definitions
- hitl: Human-in-the-loop service
- policy: Policy engine for tool call evaluation
- strategies: Strategy plugin system for agent execution
- strategy_executor: Drives strategy runs
- agent_registry: Resolves agents to compiled specs
- chat_handler: Interactive chat execution
- handoff_engine: Agent-to-agent delegation
- tool_loop: Shared tool dispatch loop
"""

from .checkpoint_store import CheckpointStore
from .event_publisher import EventPublisher
from .events import RuntimeEvent
from .state_store import StateStore
from .hitl import HITLService, hitl_service
from .policy import PolicyEngine, policy_engine, ToolCallRateLimiter

try:
    from .chat_handler import ChatHandler, chat_handler
except ModuleNotFoundError:  # pragma: no cover
    ChatHandler = None
    chat_handler = None

try:
    from .handoff_engine import HandoffEngine, handoff_engine
except ModuleNotFoundError:  # pragma: no cover
    HandoffEngine = None
    handoff_engine = None

try:
    from .strategy_executor import StrategyExecutor
except ModuleNotFoundError:  # pragma: no cover
    StrategyExecutor = None

try:
    from .agent_registry import AgentRegistry, agent_registry
except ModuleNotFoundError:  # pragma: no cover
    AgentRegistry = None
    agent_registry = None

__all__ = [
    "StateStore",
    "CheckpointStore",
    "EventPublisher",
    "RuntimeEvent",
    "HITLService",
    "hitl_service",
    "PolicyEngine",
    "policy_engine",
    "ToolCallRateLimiter",
    "ChatHandler",
    "chat_handler",
    "HandoffEngine",
    "handoff_engine",
    "StrategyExecutor",
    "AgentRegistry",
    "agent_registry",
]
