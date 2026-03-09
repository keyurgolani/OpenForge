from tools.filesystem.read_file import ReadFileTool
from tools.filesystem.write_file import WriteFileTool
from tools.filesystem.list_directory import ListDirectoryTool
from tools.filesystem.search_files import SearchFilesTool
from tools.filesystem.file_info import FileInfoTool
from tools.filesystem.move_file import MoveFileTool
from tools.filesystem.delete_file import DeleteFileTool

TOOLS = [
    ReadFileTool(),
    WriteFileTool(),
    ListDirectoryTool(),
    SearchFilesTool(),
    FileInfoTool(),
    MoveFileTool(),
    DeleteFileTool(),
]
