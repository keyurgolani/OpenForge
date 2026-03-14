"""
OpenForge Product Vocabulary Module

This module defines the canonical domain names, constants, and terminology
for the OpenForge product. All product copy, route names, and internal
identifiers should reference this file to prevent drift.

Core Domain Nouns:
- PROFILE: Agent Profile - a worker abstraction defining capabilities
- WORKFLOW: Workflow Definition - a composable execution graph
- MISSION: Mission Definition - a packaged autonomous unit
- TRIGGER: Trigger Definition - an automation rule
- RUN: Run - an execution instance
- ARTIFACT: Artifact - a produced output
- KNOWLEDGE: Knowledge - user-provided context/data
"""

from enum import Enum
from typing import Final


class DomainNoun(str, Enum):
    """Canonical domain nouns for the OpenForge product."""
    
    PROFILE = "profile"
    WORKFLOW = "workflow"
    MISSION = "mission"
    TRIGGER = "trigger"
    RUN = "run"
    ARTIFACT = "artifact"
    KNOWLEDGE = "knowledge"


class DomainStatus(str, Enum):
    """Lifecycle statuses for domain entities."""
    
    # Generic statuses
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"
    
    # Execution statuses (for runs)
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class ExecutionMode(str, Enum):
    """Execution modes for missions and workflows."""
    
    AUTONOMOUS = "autonomous"  # Full autonomy, no approvals
    SUPERVISED = "supervised"  # Human approval at key steps
    INTERACTIVE = "interactive"  # Human in the loop throughout
    MANUAL = "manual"  # Step-by-step manual execution


class TriggerType(str, Enum):
    """Types of triggers for automation."""
    
    SCHEDULE = "schedule"  # Time-based trigger (cron)
    EVENT = "event"  # Event-based trigger
    WEBHOOK = "webhook"  # External webhook trigger
    MANUAL = "manual"  # Manually triggered


class ArtifactType(str, Enum):
    """Types of artifacts that can be produced."""
    
    DOCUMENT = "document"
    REPORT = "report"
    CODE = "code"
    DATA = "data"
    IMAGE = "image"
    SUMMARY = "summary"
    INSIGHT = "insight"
    OTHER = "other"


class Visibility(str, Enum):
    """Visibility levels for entities."""
    
    PRIVATE = "private"
    WORKSPACE = "workspace"
    ORGANIZATION = "organization"
    PUBLIC = "public"


class OwnershipSource(str, Enum):
    """Ownership/source types for entities."""
    
    USER = "user"
    SYSTEM = "system"
    TEMPLATE = "template"


# =============================================================================
# User-Facing Labels
# =============================================================================

DOMAIN_LABELS: Final[dict[DomainNoun, str]] = {
    DomainNoun.PROFILE: "Profile",
    DomainNoun.WORKFLOW: "Workflow",
    DomainNoun.MISSION: "Mission",
    DomainNoun.TRIGGER: "Trigger",
    DomainNoun.RUN: "Run",
    DomainNoun.ARTIFACT: "Artifact",
    DomainNoun.KNOWLEDGE: "Knowledge",
}

DOMAIN_LABELS_PLURAL: Final[dict[DomainNoun, str]] = {
    DomainNoun.PROFILE: "Profiles",
    DomainNoun.WORKFLOW: "Workflows",
    DomainNoun.MISSION: "Missions",
    DomainNoun.TRIGGER: "Triggers",
    DomainNoun.RUN: "Runs",
    DomainNoun.ARTIFACT: "Artifacts",
    DomainNoun.KNOWLEDGE: "Knowledge",
}

DOMAIN_DESCRIPTIONS: Final[dict[DomainNoun, str]] = {
    DomainNoun.PROFILE: "Agent profiles define the capabilities, prompts, and behaviors of AI workers.",
    DomainNoun.WORKFLOW: "Workflows are composable execution graphs that define how tasks are performed.",
    DomainNoun.MISSION: "Missions are packaged autonomous units that combine workflows, profiles, and triggers.",
    DomainNoun.TRIGGER: "Triggers define when and how missions are automatically executed.",
    DomainNoun.RUN: "Runs are execution instances of workflows or missions.",
    DomainNoun.ARTIFACT: "Artifacts are outputs produced by mission runs.",
    DomainNoun.KNOWLEDGE: "Knowledge is user-provided context and data for AI processing.",
}

# =============================================================================
# Internal Identifiers
# =============================================================================

INTERNAL_IDS: Final[dict[DomainNoun, str]] = {
    DomainNoun.PROFILE: "agent_profile",
    DomainNoun.WORKFLOW: "workflow_definition",
    DomainNoun.MISSION: "mission_definition",
    DomainNoun.TRIGGER: "trigger_definition",
    DomainNoun.RUN: "run",
    DomainNoun.ARTIFACT: "artifact",
    DomainNoun.KNOWLEDGE: "knowledge",
}

# =============================================================================
# Route Segment Constants
# =============================================================================

ROUTE_SEGMENTS: Final[dict[DomainNoun, str]] = {
    DomainNoun.PROFILE: "profiles",
    DomainNoun.WORKFLOW: "workflows",
    DomainNoun.MISSION: "missions",
    DomainNoun.TRIGGER: "triggers",
    DomainNoun.RUN: "runs",
    DomainNoun.ARTIFACT: "artifacts",
    DomainNoun.KNOWLEDGE: "knowledge",
}

API_PREFIXES: Final[dict[DomainNoun, str]] = {
    DomainNoun.PROFILE: "/api/v1/profiles",
    DomainNoun.WORKFLOW: "/api/v1/workflows",
    DomainNoun.MISSION: "/api/v1/missions",
    DomainNoun.TRIGGER: "/api/v1/triggers",
    DomainNoun.RUN: "/api/v1/runs",
    DomainNoun.ARTIFACT: "/api/v1/artifacts",
    DomainNoun.KNOWLEDGE: "/api/v1/knowledge",
}


# =============================================================================
# Helper Functions
# =============================================================================

def get_label(domain: DomainNoun, plural: bool = False) -> str:
    """Get the user-facing label for a domain noun."""
    if plural:
        return DOMAIN_LABELS_PLURAL.get(domain, domain.value)
    return DOMAIN_LABELS.get(domain, domain.value)


def get_route_segment(domain: DomainNoun) -> str:
    """Get the route segment for a domain noun."""
    return ROUTE_SEGMENTS.get(domain, domain.value)


def get_api_prefix(domain: DomainNoun) -> str:
    """Get the API route prefix for a domain noun."""
    return API_PREFIXES.get(domain, f"/api/v1/{domain.value}")


def get_description(domain: DomainNoun) -> str:
    """Get the description for a domain noun."""
    return DOMAIN_DESCRIPTIONS.get(domain, "")


# =============================================================================
# Terminology Notes
# =============================================================================

"""
IMPORTANT TERMINOLOGY DECISIONS:

1. "Mission" is the packaged autonomous concept.
   - A Mission combines: Workflow + Profile(s) + Trigger(s) + Policies
   - Users deploy Missions, not individual Agents
   
2. "Profile" (Agent Profile) is a worker abstraction, NOT the top-level product unit.
   - Profiles define capabilities, prompts, and behaviors
   - Profiles are used BY Missions, they are not standalone products
   
3. "Hand" is REJECTED as a product term.
   - The term "Hand" is not used in the product vocabulary
   - Use "Mission" for autonomous units
   
4. "Agent" is a generic term for AI behavior, not a specific product noun.
   - Use "Profile" when referring to the configuration
   - Use "Mission" when referring to the deployed autonomous unit
   
5. Legacy terms to avoid in new code:
   - AgentDefinition → Use AgentProfile or Profile
   - AgentSchedule → Use Trigger
   - ContinuousTarget → Use Artifact or Mission output
"""
