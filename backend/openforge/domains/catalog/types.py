"""Catalog domain types."""

from enum import Enum


class CatalogItemType(str, Enum):
    """Types of items in the curated catalog."""

    PROFILE = "profile"
    WORKFLOW = "workflow"
    MISSION = "mission"


class DifficultyLevel(str, Enum):
    """Difficulty level for catalog items."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class SetupComplexity(str, Enum):
    """Setup complexity for catalog items."""

    MINIMAL = "minimal"
    MODERATE = "moderate"
    COMPLEX = "complex"


class CloneBehavior(str, Enum):
    """Clone behavior for catalog items."""

    SYSTEM_LOCKED = "system_locked"
    CLONE_ONLY = "clone_only"
    EDITABLE_AFTER_CLONE = "editable_after_clone"
