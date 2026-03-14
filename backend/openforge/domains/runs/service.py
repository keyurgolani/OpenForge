"""
Run domain service.

TODO: Implement run management business logic.
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession


class RunService:
    """Service for managing runs."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_runs(self, skip: int = 0, limit: int = 100):
        """List all runs."""
        # TODO: Implement
        return [], 0

    async def get_run(self, run_id: UUID):
        """Get a run by ID."""
        # TODO: Implement
        return None

    async def create_run(self, run_data: dict):
        """Create a new run."""
        # TODO: Implement
        return None

    async def update_run(self, run_id: UUID, run_data: dict):
        """Update a run."""
        # TODO: Implement
        return None
