from __future__ import annotations

from importlib import import_module
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def test_runtime_core_modules_are_present() -> None:
    for module_name in [
        "openforge.runtime.lifecycle",
        "openforge.runtime.event_publisher",
        "openforge.runtime.chat_handler",
        "openforge.runtime.tool_loop",
        "openforge.runtime.agent_executor",
        "openforge.runtime.agent_registry",
    ]:
        module = import_module(module_name)
        assert module is not None
