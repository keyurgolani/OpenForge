"""Filesystem mirror daemon — renders memories as Obsidian-compatible markdown files."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from openforge.common.config import get_settings

logger = logging.getLogger("openforge.memory.mirror")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _slugify(text: str) -> str:
    """Convert text to a filesystem-safe slug.

    Lowercase, remove non-alphanumeric (keep hyphens), replace spaces and
    underscores with hyphens, truncate to 80 chars.
    """
    slug = text.lower()
    slug = slug.replace("_", "-").replace(" ", "-")
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    slug = slug.strip("-")
    return slug[:80]


def render_memory_file(memory_dict: dict) -> str:
    """Render a memory as markdown with YAML frontmatter."""
    lines: list[str] = ["---"]

    for key in (
        "id", "type", "tier", "confidence", "observed_at",
        "workspace", "source", "tags", "recall_count",
    ):
        value = memory_dict.get(key)
        if value is not None:
            if isinstance(value, list):
                lines.append(f"{key}:")
                for item in value:
                    lines.append(f"  - {item}")
            else:
                lines.append(f"{key}: {value}")

    lines.append("---")
    lines.append("")

    content = memory_dict.get("content", "")
    # Title: first line of content, max 80 chars
    first_line = content.split("\n", 1)[0][:80]
    lines.append(f"# {first_line}")
    lines.append("")
    lines.append(content)
    lines.append("")

    return "\n".join(lines)


def render_entity_file(entity_dict: dict) -> str:
    """Render an entity as markdown with YAML frontmatter."""
    lines: list[str] = ["---"]

    for key in ("id", "type", "subtype", "first_seen"):
        value = entity_dict.get(key)
        if value is not None:
            lines.append(f"{key}: {value}")

    lines.append("---")
    lines.append("")
    lines.append(f"# {entity_dict.get('name', 'Unknown')}")
    lines.append("")

    return "\n".join(lines)


def render_index(memories_list: list[dict]) -> str:
    """Render an index.md catalog grouped by memory_type."""
    groups: dict[str, list[dict]] = {}
    for mem in memories_list:
        mtype = mem.get("type", "unknown")
        groups.setdefault(mtype, []).append(mem)

    lines: list[str] = ["# Memory Vault Index", ""]

    for mtype in sorted(groups.keys()):
        lines.append(f"## {mtype.title()}s")
        lines.append("")
        for mem in groups[mtype]:
            ws = mem.get("workspace", "global")
            slug = _slugify(mem.get("content", "untitled").split("\n", 1)[0])
            preview = mem.get("content", "")[:60].replace("\n", " ")
            lines.append(f"- [[workspaces/{ws}/{mtype}s/{slug}]] — {preview}")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Atomic file write
# ---------------------------------------------------------------------------


def _atomic_write(path: Path, content: str) -> None:
    """Write content to a file atomically via tmp + rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(content, encoding="utf-8")
    os.replace(str(tmp_path), str(path))


# ---------------------------------------------------------------------------
# Main sync function
# ---------------------------------------------------------------------------


async def sync_mirror() -> None:
    """Full sync: read all active memories from PostgreSQL and write as markdown.

    Directory structure:
        {mirror_path}/
        ├── index.md
        ├── workspaces/
        │   ├── {workspace-slug}/
        │   │   ├── facts/
        │   │   ├── decisions/
        │   │   ├── lessons/
        │   │   └── syntheses/
        │   └── global/
        ├── preferences/
        └── experiences/
    """
    settings = get_settings()

    if not settings.memory_mirror_enabled:
        logger.debug("Mirror sync disabled, skipping")
        return

    mirror_root = Path(settings.memory_mirror_path)

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    from openforge.db.models import MemoryModel, Workspace

    engine = create_async_engine(settings.database_url, pool_size=2)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            # Load all active (non-invalidated) memories
            stmt = (
                select(MemoryModel)
                .where(MemoryModel.invalidated_at.is_(None))
                .order_by(MemoryModel.observed_at)
            )
            result = await db.execute(stmt)
            memories = result.scalars().all()

            # Load workspace names for slug mapping
            ws_stmt = select(Workspace)
            ws_result = await db.execute(ws_stmt)
            workspaces = {
                ws.id: _slugify(ws.name)
                for ws in ws_result.scalars().all()
            }

        logger.info("Mirror sync: processing %d active memories", len(memories))

        # Types that live under a workspace directory
        workspace_scoped_types = {"fact", "decision", "lesson", "synthesis"}

        memories_index: list[dict] = []
        files_written = 0

        for mem in memories:
            mem_dict = {
                "id": str(mem.id),
                "type": mem.memory_type,
                "tier": mem.tier,
                "confidence": mem.confidence,
                "observed_at": mem.observed_at.isoformat() if mem.observed_at else None,
                "workspace": workspaces.get(mem.workspace_id, "global") if mem.workspace_id else "global",
                "source": mem.source_type,
                "tags": mem.tags or [],
                "recall_count": mem.recall_count,
                "content": mem.content,
            }

            slug = _slugify(mem.content.split("\n", 1)[0])
            if not slug:
                slug = str(mem.id)[:8]

            # Determine file path based on memory type
            if mem.memory_type in workspace_scoped_types:
                ws_slug = mem_dict["workspace"]
                file_path = mirror_root / "workspaces" / ws_slug / f"{mem.memory_type}s" / f"{slug}.md"
            else:
                # preferences, experiences, and other types go to top-level dirs
                file_path = mirror_root / f"{mem.memory_type}s" / f"{slug}.md"

            md_content = render_memory_file(mem_dict)
            _atomic_write(file_path, md_content)
            files_written += 1

            memories_index.append(mem_dict)

        # Write index.md
        index_content = render_index(memories_index)
        _atomic_write(mirror_root / "index.md", index_content)

        logger.info("Mirror sync complete: %d files written", files_written)

    except Exception:
        logger.exception("Mirror sync failed")
    finally:
        await engine.dispose()
