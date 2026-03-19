"""Tests for strategy registry."""

import pytest

from openforge.runtime.strategies.registry import StrategyRegistry


class TestStrategyRegistry:
    def test_register_and_get(self):
        registry = StrategyRegistry()

        class FakeStrategy:
            @property
            def name(self):
                return "fake"

        registry.register("fake", FakeStrategy)
        instance = registry.get("fake")
        assert instance is not None
        assert instance.name == "fake"

    def test_get_missing(self):
        registry = StrategyRegistry()
        assert registry.get("nonexistent") is None

    def test_list_available(self):
        registry = StrategyRegistry()

        class A:
            pass

        class B:
            pass

        registry.register("beta", B)
        registry.register("alpha", A)
        available = registry.list_available()
        assert available == ["alpha", "beta"]

    def test_load_builtins(self):
        registry = StrategyRegistry()
        registry.load_builtins()
        available = registry.list_available()
        assert len(available) == 6
        assert "chat" in available
        assert "researcher" in available
        assert "reviewer" in available
        assert "builder" in available
        assert "watcher" in available
        assert "coordinator" in available

    def test_builtin_instances(self):
        registry = StrategyRegistry()
        registry.load_builtins()

        chat = registry.get("chat")
        assert chat is not None
        assert chat.name == "chat"

        researcher = registry.get("researcher")
        assert researcher is not None
        assert researcher.name == "researcher"

    def test_module_level_singleton(self):
        from openforge.runtime.strategies.registry import strategy_registry
        assert isinstance(strategy_registry, StrategyRegistry)
