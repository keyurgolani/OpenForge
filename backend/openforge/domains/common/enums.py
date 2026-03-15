"""
Common domain enums.

These enums define the standard statuses, modes, and types used across
all domain packages. They align with the canonical product vocabulary.
"""

from enum import Enum


class DomainStatus(str, Enum):
    """Lifecycle statuses for domain entities."""
    
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class ExecutionStatus(str, Enum):
    """Execution statuses for runs and runtime objects."""
    
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    INTERRUPTED = "interrupted"
    RETRYING = "retrying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"
    TIMEOUT = "timeout"


class ExecutionMode(str, Enum):
    """Execution modes for missions and workflows."""
    
    AUTONOMOUS = "autonomous"  # Full autonomy, no approvals required
    SUPERVISED = "supervised"  # Human approval at key decision points
    INTERACTIVE = "interactive"  # Human in the loop throughout
    MANUAL = "manual"  # Step-by-step manual execution


class TriggerType(str, Enum):
    """Types of triggers for automation."""

    MANUAL = "manual"  # Manually triggered
    CRON = "cron"  # Cron-based scheduled trigger
    INTERVAL = "interval"  # Fixed-interval recurring trigger
    EVENT = "event"  # Internal event-based trigger
    HEARTBEAT = "heartbeat"  # Periodic heartbeat for objective-loop execution
    WEBHOOK = "webhook"  # External webhook trigger


class MissionHealthStatus(str, Enum):
    """Health status for mission health computation."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    FAILING = "failing"
    UNKNOWN = "unknown"


class ArtifactType(str, Enum):
    """Types of artifacts that can be produced."""

    NOTE = "note"
    SUMMARY = "summary"
    REPORT = "report"
    PLAN = "plan"
    TARGET = "target"
    EVIDENCE_PACKET_REF = "evidence_packet_ref"
    RESEARCH_BRIEF = "research_brief"
    DATASET = "dataset"
    ALERT = "alert"
    EXPERIMENT_RESULT = "experiment_result"
    NOTIFICATION_DRAFT = "notification_draft"
    GENERIC_DOCUMENT = "generic_document"
    DOCUMENT = "document"
    CODE = "code"
    DATA = "data"
    IMAGE = "image"
    INSIGHT = "insight"
    OTHER = "other"


class Visibility(str, Enum):
    """Visibility levels for entities."""
    
    PRIVATE = "private"  # Only visible to creator
    WORKSPACE = "workspace"  # Visible to workspace members
    ORGANIZATION = "organization"  # Visible to organization members
    PUBLIC = "public"  # Publicly visible


class OwnershipSource(str, Enum):
    """Ownership/source types for entities."""
    
    USER = "user"  # Created by a user
    SYSTEM = "system"  # System-provided
    TEMPLATE = "template"  # Created from a template


class NodeType(str, Enum):
    """Types of nodes in a workflow graph."""
    
    LLM = "llm"  # LLM inference node
    TOOL = "tool"  # Tool execution node
    ROUTER = "router"  # Conditional routing node
    APPROVAL = "approval"  # Human approval node
    ARTIFACT = "artifact"  # Artifact generation node
    DELEGATE_CALL = "delegate_call"  # Bounded child-run delegation
    HANDOFF = "handoff"  # Transfer control to another path or target
    FANOUT = "fanout"  # Parallel child-run branching
    SUBWORKFLOW = "subworkflow"  # Nested workflow node
    JOIN = "join"  # Reducer/join node
    REDUCE = "reduce"  # Reduce normalized branch outputs
    TERMINAL = "terminal"  # Terminal completion/failure node
    INPUT = "input"  # Input node
    OUTPUT = "output"  # Output node
    TRANSFORM = "transform"  # Data transformation node


class ProfileRole(str, Enum):
    """Roles that profiles can play."""
    
    WORKER = "worker"  # General purpose worker
    ORCHESTRATOR = "orchestrator"  # Coordinates other profiles
    SPECIALIST = "specialist"  # Domain-specific specialist
    REVIEWER = "reviewer"  # Reviews and validates outputs
