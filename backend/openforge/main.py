import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path

from openforge.config import get_settings

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

    # Initialize Qdrant collection
    try:
        from openforge.db.qdrant_client import init_qdrant_collection
        await init_qdrant_collection()
    except Exception as e:
        logger.warning(f"Qdrant initialization failed (continuing): {e}")

    # Pre-load embedding model
    try:
        from openforge.core.embedding import get_embedding_model
        get_embedding_model()
    except Exception as e:
        logger.warning(f"Embedding model pre-load failed (will load on first use): {e}")

    logger.info("OpenForge ready.")
    yield

    logger.info("OpenForge shutting down...")
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
