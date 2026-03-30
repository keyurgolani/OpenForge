"""Tests for automation blueprint models."""

import pytest

from openforge.domains.automations.blueprint import (
    AutomationBlueprint,
    TriggerBlueprintConfig,
)


class TestAutomationBlueprint:
    def test_minimal_creation(self):
        bp = AutomationBlueprint(name="Test", slug="test", agent_slug="my-agent")
        assert bp.name == "Test"
        assert bp.slug == "test"
        assert bp.agent_slug == "my-agent"
        assert bp.trigger.type == "manual"
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
            tags=["digest", "nightly"],
            icon="moon",
        )
        assert bp.trigger.type == "cron"
        assert bp.trigger.schedule == "0 0 * * *"
        assert bp.icon == "moon"

    def test_trigger_defaults(self):
        trigger = TriggerBlueprintConfig()
        assert trigger.type == "manual"
        assert trigger.schedule is None
        assert trigger.interval_seconds is None
