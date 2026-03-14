from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional
from abc import ABC, abstractmethod


@dataclass
class ToolResult:
    success: bool
    output: Any = None
    error: Optional[str] = None
    truncated: bool = False
    original_length: Optional[int] = None

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"success": self.success}
        if self.output is not None:
            d["output"] = self.output
        if self.error is not None:
            d["error"] = self.error
        if self.truncated:
            d["truncated"] = True
            d["original_length"] = self.original_length
        return d


@dataclass
class ToolContext:
    workspace_id: str
    workspace_path: str
    execution_id: str
    main_app_url: str
    conversation_id: str = ""
    agent_id: str = ""


class BaseTool(ABC):
    @property
    @abstractmethod
    def id(self) -> str:
        """Unique identifier, e.g. 'filesystem.read_file'"""
        ...

    @property
    @abstractmethod
    def category(self) -> str:
        """Category name, e.g. 'filesystem'"""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name"""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """Tool description for LLM"""
        ...

    @property
    @abstractmethod
    def input_schema(self) -> dict:
        """JSON Schema for parameters"""
        ...

    @property
    def risk_level(self) -> str:
        """Risk level: low, medium, high, critical"""
        return "low"

    @property
    def max_output(self) -> Optional[int]:
        """Max output characters. None = unlimited."""
        return None

    @abstractmethod
    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        ...

    def to_metadata(self) -> dict:
        return {
            "id": self.id,
            "category": self.category,
            "display_name": self.display_name,
            "description": self.description,
            "input_schema": self.input_schema,
            "risk_level": self.risk_level,
        }

    def _maybe_truncate(self, text: str, result_output: str) -> ToolResult:
        """Helper to truncate output if max_output is set."""
        if self.max_output is not None and len(result_output) > self.max_output:
            return ToolResult(
                success=True,
                output=result_output[: self.max_output],
                truncated=True,
                original_length=len(result_output),
            )
        return ToolResult(success=True, output=result_output)
