import mimetypes

from protocol import BaseTool, ToolContext, ToolResult
from security import security

# Binary content type prefixes that should not be read as text
_BINARY_MIME_PREFIXES = ("image/", "audio/", "video/", "application/octet-stream")
_BINARY_MIME_TYPES = frozenset({
    "application/pdf",
    "application/zip",
    "application/gzip",
    "application/x-tar",
    "application/x-7z-compressed",
    "application/x-rar-compressed",
    "application/java-archive",
    "application/wasm",
    "application/x-executable",
    "application/x-sharedlib",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/x-sqlite3",
    "application/x-object",
    "font/woff",
    "font/woff2",
    "font/ttf",
    "font/otf",
})
_BINARY_EXTENSIONS = frozenset({
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".tiff", ".tif",
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma",
    ".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm",
    ".pdf", ".zip", ".gz", ".tar", ".7z", ".rar", ".bz2", ".xz",
    ".exe", ".dll", ".so", ".dylib", ".o", ".a",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".pyc", ".pyo", ".class", ".jar",
    ".sqlite", ".db", ".sqlite3",
    ".bin", ".dat", ".iso", ".img",
    ".xlsx", ".xls", ".docx", ".doc", ".pptx", ".ppt",
})


def _is_binary_file(path) -> tuple[bool, str]:
    """Detect if a file is binary based on extension, MIME type, and content sampling."""
    suffix = path.suffix.lower()
    if suffix in _BINARY_EXTENSIONS:
        mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        return True, mime

    mime = mimetypes.guess_type(str(path))[0] or ""
    if mime in _BINARY_MIME_TYPES or any(mime.startswith(p) for p in _BINARY_MIME_PREFIXES):
        return True, mime

    # Content sampling: read first 8KB and check for null bytes
    try:
        with open(path, "rb") as f:
            chunk = f.read(8192)
        if b"\x00" in chunk:
            return True, mime or "application/octet-stream"
    except Exception:
        pass

    return False, mime or "text/plain"


def _format_file_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    if size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


class ReadFileTool(BaseTool):
    @property
    def id(self): return "filesystem.read_file"

    @property
    def category(self): return "filesystem"

    @property
    def display_name(self): return "Read File"

    @property
    def description(self):
        return (
            "Read the contents of a file in the workspace. Supports optional line offset and limit. "
            "Automatically detects binary files (images, PDFs, archives, etc.) and returns "
            "file metadata instead of garbled content."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to workspace root"},
                "encoding": {"type": "string", "default": "utf-8", "description": "File encoding"},
                "offset": {"type": "integer", "description": "Start reading from this line number (1-based)"},
                "limit": {"type": "integer", "description": "Max number of lines to read"},
            },
            "required": ["path"],
        }

    @property
    def max_output(self): return 50000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        path = security.resolve_path(context.workspace_id, params["path"])
        if not path.exists():
            return ToolResult(
                success=False, error=f"File not found: {params['path']}",
                recovery_hints=["Check the file path for typos", "Use filesystem.list_directory or filesystem.search_files to explore"],
            )
        if not path.is_file():
            return ToolResult(
                success=False, error=f"Not a file: {params['path']}",
                recovery_hints=["Use filesystem.list_directory to list directory contents"],
            )

        # Detect binary files before reading
        is_binary, mime_type = _is_binary_file(path)
        if is_binary:
            stat = path.stat()
            return ToolResult(
                success=True,
                output=(
                    f"Binary file detected — cannot display as text.\n"
                    f"  Path: {params['path']}\n"
                    f"  Type: {mime_type}\n"
                    f"  Size: {_format_file_size(stat.st_size)}"
                ),
                recovery_hints=[
                    "Use a specialized tool for this file type (e.g. knowledge ingestion for PDFs/images)",
                    "Use shell.exec to run file-type-specific commands (e.g. 'file', 'exiftool', 'pdftotext')",
                ],
            )

        encoding = params.get("encoding", "utf-8")
        offset = params.get("offset", 1)
        limit = params.get("limit")

        try:
            with open(path, "r", encoding=encoding, errors="replace") as f:
                lines = f.readlines()

            start = max(0, (offset or 1) - 1)
            if limit:
                lines = lines[start: start + limit]
            else:
                lines = lines[start:]

            content = "".join(lines)
            return self._maybe_truncate("", content)
        except Exception as exc:
            error = str(exc)
            hints = []
            if "codec" in error.lower() or "encode" in error.lower() or "decode" in error.lower():
                hints.append("Try a different encoding parameter (e.g. 'latin-1', 'cp1252')")
            if "permission" in error.lower():
                hints.append("The file may have restrictive permissions")
            return ToolResult(success=False, error=error, recovery_hints=hints or None)
