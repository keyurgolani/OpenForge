"""
Text content processor for OpenForge.

Handles plain text files, code files, and other text-based content.
"""
import logging
from pathlib import Path
from typing import Optional
from uuid import UUID

from .base import ContentProcessor, ProcessorResult

logger = logging.getLogger("openforge.text_processor")


# Common text file extensions
TEXT_FILE_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".mdown", ".mkd",
    ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg",
    ".xml", ".html", ".htm", ".css", ".scss", ".sass", ".less",
    ".csv", ".tsv",
    ".log", ".env", ".example", ".sample",
    # Programming languages
    ".py", ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
    ".java", ".kt", ".kts", ".scala", ".groovy",
    ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hxx",
    ".cs", ".vb", ".fs",
    ".go", ".rs", ".swift", ".m", ".mm",
    ".rb", ".php", ".pl", ".pm", ".lua", ".r", ".R",
    ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
    ".sql", ".psql", ".ddl",
    ".dockerfile", ".makefile", ".cmake",
    ".rst", ".adoc", ".tex", ".org",
    ".vue", ".svelte",
}

# Text MIME type prefixes
TEXT_MIME_TYPES = ["text/", "application/json", "application/xml", "application/javascript"]


class TextProcessor(ContentProcessor):
    """Process text-based content."""

    name = "text"
    supported_types = TEXT_MIME_TYPES
    supported_extensions = list(TEXT_FILE_EXTENSIONS)

    async def process(
        self,
        file_path: str,
        workspace_id: UUID,
        knowledge_id: Optional[UUID] = None,
        **kwargs,
    ) -> ProcessorResult:
        """
        Process text file.

        Args:
            file_path: Path to the text file
            workspace_id: Workspace UUID
            knowledge_id: Optional knowledge UUID
            **kwargs: Additional options (encoding, etc.)

        Returns:
            ProcessorResult with extracted text
        """
        result = ProcessorResult(success=False)

        path = Path(file_path)
        if not path.exists():
            result.error = f"File not found: {file_path}"
            return result

        try:
            # Detect encoding (default to utf-8)
            encoding = kwargs.get("encoding", "utf-8")

            # Read file content
            content = await self._read_text(path, encoding)

            if not content.strip():
                result.error = "File is empty"
                return result

            result.success = True
            result.content = content
            result.extracted_text = content

            # Extract basic metadata
            result.metadata = {
                "filename": path.name,
                "extension": path.suffix,
                "size_bytes": path.stat().st_size,
                "line_count": content.count("\n") + 1,
                "word_count": len(content.split()),
                "char_count": len(content),
            }

            # Try to detect language based on extension
            result.metadata["detected_language"] = self._detect_language(path.suffix)

            # Embed if knowledge_id is provided
            if knowledge_id and content.strip():
                await self._embed_content(
                    content=content,
                    knowledge_id=knowledge_id,
                    workspace_id=workspace_id,
                    title=path.stem,
                )
                result.embedded = True

        except Exception as e:
            logger.exception(f"Error processing text file {file_path}: {e}")
            result.error = str(e)

        return result

    async def _read_text(self, path: Path, encoding: str = "utf-8") -> str:
        """Read text file with encoding handling."""
        try:
            with open(path, "r", encoding=encoding) as f:
                return f.read()
        except UnicodeDecodeError:
            # Try with different encodings
            for alt_encoding in ["utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]:
                try:
                    with open(path, "r", encoding=alt_encoding) as f:
                        return f.read()
                except UnicodeDecodeError:
                    continue

            # Last resort: read with errors ignored
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()

    def _detect_language(self, extension: str) -> Optional[str]:
        """Detect programming language from extension."""
        language_map = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".jsx": "javascript",
            ".tsx": "typescript",
            ".java": "java",
            ".kt": "kotlin",
            ".scala": "scala",
            ".c": "c",
            ".cpp": "cpp",
            ".h": "c",
            ".hpp": "cpp",
            ".cs": "csharp",
            ".go": "go",
            ".rs": "rust",
            ".swift": "swift",
            ".rb": "ruby",
            ".php": "php",
            ".sh": "bash",
            ".bash": "bash",
            ".sql": "sql",
            ".html": "html",
            ".css": "css",
            ".scss": "scss",
            ".json": "json",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".xml": "xml",
            ".md": "markdown",
            ".markdown": "markdown",
            ".rst": "restructuredtext",
        }
        return language_map.get(extension.lower())

    async def _embed_content(
        self,
        content: str,
        knowledge_id: UUID,
        workspace_id: UUID,
        title: Optional[str] = None,
    ) -> None:
        """Embed content in vector store."""
        try:
            from openforge.core.knowledge_processor import knowledge_processor

            await knowledge_processor.process_knowledge(
                knowledge_id=knowledge_id,
                workspace_id=workspace_id,
                content=content,
                knowledge_type="text",
                title=title,
                tags=[],
            )
        except Exception as e:
            logger.error(f"Failed to embed text content: {e}")
