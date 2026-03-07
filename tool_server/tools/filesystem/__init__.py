"""
Filesystem tools for OpenForge.

Tools for reading, writing, and managing files within workspace scope.
All operations are sandboxed to the workspace directory.
"""
from protocol import BaseTool
from .read_file import ReadFileTool
from .write_file import WriteFileTool
from .list_directory import ListDirectoryTool
from .delete_file import DeleteFileTool
from .move_file import MoveFileTool
from .search_files import SearchFilesTool
from .file_info import FileInfoTool

TOOLS: list[BaseTool] = [
    ReadFileTool(),
    WriteFileTool(),
    ListDirectoryTool(),
    DeleteFileTool(),
    MoveFileTool(),
    SearchFilesTool(),
    FileInfoTool(),
]
