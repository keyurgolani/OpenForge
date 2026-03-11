import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path

from openforge.config import get_settings
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
        from openforge.db.qdrant_client import init_qdrant_collection, init_visual_collection
        needs_reindex = await init_qdrant_collection()
        await init_visual_collection()
    except Exception as e:
        logger.warning(f"Qdrant initialization failed (continuing): {e}")

    # Pre-load embedding model
    try:
        from openforge.core.embedding import get_embedding_model
        get_embedding_model()
    except Exception as e:
        logger.warning(f"Embedding model pre-load failed (will load on first use): {e}")

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
                            k.id, k.workspace_id, k.content or "", k.type or "standard", k.title
                        )
                    except Exception as ke:
                        logger.warning("Re-index failed for knowledge %s: %s", k.id, ke)
                logger.info("Background re-indexing complete (%d items).", len(rows))
            except Exception as e:
                logger.error("Background re-indexing failed: %s", e)

        asyncio.create_task(_reindex_all())

    # Register system agents and load custom agents
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.core.agent_registry import agent_registry, WORKSPACE_AGENT

        agent_registry.register_system_agent(WORKSPACE_AGENT)
        async with AsyncSessionLocal() as db:
            await agent_registry.upsert_to_db(db, WORKSPACE_AGENT)
            await agent_registry.load_custom_agents(db)
        logger.info("Agent registry initialized.")
    except Exception as e:
        logger.warning("Agent registry initialization failed (continuing): %s", e)

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
    version="0.1.0",
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
