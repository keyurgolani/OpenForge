"""
Domain router registry.

This module provides a central registry for all domain routers.
"""

from fastapi import FastAPI

from openforge.core.product_vocabulary import API_PREFIXES, DomainNoun

from .artifacts.router import router as artifacts_router
from .missions.router import router as missions_router
from .profiles.router import router as profiles_router
from .runs.router import router as runs_router
from .triggers.router import router as triggers_router
from .workflows.router import router as workflows_router


def register_domain_routers(app: FastAPI) -> None:
    """
    Register all domain routers with the FastAPI app.

    This function mounts all domain routers at their canonical API prefixes.

    Args:
        app: The FastAPI application instance
    """
    # Register profile domain
    app.include_router(
        profiles_router,
        prefix=API_PREFIXES[DomainNoun.PROFILE],
        tags=["profiles"],
    )

    # Register workflow domain
    app.include_router(
        workflows_router,
        prefix=API_PREFIXES[DomainNoun.WORKFLOW],
        tags=["workflows"],
    )

    # Register mission domain
    app.include_router(
        missions_router,
        prefix=API_PREFIXES[DomainNoun.MISSION],
        tags=["missions"],
    )

    # Register trigger domain
    app.include_router(
        triggers_router,
        prefix=API_PREFIXES[DomainNoun.TRIGGER],
        tags=["triggers"],
    )

    # Register run domain
    app.include_router(
        runs_router,
        prefix=API_PREFIXES[DomainNoun.RUN],
        tags=["runs"],
    )

    # Register artifact domain
    app.include_router(
        artifacts_router,
        prefix=API_PREFIXES[DomainNoun.ARTIFACT],
        tags=["artifacts"],
    )
