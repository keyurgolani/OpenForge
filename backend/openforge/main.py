import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path

from openforge.common.config import get_settings
from openforge.services.task_scheduler import task_scheduler

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger("openforge")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info("OpenForge starting up...")

    # Initialize PostgreSQL + run migrations
    try:
        from openforge.db.postgres import engine, run_migrations
        await run_migrations()
        logger.info("Database migrations applied.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

    # Initialize Qdrant collections
    needs_reindex = False
    try:
        from openforge.db.qdrant_client import init_qdrant_collection, init_visual_collection, init_memory_collection
        needs_reindex = await init_qdrant_collection()
        await init_visual_collection()
        await init_memory_collection()
    except Exception as e:
        logger.warning(f"Qdrant initialization failed (continuing): {e}")

    # Pre-load embedding model
    try:
        from openforge.core.embedding import get_embedding_model
        get_embedding_model()
    except Exception as e:
        logger.warning(f"Embedding model pre-load failed (will load on first use): {e}")

    # Load search reranking config from DB into in-memory flag
    try:
        from openforge.core.search_engine import SEARCH_RERANKING_KEY, set_reranking_enabled
        from openforge.services.config_service import config_service
        from openforge.services.automation_config import coerce_bool_setting
        from openforge.db.postgres import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            raw = await config_service.get_config_raw(db, SEARCH_RERANKING_KEY)
            if raw is not None:
                set_reranking_enabled(coerce_bool_setting(raw, True))
    except Exception as e:
        logger.debug(f"Search reranking config load skipped: {e}")

    # If the Qdrant collection was migrated, re-index all existing knowledge in background
    if needs_reindex:

        async def _reindex_all():
            try:
                from openforge.db.postgres import AsyncSessionLocal
                from openforge.db.models import Knowledge
                from sqlalchemy import select

                logger.info("Starting background re-indexing of all knowledge items after Qdrant migration.")
                async with AsyncSessionLocal() as db:
                    rows = (await db.execute(select(Knowledge))).scalars().all()

                from openforge.services.knowledge_processing_service import knowledge_processing_service
                for k in rows:
                    try:
                        await knowledge_processing_service._process_knowledge_background(
                            k.id, k.workspace_id, k.content or "", k.type or "note", k.title
                        )
                    except Exception as ke:
                        logger.warning("Re-index failed for knowledge %s: %s", k.id, ke)
                logger.info("Background re-indexing complete (%d items).", len(rows))
            except Exception as e:
                logger.error("Background re-indexing failed: %s", e)

        asyncio.create_task(_reindex_all())

    # Migrate Qdrant payloads from "standard" → "note" (idempotent)
    def _migrate_qdrant_standard_to_note():
        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            from openforge.db.qdrant_client import get_qdrant

            client = get_qdrant()
            collection = settings.qdrant_collection

            filt = Filter(must=[FieldCondition(key="knowledge_type", match=MatchValue(value="standard"))])
            offset = None
            migrated = 0
            while True:
                points, next_offset = client.scroll(
                    collection_name=collection, scroll_filter=filt, limit=100, offset=offset,
                )
                if not points:
                    break
                ids = [p.id for p in points]
                client.set_payload(
                    collection_name=collection,
                    payload={"knowledge_type": "note"},
                    points=ids,
                )
                migrated += len(ids)
                if next_offset is None:
                    break
                offset = next_offset
            if migrated:
                logger.info("Migrated %d Qdrant points from knowledge_type='standard' to 'note'.", migrated)
        except Exception as e:
            logger.warning("Qdrant standard→note migration skipped: %s", e)

    asyncio.create_task(asyncio.to_thread(_migrate_qdrant_standard_to_note))

    # Migrate Qdrant payloads from "xlsx" → "sheet" (idempotent)
    def _migrate_qdrant_xlsx_to_sheet():
        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            from openforge.db.qdrant_client import get_qdrant

            client = get_qdrant()
            collection = settings.qdrant_collection

            filt = Filter(must=[FieldCondition(key="knowledge_type", match=MatchValue(value="xlsx"))])
            offset = None
            migrated = 0
            while True:
                points, next_offset = client.scroll(
                    collection_name=collection, scroll_filter=filt, limit=100, offset=offset,
                )
                if not points:
                    break
                ids = [p.id for p in points]
                client.set_payload(
                    collection_name=collection,
                    payload={"knowledge_type": "sheet"},
                    points=ids,
                )
                migrated += len(ids)
                if next_offset is None:
                    break
                offset = next_offset
            if migrated:
                logger.info("Migrated %d Qdrant points from knowledge_type='xlsx' to 'sheet'.", migrated)
        except Exception as e:
            logger.warning("Qdrant xlsx→sheet migration skipped: %s", e)

    asyncio.create_task(asyncio.to_thread(_migrate_qdrant_xlsx_to_sheet))

    # Migrate Qdrant payloads from "docx" → "document" (idempotent)
    def _migrate_qdrant_docx_to_document():
        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            from openforge.db.qdrant_client import get_qdrant

            client = get_qdrant()
            collection = settings.qdrant_collection

            filt = Filter(must=[FieldCondition(key="knowledge_type", match=MatchValue(value="docx"))])
            offset = None
            migrated = 0
            while True:
                points, next_offset = client.scroll(
                    collection_name=collection, scroll_filter=filt, limit=100, offset=offset,
                )
                if not points:
                    break
                ids = [p.id for p in points]
                client.set_payload(
                    collection_name=collection,
                    payload={"knowledge_type": "document"},
                    points=ids,
                )
                migrated += len(ids)
                if next_offset is None:
                    break
                offset = next_offset
            if migrated:
                logger.info("Migrated %d Qdrant points from knowledge_type='docx' to 'document'.", migrated)
        except Exception as e:
            logger.warning("Qdrant docx→document migration skipped: %s", e)

    asyncio.create_task(asyncio.to_thread(_migrate_qdrant_docx_to_document))

    # Migrate Qdrant payloads from "pptx" → "slides" (idempotent)
    def _migrate_qdrant_pptx_to_slides():
        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            from openforge.db.qdrant_client import get_qdrant

            client = get_qdrant()
            collection = settings.qdrant_collection

            filt = Filter(must=[FieldCondition(key="knowledge_type", match=MatchValue(value="pptx"))])
            offset = None
            migrated = 0
            while True:
                points, next_offset = client.scroll(
                    collection_name=collection, scroll_filter=filt, limit=100, offset=offset,
                )
                if not points:
                    break
                ids = [p.id for p in points]
                client.set_payload(
                    collection_name=collection,
                    payload={"knowledge_type": "slides"},
                    points=ids,
                )
                migrated += len(ids)
                if next_offset is None:
                    break
                offset = next_offset
            if migrated:
                logger.info("Migrated %d Qdrant points from knowledge_type='pptx' to 'slides'.", migrated)
        except Exception as e:
            logger.warning("Qdrant pptx→slides migration skipped: %s", e)

    asyncio.create_task(asyncio.to_thread(_migrate_qdrant_pptx_to_slides))

    # Register system agents and load custom agents
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.core.agent_registry import (
            agent_registry, WORKSPACE_AGENT, ROUTER_AGENT, COUNCIL_AGENT, OPTIMIZER_AGENT,
        )

        for agent_def in [WORKSPACE_AGENT, ROUTER_AGENT, COUNCIL_AGENT, OPTIMIZER_AGENT]:
            agent_registry.register_system_agent(agent_def)
        async with AsyncSessionLocal() as db:
            for agent_def in [WORKSPACE_AGENT, ROUTER_AGENT, COUNCIL_AGENT, OPTIMIZER_AGENT]:
                await agent_registry.upsert_to_db(db, agent_def)
            await agent_registry.load_custom_agents(db)
        logger.info("Agent registry initialized.")
    except Exception as e:
        logger.warning("Agent registry initialization failed (continuing): %s", e)

    # Seed default tool permissions (idempotent — only inserts if table is empty)
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.db.models import ToolPermission
        from sqlalchemy import select, func

        async with AsyncSessionLocal() as db:
            count = (await db.execute(select(func.count()).select_from(ToolPermission))).scalar()
            if count == 0:
                # Irreversible-write tools → require HITL
                hitl_tools = [
                    "filesystem.delete_file",
                    "workspace.delete_knowledge",
                    "memory.forget",
                    "skills.remove",
                ]
                # Dangerous tools → require HITL
                dangerous_tools = [
                    "shell.execute",
                    "shell.execute_python",
                    "http.post",
                    "agent.invoke",
                ]
                for tool_id in hitl_tools + dangerous_tools:
                    db.add(ToolPermission(tool_id=tool_id, permission="hitl"))
                await db.commit()
                logger.info("Seeded default tool permissions (%d HITL rules).", len(hitl_tools) + len(dangerous_tools))
    except Exception as e:
        logger.warning("Tool permission seeding skipped: %s", e)

    # Enable agent mode on all existing workspaces (idempotent)
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.db.models import Workspace
        from sqlalchemy import update

        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Workspace).where(Workspace.agent_enabled == False).values(agent_enabled=True)
            )
            await db.commit()
    except Exception as e:
        logger.debug("Workspace agent_enabled migration skipped: %s", e)

    # Start Redis agent relay (bridges Celery worker events to WebSocket)
    relay_task = None
    try:
        from openforge.services.agent_relay import start_agent_relay
        relay_task = asyncio.create_task(start_agent_relay())
        logger.info("Agent relay started.")
    except Exception as e:
        logger.warning("Agent relay failed to start (continuing): %s", e)

    logger.info("OpenForge ready.")
    await task_scheduler.start()
    yield

    logger.info("OpenForge shutting down...")
    if relay_task:
        relay_task.cancel()
        try:
            await relay_task
        except asyncio.CancelledError:
            pass
    await task_scheduler.stop()
    try:
        from openforge.db.redis_client import close_redis
        await close_redis()
    except Exception:
        pass
    try:
        from openforge.db.postgres import engine
        await engine.dispose()
    except Exception:
        pass


app = FastAPI(
    title="OpenForge",
    description="Self-hosted AI workspace and knowledge management",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth middleware (added last = outermost; OPTIONS pass-through ensures CORS preflight works)
from openforge.middleware.auth import AuthMiddleware
app.add_middleware(AuthMiddleware)

# Health check endpoint
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}


# ── Global exception handlers ──
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation error",
            "type": "validation_error",
            "errors": exc.errors(),
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    if settings.log_level.lower() == "debug":
        logger.exception(f"Unhandled exception on {request.method} {request.url.path}")
        detail = traceback.format_exc()
    else:
        logger.error(f"Unhandled {type(exc).__name__} on {request.method} {request.url.path}: {exc}")
        detail = str(exc) if str(exc) else "An unexpected error occurred"
    return JSONResponse(
        status_code=500,
        content={"detail": detail, "type": "internal_error"},
    )


# Register auth router (separate prefix, not under /api/v1)
from openforge.api.auth import router as auth_router
app.include_router(auth_router)

# Register API router
from openforge.api.router import api_router
app.include_router(api_router)

# Register WebSocket router
from openforge.api.websocket import ws_router
app.include_router(ws_router)

# Register domain routers (Phase 1 architecture)
from openforge.domains import register_domain_routers
register_domain_routers(app)

# Serve static frontend files (production)
static_dir = Path(__file__).parent.parent.parent / "static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA for all non-API routes."""
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")
