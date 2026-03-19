"""Tests for automation blueprint models."""

import pytest

from openforge.domains.automations.blueprint import (
    AutomationBlueprint,
    BudgetBlueprintConfig,
    OutputRoutingConfig,
    TriggerBlueprintConfig,
)


class TestAutomationBlueprint:
    def test_minimal_creation(self):
        bp = AutomationBlueprint(name="Test", slug="test", agent_slug="my-agent")
        assert bp.name == "Test"
        assert bp.slug == "test"
        assert bp.agent_slug == "my-agent"
        assert bp.trigger.type == "manual"
        assert bp.budget.max_runs_per_day is None
        assert bp.output.artifact_types == []
        assert bp.tags == []

    def test_full_creation(self):
        bp = AutomationBlueprint(
            name="Nightly Digest",
            slug="nightly-digest",
            description="Sends a nightly summary",
            agent_slug="digest-agent",
            trigger=TriggerBlueprintConfig(
                type="cron",
                schedule="0 0 * * *",
            ),
            budget=BudgetBlueprintConfig(
                max_runs_per_day=1,
                max_concurrent_runs=1,
                max_token_budget_per_day=50000,
            ),
            output=OutputRoutingConfig(
                artifact_types=["summary", "report"],
            ),
            tags=["digest", "nightly"],
            icon="moon",
        )
        assert bp.trigger.type == "cron"
        assert bp.trigger.schedule == "0 0 * * *"
        assert bp.budget.max_runs_per_day == 1
        assert bp.budget.max_token_budget_per_day == 50000
        assert len(bp.output.artifact_types) == 2
        assert bp.icon == "moon"

    def test_trigger_defaults(self):
        trigger = TriggerBlueprintConfig()
        assert trigger.type == "manual"
        assert trigger.schedule is None
        assert trigger.interval_seconds is None

    def test_budget_defaults(self):
        budget = BudgetBlueprintConfig()
        assert budget.max_runs_per_day is None
        assert budget.cooldown_seconds_after_failure is None
