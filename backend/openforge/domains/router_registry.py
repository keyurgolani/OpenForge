"""
Domain router registry.

This module provides a central registry for all domain routers.
"""

from fastapi import FastAPI

from openforge.core.product_vocabulary import API_PREFIXES, DomainNoun

from .artifacts.router import router as artifacts_router
from .catalog.router import router as catalog_router
from .graph.router import router as graph_router
from .knowledge.router import global_router as knowledge_global_router
from .knowledge.router import router as knowledge_router
from .missions.router import router as missions_router
from .policies.router import router as policies_router
from .profiles.router import router as profiles_router
from .prompts.router import router as prompts_router
from .retrieval.router import router as retrieval_router
from .runs.router import router as runs_router
from .triggers.router import router as triggers_router
from .workflows.router import router as workflows_router
# Phase 7 profile building blocks
from .capability_bundles.router import router as capability_bundles_router
from .model_policies.router import router as model_policies_router
from .memory_policies.router import router as memory_policies_router
from .output_contracts.router import router as output_contracts_router
# Phase 13 observability and evaluation
from .observability.router import router as observability_router
from .evaluation.router import router as evaluation_router


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

    # Register knowledge domain under the existing workspace-scoped surface and
    # its global resolve endpoints.
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

    # Register graph domain
    app.include_router(
        graph_router,
        prefix=API_PREFIXES[DomainNoun.GRAPH],
        tags=["graph"],
    )

    # Phase 12 curated catalog
    app.include_router(
        catalog_router,
        prefix=API_PREFIXES[DomainNoun.CATALOG],
        tags=["catalog"],
    )

    # Phase 7 profile building blocks
    # Register capability bundles domain
    app.include_router(
        capability_bundles_router,
        prefix=API_PREFIXES[DomainNoun.CAPABILITY_BUNDLE],
        tags=["capability-bundles"],
    )

    # Register model policies domain
    app.include_router(
        model_policies_router,
        prefix=API_PREFIXES[DomainNoun.MODEL_POLICY],
        tags=["model-policies"],
    )

    # Register memory policies domain
    app.include_router(
        memory_policies_router,
        prefix=API_PREFIXES[DomainNoun.MEMORY_POLICY],
        tags=["memory-policies"],
    )

    # Register output contracts domain
    app.include_router(
        output_contracts_router,
        prefix=API_PREFIXES[DomainNoun.OUTPUT_CONTRACT],
        tags=["output-contracts"],
    )

    # Domain-owned builder and trust surfaces
    app.include_router(
        prompts_router,
        prefix="/api/v1/prompts",
        tags=["prompts"],
    )
    app.include_router(
        policies_router,
        prefix="/api/v1/policies",
        tags=["policies"],
    )
    app.include_router(
        retrieval_router,
        prefix="/api/v1/retrieval",
        tags=["retrieval"],
    )

    # Phase 13 observability and evaluation
    app.include_router(
        observability_router,
        prefix=API_PREFIXES[DomainNoun.OBSERVABILITY],
        tags=["observability"],
    )

    app.include_router(
        evaluation_router,
        prefix=API_PREFIXES[DomainNoun.EVALUATION],
        tags=["evaluation"],
    )
