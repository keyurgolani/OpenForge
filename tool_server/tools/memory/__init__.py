"""
Memory tools for OpenForge.

Tools for searching knowledge, storing facts, and managing agent memory.
Bridges the agent to the workspace's knowledge base.
"""
from tool_server.protocol import BaseTool
from .search_knowledge import MemorySearchKnowledgeTool
from .read_note import MemoryReadNoteTool
from .create_knowledge import MemoryCreateKnowledgeTool
from .store_fact import MemoryStoreFactTool
from .recall_facts import MemoryRecallFactsTool

TOOLS: list[BaseTool] = [
    MemorySearchKnowledgeTool(),
    MemoryReadNoteTool(),
    MemoryCreateKnowledgeTool(),
    MemoryStoreFactTool(),
    MemoryRecallFactsTool(),
]
