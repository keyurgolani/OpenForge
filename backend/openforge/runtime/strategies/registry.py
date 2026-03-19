"""Strategy plugin registry."""

from __future__ import annotations

import logging
from typing import Any

from .interface import AgentStrategy

logger = logging.getLogger("openforge.runtime.strategies.registry")


class StrategyRegistry:
    """Registry of available strategy plugins."""

    def __init__(self) -> None:
        self._strategies: dict[str, type] = {}

    def register(self, name: str, cls: type) -> None:
        self._strategies[name] = cls
        logger.debug("Registered strategy: %s", name)

    def get(self, name: str) -> AgentStrategy | None:
        cls = self._strategies.get(name)
        if cls is None:
            return None
        return cls()

    def list_available(self) -> list[str]:
        return sorted(self._strategies.keys())

    def load_builtins(self) -> None:
        from .chat import ChatStrategy
        from .researcher import ResearcherStrategy
        from .reviewer import ReviewerStrategy
        from .builder import BuilderStrategy
        from .watcher import WatcherStrategy
        from .coordinator_strategy import CoordinatorStrategy

        self.register("chat", ChatStrategy)
        self.register("researcher", ResearcherStrategy)
        self.register("reviewer", ReviewerStrategy)
        self.register("builder", BuilderStrategy)
        self.register("watcher", WatcherStrategy)
        self.register("coordinator", CoordinatorStrategy)


strategy_registry = StrategyRegistry()
