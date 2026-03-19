# Configuration Reference

Complete reference for all OpenForge configuration options.

## Environment Variables

OpenForge is configured through environment variables defined in the `.env` file. Copy `.env.example` to `.env` and adjust values before starting.

### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_PASSWORD` | Yes | `changeme` | PostgreSQL database password. Change this before first startup. |
| `ENCRYPTION_KEY` | Recommended | (auto-generated) | Fernet symmetric encryption key for encrypting LLM provider API keys at rest. Generate with: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. If left empty, a new key is generated each restart, which breaks decryption of previously stored keys. |
| `ADMIN_PASSWORD` | No | (empty) | Admin password for login authentication. Leave empty to disable authentication entirely (suitable for local/trusted networks). Accepts plaintext or a bcrypt hash. Generate a hash with: `python3 -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"` |
| `SESSION_EXPIRY_HOURS` | No | `168` | JWT session expiry in hours. Default is 168 (7 days). |

### Network

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3100` | Host port the application is exposed on. The container always listens on port 3000 internally. |

### Storage Paths

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WORKSPACE_HOST_PATH` | No | `./data/workspace` | Host path for workspace files. Notes are stored as markdown files on disk. |
| `UPLOADS_HOST_PATH` | No | `./data/uploads` | Host path for user-uploaded files (PDFs, images, audio, etc.). |
| `POSTGRES_DATA_PATH` | No | `./data/postgres` | Host path for PostgreSQL data directory. |
| `QDRANT_DATA_PATH` | No | `./data/qdrant` | Host path for Qdrant vector database storage. |
| `MODELS_HOST_PATH` | No | `./data/models` | Host path for ML model cache (sentence-transformers, CLIP, Whisper). Models are downloaded once (~130MB for BGE-small) and reused across container rebuilds. Bind to a persistent host path to avoid re-downloading. |

### Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `warning` | Logging verbosity. Options: `debug`, `info`, `warning`, `error`. Use `debug` for development, `warning` for production. |

### Scaling

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CELERY_WORKERS` | No | `1` | Number of Celery worker container replicas. Increase for higher background task throughput. |

## Application Settings

These settings are configured through the PostgreSQL `config` table and managed via the **Settings** UI or API. They persist across restarts.

### Search

| Setting | Default | Description |
|---------|---------|-------------|
| Search Reranking | Enabled | Toggle cross-encoder reranking for search results. Improves relevance but adds latency. Uses ms-marco-MiniLM-L-6-v2. |

### Knowledge Intelligence

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-generate Intelligence | Configurable during onboarding | Automatically generate summaries, tags, and insights for new knowledge items. |
| Bookmark Content Extraction | Configurable during onboarding | Automatically extract content from bookmarked URLs. |

### Chat

| Setting | Default | Description |
|---------|---------|-------------|
| Trash Retention | 30 days | How long deleted conversations remain in trash before permanent deletion. Configurable 1-365 days. |

### LLM Provider Configuration

LLM providers are configured through the Settings UI:

1. **Provider Setup** — Add providers with API keys/URLs. Supported providers:
   - OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Mistral, OpenRouter, xAI, Cohere, ZhipuAI, HuggingFace
   - Ollama (local, no API key required)
   - Custom OpenAI-compatible endpoints
   - Custom Anthropic-compatible endpoints

2. **Virtual Providers** — Create composite providers:
   - **Router** — Load balance across multiple providers
   - **Council** — Multi-model ensemble for consensus responses
   - **Optimizer** — Prompt optimization before execution

3. **Model Assignments** — Assign specific models to capabilities:
   - Chat (primary conversation model)
   - Vision (image analysis)
   - Embedding (text embeddings — local BGE-small by default)
   - Speech-to-Text (audio transcription)
   - Text-to-Speech (audio generation)
   - CLIP (visual search — local ViT-B-32 by default)
   - PDF (document text extraction)

### Tool Permissions

Tool permissions are configured in Settings (tool permission overrides):

| Permission Level | Behavior |
|-----------------|----------|
| **Default** | Uses the tool's built-in risk level |
| **Allowed** | Tool executes without any approval |
| **Approval** | Tool pauses and waits for human approval before executing |
| **Blocked** | Tool is disabled and cannot be used |

Each tool has a default risk level (`low`, `medium`, `high`, `critical`) that informs the default permission.

Agent blueprints can also specify per-agent tool restrictions via the `tools` and `confirm_before` fields.

## Internal Configuration

These settings are used by the application internally and generally don't need to be changed. They are set automatically by Docker Compose.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://openforge:{DB_PASSWORD}@postgres:5432/openforge` | PostgreSQL connection string |
| `QDRANT_URL` | `http://qdrant:6333` | Qdrant vector database URL |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL |
| `TOOL_SERVER_URL` | `http://tool-server:8001` | Tool server endpoint |
| `MAIN_APP_URL` | `http://openforge:3000` | Backend self-reference URL (for tool server callbacks) |
| `WORKSPACE_ROOT` | `/workspace` | Container-internal workspace directory |
| `UPLOADS_ROOT` | `/uploads` | Container-internal uploads directory |
| `MODELS_ROOT` | `/models` | Container-internal model cache directory |
| `EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | Text embedding model (384 dimensions) |
| `EMBEDDING_DIMENSION` | `384` | Text embedding vector dimension |
| `CLIP_MODEL` | `clip-ViT-B-32` | CLIP visual embedding model (512 dimensions) |
| `CLIP_DIMENSION` | `512` | CLIP embedding vector dimension |
| `CORS_ORIGINS` | `*` | CORS allowed origins |
| `USE_CELERY_AGENTS` | `true` | Whether to use Celery for agent execution |
| `SEARXNG_URL` | `http://searxng:8080` | SearXNG web search endpoint |

## Docker Compose Services

The default `docker-compose.yml` defines these services:

| Service | Port | Description |
|---------|------|-------------|
| `openforge` | 3100 (host) -> 3000 (container) | Main backend + frontend |
| `celery-worker` | -- | Background task worker |
| `tool-server` | 8001 (internal) | Tool execution microservice |
| `postgres` | 5432 (internal) | PostgreSQL database |
| `qdrant` | 6333 (internal) | Qdrant vector database |
| `redis` | 6379 (internal) | Redis message broker and cache |
| `searxng` | 8080 (internal) | Web search engine |

Only the main `openforge` service is exposed to the host. All other services communicate over the internal Docker network.

---

*For deployment instructions, see [Deployment](deployment.md). For architecture details, see [Architecture](architecture.md).*
