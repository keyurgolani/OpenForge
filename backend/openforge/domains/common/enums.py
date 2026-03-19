"""
Common domain enums.

These enums define the standard statuses, modes, and types used across
all domain packages.
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


class TriggerType(str, Enum):
    """Types of triggers for automation."""

    MANUAL = "manual"
    CRON = "cron"
    INTERVAL = "interval"
    EVENT = "event"
    HEARTBEAT = "heartbeat"
    WEBHOOK = "webhook"


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


class AgentMode(str, Enum):
    """Operational modes for agents."""

    INTERACTIVE = "interactive"
    AUTONOMOUS = "autonomous"
    SUPERVISED = "supervised"


class AgentHealthStatus(str, Enum):
    """Health status for agent health computation."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    FAILING = "failing"
    UNKNOWN = "unknown"


class AutomationStatus(str, Enum):
    """Lifecycle statuses for automations."""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"
    FAILED = "failed"
    ARCHIVED = "archived"


class CompilationStatus(str, Enum):
    """Status of blueprint compilation."""

    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
