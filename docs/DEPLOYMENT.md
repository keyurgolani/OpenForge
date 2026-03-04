# OpenForge — Deployment Guide

## Prerequisites

- Docker Engine 24+ (with Docker Compose v2)
- Minimum 4 GB RAM (8 GB recommended for larger embedding models)
- A server or machine with ports 3000 accessible

---

## 1. Initial Setup

```bash
git clone https://github.com/youruser/openforge.git
cd openforge
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
DB_PASSWORD=your_secure_password_here

# Generate ENCRYPTION_KEY and paste it (important for persistence):
# python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=your_generated_key_here
```

---

## 2. Starting OpenForge

```bash
docker compose up -d
```

Wait ~30 seconds for the embedding model to download on first startup, then:

```bash
curl http://localhost:3000/api/health
# → {"status": "ok", "version": "0.1.0"}
```

Visit `http://localhost:3000` in your browser.

---

## 3. Reverse Proxy (nginx — HTTPS recommended)

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

    # WebSocket support (required for chat streaming)
    location /ws/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Get an SSL certificate with Certbot:
```bash
certbot --nginx -d openforge.yourdomain.com
```

---

## 4. Updating

```bash
git pull
docker compose build
docker compose up -d
```

Migrations run automatically on startup via Alembic.

---

## 5. Backup Strategy

**PostgreSQL:**
```bash
docker compose exec postgres pg_dump -U openforge openforge > backup_$(date +%Y%m%d).sql
```

**Qdrant vectors:**
```bash
# Vectors are regenerated from notes on demand — just back up PostgreSQL
# But if you want to back up qdrant storage:
cp -r ./data/qdrant ./data/qdrant_backup_$(date +%Y%m%d)
```

**Workspace files:**
```bash
tar -czf workspace_backup_$(date +%Y%m%d).tar.gz ./data/workspace
```

---

## 6. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Chat not working | No LLM provider configured | Go to Settings → Add Provider |
| Slow first response | Embedding model loading | Wait 60s on first start |
| `decryption failed` error | `ENCRYPTION_KEY` changed | Restore original key from backup |
| WebSocket disconnects | Nginx `proxy_read_timeout` too low | Set to 3600s (see nginx config above) |
| High memory usage | Large notes being embedded | Normal — bge-small needs ~300MB RAM |

---

## 7. Resource Requirements

| Workload | Minimum RAM | Recommended |
|---|---|---|
| Personal (1-5k notes) | 2 GB | 4 GB |
| Team (5-50k notes) | 4 GB | 8 GB |
| Large (50k+ notes) | 8 GB | 16 GB + SSD |
