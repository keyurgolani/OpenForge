"""
OpenForge Runtime Package

Components:
- event_publisher: Event publishing and subscription
- events: Event type definitions
- hitl: Human-in-the-loop service
- policy: Policy engine for tool call evaluation
- agent_executor: Background agent execution
- agent_registry: Resolves agents to compiled specs
- chat_handler: Interactive chat execution
- handoff_engine: Agent-to-agent delegation
- tool_loop: Shared tool dispatch loop
"""

from .event_publisher import EventPublisher
from .events import RuntimeEvent
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
    from .agent_executor import execute_agent
except ModuleNotFoundError:  # pragma: no cover
    execute_agent = None

try:
    from .agent_registry import AgentRegistry, agent_registry
except ModuleNotFoundError:  # pragma: no cover
    AgentRegistry = None
    agent_registry = None

__all__ = [
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
    "execute_agent",
    "AgentRegistry",
    "agent_registry",
]
