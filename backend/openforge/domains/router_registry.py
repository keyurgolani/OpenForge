"""
Domain router registry.

Registers surviving domain routers with the FastAPI application.
"""

from fastapi import FastAPI

from openforge.core.product_vocabulary import API_PREFIXES, DomainNoun

from .agents.router import router as agents_router
from .automations.router import router as automations_router
from .outputs.router import router as outputs_router
from .sinks.router import router as sinks_router
from .knowledge.router import global_router as knowledge_global_router
from .knowledge.router import router as knowledge_router
from .retrieval.router import router as retrieval_router
from .deployments.router import deploy_router, listing_router as deployments_listing_router
from .missions.router import mission_router
from .memory.router import router as memory_router
from .memory.settings_router import router as memory_settings_router
from .runs.router import router as runs_router


def register_domain_routers(app: FastAPI) -> None:
    """Register all domain routers with the FastAPI app."""

    app.include_router(
        agents_router,
        prefix=API_PREFIXES[DomainNoun.AGENT],
        tags=["agents"],
    )

    app.include_router(
        automations_router,
        prefix=API_PREFIXES[DomainNoun.AUTOMATION],
        tags=["automations"],
    )

    app.include_router(
        deploy_router,
        prefix=API_PREFIXES[DomainNoun.AUTOMATION] + "/{automation_id}/deploy",
        tags=["deployments"],
    )

    app.include_router(
        deployments_listing_router,
        prefix=API_PREFIXES[DomainNoun.DEPLOYMENT],
        tags=["deployments"],
    )

    app.include_router(
        mission_router,
        prefix=API_PREFIXES[DomainNoun.MISSION],
        tags=["missions"],
    )

    app.include_router(
        runs_router,
        prefix=API_PREFIXES[DomainNoun.RUN],
        tags=["runs"],
    )

    app.include_router(
        outputs_router,
        prefix=API_PREFIXES[DomainNoun.OUTPUT],
        tags=["outputs"],
    )

    app.include_router(
        sinks_router,
        prefix=API_PREFIXES[DomainNoun.SINK],
        tags=["sinks"],
    )

    app.include_router(
        knowledge_router,
        prefix="/api/v1/workspaces",
        tags=["knowledge"],
    )
    app.include_router(
        knowledge_global_router,
        prefix="/api/v1",
        tags=["knowledge"],
    )

    app.include_router(
        retrieval_router,
        prefix="/api/v1/retrieval",
        tags=["retrieval"],
    )

    app.include_router(
        memory_router,
        prefix="/api/v1/agents/memory",
        tags=["memory"],
    )

    app.include_router(
        memory_settings_router,
        prefix="/api/v1/memory",
        tags=["memory-settings"],
    )
