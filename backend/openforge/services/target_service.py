"""Service for continuous targets — persistent output files that agents update incrementally."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.config import get_settings
from openforge.db.models import ContinuousTarget, Knowledge

logger = logging.getLogger("openforge.target_service")


class TargetService:
    """Manages continuous targets backed by knowledge items and git-versioned files."""

    async def get_or_create(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        name: str,
    ) -> ContinuousTarget:
        """Find or create a target with a backing knowledge item."""
        result = await db.execute(
            select(ContinuousTarget).where(
                ContinuousTarget.workspace_id == workspace_id,
                ContinuousTarget.name == name,
            )
        )
        target = result.scalar_one_or_none()
        if target:
            return target

        # Create backing knowledge item
        knowledge = Knowledge(
            workspace_id=workspace_id,
            type="note",
            title=f"Target: {name}",
            content="",
        )
        db.add(knowledge)
        await db.flush()

        target = ContinuousTarget(
            workspace_id=workspace_id,
            knowledge_id=knowledge.id,
            name=name,
        )
        db.add(target)
        await db.commit()
        await db.refresh(target)
        return target

    async def update(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        name: str,
        content: str,
        mode: str = "replace",
        agent_id: str | None = None,
    ) -> ContinuousTarget:
        """Update a target's content and commit the change to git."""
        target = await self.get_or_create(db, workspace_id, name)

        # Get the knowledge item
        knowledge = None
        if target.knowledge_id:
            knowledge = await db.get(Knowledge, target.knowledge_id)

        if knowledge:
            if mode == "append":
                knowledge.content = (knowledge.content or "") + "\n" + content
            elif mode == "patch":
                knowledge.content = (knowledge.content or "") + content
            else:
                knowledge.content = content
            knowledge.updated_at = datetime.now(timezone.utc)

        target.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(target)

        # Git commit the target file
        try:
            await self._git_commit_target(workspace_id, name, knowledge.content if knowledge else content)
        except Exception as e:
            logger.warning("Git commit for target '%s' failed: %s", name, e)

        return target

    async def list_targets(
        self,
        db: AsyncSession,
        workspace_id: UUID,
    ) -> list[ContinuousTarget]:
        """List all targets for a workspace."""
        result = await db.execute(
            select(ContinuousTarget)
            .where(ContinuousTarget.workspace_id == workspace_id)
            .order_by(ContinuousTarget.name)
        )
        return list(result.scalars().all())

    async def _git_commit_target(
        self,
        workspace_id: UUID,
        name: str,
        content: str,
    ) -> None:
        """Write target content to a file and commit via git."""
        import git

        settings = get_settings()
        targets_dir = Path(settings.workspace_root) / str(workspace_id) / ".openforge" / "targets"
        targets_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize filename
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
        target_file = targets_dir / f"{safe_name}.md"
        target_file.write_text(content or "", encoding="utf-8")

        # Init or open repo
        repo_dir = targets_dir
        try:
            repo = git.Repo(repo_dir)
        except (git.InvalidGitRepositoryError, git.NoSuchPathError):
            repo = git.Repo.init(repo_dir)

        repo.index.add([str(target_file.relative_to(repo_dir))])
        if repo.is_dirty(index=True, untracked_files=True):
            repo.index.commit(f"Update target: {name}")


target_service = TargetService()
