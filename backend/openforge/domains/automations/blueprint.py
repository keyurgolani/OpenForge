"""Automation blueprint models.

Automations are created via API with structured JSON, not .md files.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class TriggerBlueprintConfig(BaseModel):
    type: str = "manual"
    schedule: Optional[str] = None
    interval_seconds: Optional[int] = None
    event_type: Optional[str] = None
    payload_template: Optional[dict] = None

    def model_post_init(self, __context: Any) -> None:
        """Normalize: accept 'cron' as alias for 'schedule'."""
        # Handled via __init__ override below
        pass

    def __init__(self, **data: Any) -> None:
        # Accept 'cron' key as alias for 'schedule'
        if "cron" in data and "schedule" not in data:
            data["schedule"] = data.pop("cron")
        elif "cron" in data:
            data.pop("cron")
        super().__init__(**data)


class AutomationNodeBlueprint(BaseModel):
    node_key: str
    agent_slug: str
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})
    config: dict = Field(default_factory=dict)


class AutomationEdgeBlueprint(BaseModel):
    source_node_key: str
    source_output_key: str = "output"
    target_node_key: str
    target_input_key: str


class AutomationStaticInput(BaseModel):
    node_key: str
    input_key: str
    value: Any = None


class AutomationBlueprint(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    agent_slug: Optional[str] = None  # nullable for multi-node automations
    trigger: TriggerBlueprintConfig = Field(default_factory=TriggerBlueprintConfig)
    tags: list[str] = Field(default_factory=list)
    icon: Optional[str] = None
    # Multi-node graph fields
    nodes: list[AutomationNodeBlueprint] = Field(default_factory=list)
    edges: list[AutomationEdgeBlueprint] = Field(default_factory=list)
    static_inputs: list[AutomationStaticInput] = Field(default_factory=list)
