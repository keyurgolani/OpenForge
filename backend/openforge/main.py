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
        from openforge.db.qdrant_client import init_qdrant_collection, init_memory_collection
        needs_reindex = await init_qdrant_collection()
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

    # Seed system agents (router, council, optimizer)
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.domains.agents.service import AgentService

        async with AsyncSessionLocal() as db:
            agent_service = AgentService(db)
            await agent_service.ensure_system_agents()
        logger.info("System agents seeded.")
    except Exception as e:
        logger.warning("System agent seeding skipped: %s", e)

    # Ensure the OpenForge Local system provider exists.
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.services.local_models import ensure_local_provider

        async with AsyncSessionLocal() as db:
            await ensure_local_provider(db)
        logger.info("OpenForge Local system provider ensured.")
    except Exception as e:
        logger.warning("OpenForge Local provider seeding skipped: %s", e)

    # Migrate old "ollama" system provider into the unified openforge-local provider.
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.db.models import LLMProvider, Config, Workspace
        from openforge.services.local_models import LOCAL_PROVIDER_ID
        from sqlalchemy import select, update
        import json as _json

        async with AsyncSessionLocal() as db:
            old_ollama = (await db.execute(
                select(LLMProvider).where(
                    LLMProvider.is_system == True,
                    LLMProvider.provider_name == "ollama",
                )
            )).scalar_one_or_none()

            if old_ollama is not None:
                old_id = old_ollama.id
                new_id = LOCAL_PROVIDER_ID
                old_id_str = str(old_id)
                new_id_str = str(new_id)
                logger.info(
                    "Migrating old ollama system provider %s → unified openforge-local %s",
                    old_id_str, new_id_str,
                )

                # 1. Migrate system_chat_models config entries
                cfg_row = (await db.execute(
                    select(Config).where(Config.key == "system_chat_models")
                )).scalar_one_or_none()
                if cfg_row and cfg_row.value:
                    raw = cfg_row.value
                    if isinstance(raw, str):
                        try:
                            raw = _json.loads(raw)
                        except (ValueError, TypeError):
                            raw = []
                    if isinstance(raw, list):
                        changed = False
                        for entry in raw:
                            if isinstance(entry, dict) and entry.get("provider_id") == old_id_str:
                                entry["provider_id"] = new_id_str
                                changed = True
                        if changed:
                            cfg_row.value = raw
                            logger.info("Migrated system_chat_models config entries to unified provider")

                # 2. Migrate system_vision_provider_id config
                vision_cfg = (await db.execute(
                    select(Config).where(Config.key == "system_vision_provider_id")
                )).scalar_one_or_none()
                if vision_cfg and vision_cfg.value:
                    val = vision_cfg.value
                    if isinstance(val, str):
                        val_str = val
                    else:
                        val_str = str(val)
                    if val_str == old_id_str:
                        vision_cfg.value = new_id_str
                        logger.info("Migrated system_vision_provider_id to unified provider")

                # 3. Migrate workspace llm_provider_id references
                await db.execute(
                    update(Workspace)
                    .where(Workspace.llm_provider_id == old_id)
                    .values(llm_provider_id=new_id)
                )

                # 4. Migrate workspace vision_provider_id references
                await db.execute(
                    update(Workspace)
                    .where(Workspace.vision_provider_id == old_id)
                    .values(vision_provider_id=new_id)
                )

                # 5. Delete the old ollama system provider record
                await db.delete(old_ollama)
                await db.commit()
                logger.info("Old ollama system provider migrated and deleted.")
    except Exception as e:
        logger.warning("Ollama→openforge-local migration skipped: %s", e)

    # Seed agent & automation templates
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.templates import (
            seed_agent_templates, seed_automation_templates, seed_skill_templates,
            seed_sink_templates, seed_mcp_recommendations,
        )

        async with AsyncSessionLocal() as db:
            await seed_agent_templates(db)
            await seed_automation_templates(db)
            await seed_skill_templates(db)
            await seed_sink_templates(db)
            await seed_mcp_recommendations(db)
        logger.info("Agent, automation, skill, sink, and MCP templates seeded.")
    except Exception as e:
        logger.warning("Template seeding skipped: %s", e)

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

    # Backfill: ensure every workspace has a default AgentModel
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.db.models import Workspace
        from openforge.domains.agents.service import AgentService
        from sqlalchemy import select as sa_select

        async with AsyncSessionLocal() as db:
            workspaces = (await db.execute(
                sa_select(Workspace).where(Workspace.default_agent_id == None)  # noqa: E711
            )).scalars().all()
            if workspaces:
                agent_service = AgentService(db)
                for ws in workspaces:
                    try:
                        agent = await agent_service.ensure_default_agent(ws.name)
                        ws.default_agent_id = agent["id"]
                    except Exception as ws_e:
                        logger.warning("Default agent backfill failed for workspace %s: %s", ws.id, ws_e)
                await db.commit()
                logger.info("Backfilled default agents for %d workspaces.", len(workspaces))
    except Exception as e:
        logger.warning("Workspace default agent backfill skipped: %s", e)

    # Clean up orphaned execution records from previous runs
    try:
        from openforge.db.postgres import AsyncSessionLocal
        from openforge.db.models import AgentExecution
        from sqlalchemy import update
        from datetime import datetime as dt_cls, timezone as tz_cls

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                update(AgentExecution)
                .where(AgentExecution.status.in_(["queued", "running"]))
                .values(
                    status="failed",
                    error_message="Execution interrupted by server restart",
                    completed_at=dt_cls.now(tz_cls.utc),
                )
            )
            if result.rowcount:
                await db.commit()
                logger.info("Cleaned up %d orphaned execution records.", result.rowcount)
    except Exception as e:
        logger.warning("Orphaned execution cleanup failed: %s", e)

    # ── Ollama health check background task ──────────────────────────────────
    async def _ollama_health_loop():
        """Ping Ollama every 60s and cache status in Redis."""
        import json
        import httpx
        from openforge.db.redis_client import get_redis

        while True:
            try:
                try:
                    async with httpx.AsyncClient(timeout=3.0) as client:
                        resp = await client.get(f"{settings.ollama_url}/api/tags")
                        resp.raise_for_status()
                        status = {"connected": True, "model_count": len(resp.json().get("models", []))}
                except Exception:
                    status = {"connected": False, "model_count": 0}
                try:
                    redis = await get_redis()
                    await redis.set("ollama:health", json.dumps(status), ex=120)
                except Exception as redis_err:
                    logger.debug("Ollama health cache write failed: %s", redis_err)
                logger.debug("Ollama health check: %s", status)
            except Exception as exc:
                logger.debug("Ollama health loop error: %s", exc)
            await asyncio.sleep(60)

    ollama_health_task = asyncio.create_task(_ollama_health_loop())

    logger.info("OpenForge ready.")
    await task_scheduler.start()
    yield

    logger.info("OpenForge shutting down...")
    ollama_health_task.cancel()
    try:
        await ollama_health_task
    except asyncio.CancelledError:
        pass
    await task_scheduler.stop()
    try:
        from openforge.db.redis_client import close_all_redis
        await close_all_redis()
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

# Request logging middleware (outermost — sees every request/response)
from openforge.middleware.request_logging import RequestLoggingMiddleware
app.add_middleware(RequestLoggingMiddleware)

# Auth middleware (OPTIONS pass-through ensures CORS preflight works)
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

# Register domain routers
from openforge.domains import register_domain_routers
register_domain_routers(app)

# Register admin API
from openforge.api.admin import router as admin_router
app.include_router(admin_router, prefix="/api/v1/admin", tags=["admin"])

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
