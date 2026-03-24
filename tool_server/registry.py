from __future__ import annotations

import importlib
import logging
import os
from pathlib import Path
from typing import Any

import yaml

from protocol import BaseTool

logger = logging.getLogger("tool_server.registry")


# Aliases resolve common cross-category mistakes models make.
# Maps the alias the model called → the canonical tool id that handles it.
TOOL_ALIASES: dict[str, str] = {
    # language tools mistakenly called under filesystem/shell/code
    "filesystem.apply_diff":  "language.apply_diff",
    "shell.apply_diff":       "language.apply_diff",
    "code.apply_diff":        "language.apply_diff",
    "filesystem.parse_ast":   "language.parse_ast",
    "code.parse_ast":         "language.parse_ast",
    "filesystem.find_definition": "language.find_definition",
    "filesystem.find_references": "language.find_references",

    # shell tools mistakenly called under filesystem/language
    "filesystem.execute":     "shell.execute",
    "filesystem.run":         "shell.execute",
    "language.execute":       "shell.execute",
    "code.execute":           "shell.execute",
    "filesystem.execute_python": "shell.execute_python",
    "language.execute_python":   "shell.execute_python",
    "code.execute_python":       "shell.execute_python",

    # filesystem tools mistakenly called under shell/git/language/code
    "shell.read_file":        "filesystem.read_file",
    "git.read_file":          "filesystem.read_file",
    "language.read_file":     "filesystem.read_file",
    "code.read_file":         "filesystem.read_file",
    "shell.write_file":       "filesystem.write_file",
    "git.write_file":         "filesystem.write_file",
    "language.write_file":    "filesystem.write_file",
    "code.write_file":        "filesystem.write_file",
    "shell.list_directory":   "filesystem.list_directory",
    "shell.search_files":     "filesystem.search_files",
    "filesystem.search":      "filesystem.search_files",

    # git tools under shell
    "shell.git_status":       "git.status",
    "shell.git_log":          "git.log",
    "shell.git_diff":         "git.diff",
    "shell.git_add":          "git.add",
    "shell.git_commit":       "git.commit",

    # Unprefixed shorthands — models sometimes omit the category prefix
    "search_files":           "filesystem.search_files",
    "find_files":             "filesystem.search_files",
    "file_search":            "filesystem.search_files",
    "read_file":              "filesystem.read_file",
    "write_file":             "filesystem.write_file",
    "list_directory":         "filesystem.list_directory",
    "list_dir":               "filesystem.list_directory",
    "open_file":              "filesystem.read_file",

    # repo_browser.* — models sometimes invent this namespace
    "repo_browser.open_file":     "filesystem.read_file",
    "repo_browser.read_file":     "filesystem.read_file",
    "repo_browser.list_files":    "filesystem.list_directory",
    "repo_browser.list":          "filesystem.list_directory",
    "repo_browser.search_files":  "filesystem.search_files",
    "repo_browser.search":        "filesystem.search_files",
    "repo_browser.find":          "filesystem.search_files",
    "repo_browser.write_file":    "filesystem.write_file",

    # editor.* and code_editor.* aliases
    "editor.open":            "filesystem.read_file",
    "editor.read":            "filesystem.read_file",
    "code_editor.open":       "filesystem.read_file",
    "code_editor.read":       "filesystem.read_file",

    # workspace tools — models often invent read_knowledge or use wrong names
    "workspace.read_knowledge":     "workspace.search",
    "workspace.get_knowledge":      "workspace.search",
    "workspace.find_knowledge":     "workspace.search",
    "workspace.query":              "workspace.search",
    "workspace.read":               "workspace.search",
    "workspace.find":               "workspace.search",
    "workspace.create_knowledge":   "workspace.save_knowledge",
    "workspace.add_knowledge":      "workspace.save_knowledge",
    "workspace.remove_knowledge":   "workspace.delete_knowledge",

    # Unprefixed workspace shorthands
    "workspace_search":             "workspace.search",
    "search_knowledge":             "workspace.search",
    "read_knowledge":               "workspace.search",
    "list_knowledge":               "workspace.list_knowledge",
    "save_knowledge":               "workspace.save_knowledge",
    "delete_knowledge":             "workspace.delete_knowledge",

    # memory tools — common mistakes
    "memory.save":                  "memory.store",
    "memory.get":                   "memory.recall",
    "memory.retrieve":              "memory.recall",
    "memory.delete":                "memory.forget",
    "memory.remove":                "memory.forget",

    # Chat tools moved from workspace to agent
    "workspace.list_chats":         "agent.list_chats",
    "workspace.read_chat":          "agent.read_chat",
    "memory.list_conversations":    "agent.list_chats",
    "memory.read_conversation":     "agent.read_chat",

    # Unprefixed chat shorthands
    "list_chats":                   "agent.list_chats",
    "read_chat":                    "agent.read_chat",
}


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, BaseTool] = {}
        self._manifests: dict[str, dict[str, Any]] = {}

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.id] = tool
        logger.debug("Registered tool: %s", tool.id)

    def get(self, tool_id: str) -> BaseTool | None:
        tool = self._tools.get(tool_id)
        if tool is not None:
            return tool
        canonical = TOOL_ALIASES.get(tool_id)
        if canonical:
            logger.info("Resolving alias '%s' → '%s'", tool_id, canonical)
            return self._tools.get(canonical)
        return None

    def list_tools(self) -> list[dict]:
        result = []
        for tool in self._tools.values():
            meta = tool.to_metadata()
            manifest = self._manifests.get(tool.id)
            if manifest:
                meta["confirm_by_default"] = manifest.get("confirm_by_default", False)
            else:
                meta["confirm_by_default"] = False
            result.append(meta)
        return result

    def auto_discover(self, tools_package_dir: str = "tools") -> None:
        """
        Auto-discover tool categories by scanning the tools/ directory.
        Each category is a subdirectory with an __init__.py that exports TOOLS: list[BaseTool].
        Also loads manifest.yaml files for tool metadata.
        """
        self._load_manifests(tools_package_dir)
        tools_path = Path(tools_package_dir)
        if not tools_path.exists():
            logger.warning("Tools directory '%s' not found", tools_package_dir)
            return

        for entry in sorted(tools_path.iterdir()):
            if not entry.is_dir():
                continue
            if entry.name.startswith("_"):
                continue
            init_file = entry / "__init__.py"
            if not init_file.exists():
                continue

            module_name = f"{tools_package_dir}.{entry.name}"
            try:
                module = importlib.import_module(module_name)
                tools = getattr(module, "TOOLS", [])
                for tool in tools:
                    self.register(tool)
                logger.info(
                    "Loaded %d tools from category '%s'", len(tools), entry.name
                )
            except Exception as exc:
                logger.error(
                    "Failed to load tools from category '%s': %s", entry.name, exc
                )


    def _load_manifests(self, tools_package_dir: str = "tools") -> None:
        """Scan tool directories for manifest.yaml and store metadata."""
        tools_path = Path(tools_package_dir)
        if not tools_path.exists():
            return

        for entry in sorted(tools_path.iterdir()):
            if not entry.is_dir() or entry.name.startswith("_"):
                continue
            manifest_file = entry / "manifest.yaml"
            if not manifest_file.exists():
                continue
            try:
                data = yaml.safe_load(manifest_file.read_text(encoding="utf-8"))
                if not isinstance(data, dict):
                    continue
                category = data.get("category", entry.name)
                for tool_entry in data.get("tools", []):
                    tool_name = tool_entry.get("name", "")
                    if tool_name:
                        self._manifests[tool_name] = {
                            "category": category,
                            "category_description": data.get("description", ""),
                            **tool_entry,
                        }
                logger.debug("Loaded manifest for category '%s'", category)
            except Exception as exc:
                logger.warning("Failed to load manifest from '%s': %s", manifest_file, exc)

    def get_tool_manifest(self, tool_name: str) -> dict[str, Any] | None:
        """Return manifest metadata for a tool, if available."""
        return self._manifests.get(tool_name)

    def list_manifests(self) -> dict[str, dict[str, Any]]:
        """Return all loaded tool manifests."""
        return dict(self._manifests)


registry = ToolRegistry()
