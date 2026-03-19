"""Automation blueprint models.

Automations are created via API with structured JSON, not .md files.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class TriggerBlueprintConfig(BaseModel):
    type: str = "manual"
    schedule: Optional[str] = None
    interval_seconds: Optional[int] = None
    event_type: Optional[str] = None
    payload_template: Optional[dict] = None


class BudgetBlueprintConfig(BaseModel):
    max_runs_per_day: Optional[int] = None
    max_concurrent_runs: Optional[int] = None
    max_token_budget_per_day: Optional[int] = None
    cooldown_seconds_after_failure: Optional[int] = None


class OutputRoutingConfig(BaseModel):
    artifact_types: list[str] = Field(default_factory=list)


class AutomationBlueprint(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    agent_slug: str
    trigger: TriggerBlueprintConfig = Field(default_factory=TriggerBlueprintConfig)
    budget: BudgetBlueprintConfig = Field(default_factory=BudgetBlueprintConfig)
    output: OutputRoutingConfig = Field(default_factory=OutputRoutingConfig)
    tags: list[str] = Field(default_factory=list)
    icon: Optional[str] = None
