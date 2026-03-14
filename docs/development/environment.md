# OpenForge Environment Configuration

This document describes all environment variables used by OpenForge and their purpose.

## Quick Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `postgresql+asyncpg://...` | PostgreSQL connection URL |
| `QDRANT_URL` | No | `http://localhost:6333` | Qdrant vector DB URL |
| `REDIS_URL` | No | `redis://redis:6379/0` | Redis connection URL |
| `WORKSPACE_ROOT` | No | `/workspace` | Workspace files directory |
| `UPLOADS_ROOT` | No | `/uploads` | Uploaded files directory |
| `MODELS_ROOT` | No | `/models` | ML models directory |
| `PORT` | No | `3000` | Server port |
| `LOG_LEVEL` | No | `info` | Logging level (debug/info/warning/error) |
| `CORS_ORIGINS` | No | `*` | CORS allowed origins |
| `ENCRYPTION_KEY` | Recommended | (generated) | Fernet key for encrypting API keys |
| `ADMIN_PASSWORD` | No | (empty) | Admin password for login auth |
| `SESSION_EXPIRY_HOURS` | No | `168` | Session expiry in hours |
| `EMBEDDING_MODEL` | No | `BAAI/bge-small-en-v1.5` | Text embedding model |
| `EMBEDDING_DIMENSION` | No | `384` | Embedding dimension |
| `CLIP_MODEL` | No | `clip-ViT-B-32` | CLIP visual model |
| `CLIP_DIMENSION` | No | `512` | CLIP embedding dimension |
| `SEARCH_RERANKING_ENABLED` | No | `true` | Enable search reranking |
| `USE_CELERY_AGENTS` | No | `true` | Use Celery for agent execution |
| `TOOL_SERVER_URL` | No | `http://tool-server:8001` | Tool server URL |
| `MAIN_APP_URL` | No | `http://backend:3000` | Main app URL (for callbacks) |

## Detailed Descriptions

### Database Configuration

- **DATABASE_URL**: PostgreSQL connection string with asyncpg driver
  - Format: `postgresql+asyncpg://user:password@host:port/database`
  - Default: `postgresql+asyncpg://openforge:changeme@localhost:5432/openforge`

### Qdrant Vector Database

- **QDRANT_URL**: Qdrant server URL
- **QDRANT_COLLECTION**: Main knowledge collection name (default: `openforge_knowledge`)
- **QDRANT_VISUAL_COLLECTION**: Visual embeddings collection (default: `openforge_visual`)

### Redis Configuration

- **REDIS_URL**: Redis connection string
  - Used for caching, session storage, and Celery broker message broker

### Storage Paths

- **WORKSPACE_ROOT**: Directory for workspace files
- **UPLOADS_ROOT**: Directory for uploaded files
- **MODELS_ROOT**: Directory for ML models (Whisper, sentence-transformers)

### Security

- **ENCRYPTION_KEY**: Fernet encryption key for API keys stored in database
  - If not set, a new key is generated on first run
  - Generate with: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

- **ADMIN_PASSWORD**: Password for admin authentication
  - Leave empty to disable authentication
  - Use bcrypt hash: `python3 -c "import bcrypt; print(bcrypt.hashpw('yourpassword', bcrypt.gensalt()).decode())"`

### Embedding Models

- **EMBEDDING_MODEL**: HuggingFace model for text embeddings
  - Default: `BAAI/bge-small-en-v1.5`
- **EMBEDDING_DIMENSION**: Embedding vector dimension

### CLIP Models

- **CLIP_MODEL**: CLIP model for visual embeddings
  - Default: `clip-ViT-B-32`
- **CLIP_DIMENSION**: Visual embedding dimension

### Search Configuration

- **SEARCH_RERANKING_ENABLED**: Enable cross-encoder reranking for search results
  - Adds latency but improves relevance
  - Default: `true`

### Celery Configuration

- **USE_CELERY_AGENTS**: Whether to use Celery for agent execution
  - Default: `true`

### Tool Server

- **TOOL_SERVER_URL**: URL of the tool server container
- **MAIN_APP_URL**: URL for main app (used for callbacks from tool server)

## Docker Compose Variables

The following variables are used in the Docker Compose configuration (not in Settings class):

- **DB_PASSWORD**: PostgreSQL password
- **SESSION_EXPIRY_HOURS**: Session expiry in hours
- **SEARXNG_DATA_PATH**: SearXNG config directory

- **PORT**: Server port (default 3100)
- **LOG_LEVEL**: Logging level (default warning)
- **ENCRYPTION_KEY**: Fernet key
- **ADMIN_PASSWORD**: Admin password (leave empty to disable)
- **MODELS_HOST_PATH**: Persistent model storage path

- **WORKSPACE_HOST_PATH**: Workspace volume mount path
- **UPLOADS_HOST_PATH**: Upload volume mount path
- **POSTGRES_DATA_PATH**: PostgreSQL data directory
- **QDRANT_DATA_PATH**: Qdrant data directory

