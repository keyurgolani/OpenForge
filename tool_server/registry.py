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

    # ── Legacy workspace.* → platform.workspace.* ──
    "workspace.search":             "platform.workspace.search",
    "workspace.save_knowledge":     "platform.workspace.save_knowledge",
    "workspace.list_knowledge":     "platform.workspace.list_knowledge",
    "workspace.delete_knowledge":   "platform.workspace.delete_knowledge",
    "workspace.read_knowledge":     "platform.workspace.search",
    "workspace.get_knowledge":      "platform.workspace.search",
    "workspace.find_knowledge":     "platform.workspace.search",
    "workspace.query":              "platform.workspace.search",
    "workspace.read":               "platform.workspace.search",
    "workspace.find":               "platform.workspace.search",
    "workspace.create_knowledge":   "platform.workspace.save_knowledge",
    "workspace.add_knowledge":      "platform.workspace.save_knowledge",
    "workspace.remove_knowledge":   "platform.workspace.delete_knowledge",
    "workspace.list_workspaces":    "platform.workspace.list_workspaces",
    "workspace.get_workspace":      "platform.workspace.get_workspace",

    # Unprefixed workspace shorthands
    "workspace_search":             "platform.workspace.search",
    "search_knowledge":             "platform.workspace.search",
    "read_knowledge":               "platform.workspace.search",
    "list_knowledge":               "platform.workspace.list_knowledge",
    "save_knowledge":               "platform.workspace.save_knowledge",
    "delete_knowledge":             "platform.workspace.delete_knowledge",
    "list_workspaces":              "platform.workspace.list_workspaces",
    "get_workspace":                "platform.workspace.get_workspace",

    # ── Legacy agent.* → platform.agent.* ──
    "agent.invoke":                 "platform.agent.invoke",
    "agent.list_agents":            "platform.agent.list_agents",
    "agent.get_agent":              "platform.agent.get_agent",

    # Unprefixed agent shorthands
    "invoke_agent":                 "platform.agent.invoke",
    "list_agents":                  "platform.agent.list_agents",
    "get_agent":                    "platform.agent.get_agent",

    # ── Legacy chat aliases → platform.chat.* ──
    "agent.list_chats":             "platform.chat.list_chats",
    "agent.read_chat":              "platform.chat.read_chat",
    "platform.agent.list_chats":    "platform.chat.list_chats",
    "platform.agent.read_chat":     "platform.chat.read_chat",
    "workspace.list_chats":         "platform.chat.list_chats",
    "workspace.read_chat":          "platform.chat.read_chat",
    "memory.list_conversations":    "platform.chat.list_chats",
    "memory.read_conversation":     "platform.chat.read_chat",
    "chat.list_chats":              "platform.chat.list_chats",
    "chat.read_chat":               "platform.chat.read_chat",

    # Unprefixed chat shorthands
    "list_chats":                   "platform.chat.list_chats",
    "read_chat":                    "platform.chat.read_chat",

    # ── Automation aliases ──
    "automation.list":              "platform.automation.list",
    "automation.get":               "platform.automation.get",
    "automation.create":            "platform.automation.create",
    "automation.update":            "platform.automation.update",
    "automation.delete":            "platform.automation.delete",
    "list_automations":             "platform.automation.list",
    "get_automation":               "platform.automation.get",
    "create_automation":            "platform.automation.create",
    "update_automation":            "platform.automation.update",
    "delete_automation":            "platform.automation.delete",

    # ── Deployment aliases ──
    "deployment.list":              "platform.deployment.list",
    "deployment.get":               "platform.deployment.get",
    "deployment.deploy":            "platform.deployment.deploy",
    "deployment.pause":             "platform.deployment.pause",
    "deployment.resume":            "platform.deployment.resume",
    "deployment.teardown":          "platform.deployment.teardown",
    "deployment.run_now":           "platform.deployment.run_now",
    "list_deployments":             "platform.deployment.list",
    "get_deployment":               "platform.deployment.get",
    "deploy_automation":            "platform.deployment.deploy",
    "pause_deployment":             "platform.deployment.pause",
    "resume_deployment":            "platform.deployment.resume",
    "teardown_deployment":          "platform.deployment.teardown",
    "run_deployment":               "platform.deployment.run_now",

    # ── Sink aliases ──
    "sink.list":                    "platform.sink.list",
    "sink.get":                     "platform.sink.get",
    "sink.create":                  "platform.sink.create",
    "sink.update":                  "platform.sink.update",
    "sink.delete":                  "platform.sink.delete",
    "list_sinks":                   "platform.sink.list",
    "get_sink":                     "platform.sink.get",
    "create_sink":                  "platform.sink.create",
    "update_sink":                  "platform.sink.update",
    "delete_sink":                  "platform.sink.delete",

    # memory tools — common mistakes
    "memory.save":                  "memory.store",
    "memory.get":                   "memory.recall",
    "memory.retrieve":              "memory.recall",
    "memory.delete":                "memory.forget",
    "memory.remove":                "memory.forget",
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
