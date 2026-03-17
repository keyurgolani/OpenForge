# Deployment Guide

Instructions for deploying OpenForge in production environments.

## Prerequisites

- **Docker Engine 24+** with Docker Compose v2
- **4 GB RAM minimum** (8 GB recommended)
- **10 GB disk space** for application, models, and data
- A domain name (optional, for HTTPS access)

## Quick Deploy

```bash
# Clone the repository
git clone https://github.com/OpenForge-AI/OpenForge.git
cd OpenForge

# Configure environment
cp .env.example .env
```

Edit `.env` and set the required values:

```bash
# REQUIRED: Set a strong database password
DB_PASSWORD=your_secure_password_here

# REQUIRED: Generate and set an encryption key (critical for API key persistence)
# python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=your_generated_key_here

# OPTIONAL: Set a password to enable login authentication
# Leave empty to disable (suitable for local/trusted networks)
ADMIN_PASSWORD=
```

Start all services:

```bash
docker compose up -d
```

Wait approximately 30-60 seconds for the embedding model to download on first startup, then open your browser:

```
http://localhost:3100
```

Verify the backend is healthy:

```bash
curl http://localhost:3100/api/health
```

## Environment Variables

### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_PASSWORD` | Yes | `changeme` | PostgreSQL database password |
| `ENCRYPTION_KEY` | Recommended | (auto-generated) | Fernet symmetric encryption key for API keys at rest. If left empty, a new key is generated each restart, which **breaks decryption of previously stored API keys**. Generate with: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `ADMIN_PASSWORD` | No | (empty) | Password for login authentication. Accepts plaintext or bcrypt hash. Empty = auth disabled. Generate hash with: `python3 -c "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt()).decode())"` |
| `SESSION_EXPIRY_HOURS` | No | `168` | Session expiry in hours (default 7 days) |

### Network

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3100` | Host port the application is exposed on |

### Storage Paths

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WORKSPACE_HOST_PATH` | No | `./data/workspace` | Host path for workspace files (markdown notes stored on disk) |
| `UPLOADS_HOST_PATH` | No | `./data/uploads` | Host path for user file uploads |
| `POSTGRES_DATA_PATH` | No | `./data/postgres` | Host path for PostgreSQL data |
| `QDRANT_DATA_PATH` | No | `./data/qdrant` | Host path for Qdrant vector store |
| `MODELS_HOST_PATH` | No | `./data/models` | Host path for ML model cache (embedding models, ~130MB). Bind to a persistent path to avoid re-downloading across container rebuilds. |

### Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `warning` | Logging verbosity: `debug`, `info`, `warning`, `error` |

### Scaling

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CELERY_WORKERS` | No | `1` | Number of background worker replicas |

## Reverse Proxy (HTTPS)

For production deployments, place OpenForge behind a reverse proxy with HTTPS.

### nginx Configuration

```nginx
server {
    listen 80;
    server_name openforge.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name openforge.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/openforge.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/openforge.yourdomain.com/privkey.pem;

    client_max_body_size 100M;

    # WebSocket support (required for real-time chat streaming)
    location /ws/ {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://localhost:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Obtain an SSL certificate with Certbot:

```bash
sudo certbot --nginx -d openforge.yourdomain.com
```

> **Important:** The WebSocket `proxy_read_timeout` must be set high (3600s recommended) to prevent chat streaming disconnections during long agent responses.

## Updating

```bash
git pull
docker compose build
docker compose up -d
```

Database migrations run automatically on startup via Alembic. No manual migration steps are needed.

## Backup and Restore

### PostgreSQL

```bash
# Backup
docker compose exec postgres pg_dump -U openforge openforge > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260315.sql | docker compose exec -T postgres psql -U openforge openforge
```

### Workspace Files

```bash
# Backup
tar -czf workspace_backup_$(date +%Y%m%d).tar.gz ./data/workspace

# Restore
tar -xzf workspace_backup_20260315.tar.gz
```

### Qdrant Vectors

Vector embeddings can be regenerated from knowledge data, so backing up PostgreSQL is sufficient. If you want to avoid the regeneration time:

```bash
# Backup
cp -r ./data/qdrant ./data/qdrant_backup_$(date +%Y%m%d)

# Restore
cp -r ./data/qdrant_backup_20260315 ./data/qdrant
```

### Full Backup

```bash
# Stop services first for a consistent snapshot
docker compose stop

# Backup everything
tar -czf openforge_full_backup_$(date +%Y%m%d).tar.gz \
    ./data/postgres \
    ./data/qdrant \
    ./data/workspace \
    ./data/uploads \
    .env

# Restart
docker compose up -d
```

## Resource Requirements

| Workload | Minimum RAM | Recommended | Disk |
|----------|-------------|-------------|------|
| Personal (1-5K knowledge items) | 4 GB | 4 GB | 10 GB |
| Medium (5-50K knowledge items) | 4 GB | 8 GB | 25 GB |
| Large (50K+ knowledge items) | 8 GB | 16 GB + SSD | 50 GB+ |

### Container Memory Limits

The Docker Compose configuration sets these memory limits:

| Service | Limit |
|---------|-------|
| Backend | 4 GB |
| Celery Worker | 4 GB (per worker) |
| PostgreSQL | 512 MB |
| Qdrant | 1 GB |
| Redis | 256 MB |
| Tool Server | 512 MB |
| SearXNG | 512 MB |

## Monitoring

### Health Check

```bash
curl http://localhost:3100/api/health
```

### Container Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f openforge
docker compose logs -f celery-worker
docker compose logs -f tool-server
```

### Service Status

```bash
docker compose ps
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Agent not responding | No LLM provider configured | Complete onboarding or add a provider in Settings |
| Slow first response | Embedding model downloading/loading | Wait 60 seconds on first startup |
| `decryption failed` error | `ENCRYPTION_KEY` changed between restarts | Restore the original key from backup, or re-enter API keys in Settings |
| WebSocket disconnects | Reverse proxy timeout too low | Set `proxy_read_timeout 3600s` in nginx |
| High memory usage | Embedding model in memory | Normal — BGE-small needs ~300MB. Ensure sufficient RAM. |
| Chat not streaming | Redis connection issue | Check `docker compose logs redis` and verify Redis is healthy |
| Tool execution failures | Tool server not running | Check `docker compose logs tool-server` |
| Search returns no results | Knowledge not yet indexed | Wait for background processing or trigger reprocessing from the knowledge item |

---

*For architecture details, see [Architecture](architecture.md). For development setup, see [Development](development.md).*
