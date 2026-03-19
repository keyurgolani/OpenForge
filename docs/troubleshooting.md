# Troubleshooting

Common issues and solutions for OpenForge.

## Startup Issues

### Application won't start

**Symptom:** `docker compose up` fails or containers keep restarting.

**Check:**
```bash
docker compose ps
docker compose logs openforge
```

**Common causes:**
- PostgreSQL not ready yet — the backend waits for a healthy database. Give it 30-60 seconds on first start.
- Port conflict — another service is using port 3100. Change the `PORT` variable in `.env`.
- Insufficient memory — OpenForge needs at least 4 GB RAM. Check with `docker stats`.

### Embedding model download takes a long time

**Symptom:** First startup hangs for several minutes.

**Explanation:** On first run, OpenForge downloads the BGE-small embedding model (~130 MB). This only happens once if you set `MODELS_HOST_PATH` to a persistent directory.

**Fix:** Wait for the download to complete. Set `MODELS_HOST_PATH` in `.env` to a persistent path to cache models across container rebuilds.

### Database connection errors

**Symptom:** Logs show `connection refused` or `could not translate host name "postgres"`.

**Check:**
```bash
docker compose logs postgres
docker compose exec postgres pg_isready
```

**Fix:** Ensure the `postgres` service is running and healthy. If you changed `DB_PASSWORD`, make sure it matches in all configuration.

---

## Chat and Agent Issues

### Agent not responding

**Symptom:** Messages are sent but no response appears.

**Common causes:**
1. **No LLM provider configured** — Go to Settings > AI Models and add at least one provider.
2. **Invalid API key** — Click "Test Connection" on your provider to verify the key works.
3. **Celery worker not running** — Check `docker compose logs celery-worker`. The worker must be healthy for background agent execution.

### Agent compilation failed

**Symptom:** Agent shows "compilation failed" status.

**Common causes:**
1. **Blueprint syntax error** — Check the agent detail page for the `compilation_error` field. Fix the YAML frontmatter or Markdown body.
2. **Database issue** — Check backend logs for compilation errors: `docker compose logs openforge | grep "compiler"`.

**Fix:** Edit the agent blueprint to fix syntax issues. Compilation re-triggers automatically on save.

### Responses are slow

**Symptom:** Agent takes a long time to respond.

**Common causes:**
1. **Slow LLM provider** — Some providers have higher latency. Try a different provider or model.
2. **Large knowledge base** — Search and context assembly take longer with more data. This is normal.
3. **Reranking enabled** — Cross-encoder reranking adds latency but improves relevance. Disable in Settings if speed is more important.
4. **First response after restart** — The embedding model loads on first use. Subsequent queries are faster.

### Tool calls failing

**Symptom:** Agent reports tool execution errors.

**Check:**
```bash
docker compose logs tool-server
```

**Common causes:**
1. **Tool server not running** — Restart with `docker compose restart tool-server`.
2. **Tool blocked by permission** — Check Settings for blocked tools.
3. **Workspace path issues** — Ensure workspace volumes are correctly mounted.

### WebSocket disconnections

**Symptom:** Chat streaming stops mid-response, or connection drops.

**Common causes:**
1. **Reverse proxy timeout** — If using nginx, set `proxy_read_timeout 3600s` for the `/ws/` location.
2. **Network instability** — The frontend auto-reconnects with exponential backoff. Wait a moment.
3. **Backend restart** — If the backend restarts, WebSocket connections are dropped. Refresh the page.

### Strategy execution errors

**Symptom:** Strategy-based runs (researcher, builder, etc.) fail.

**Common causes:**
1. **Strategy not registered** — Ensure the strategy name in the blueprint matches a registered strategy. Available: chat, researcher, reviewer, builder, watcher, coordinator.
2. **Missing provider config** — Strategy runs need a valid LLM provider resolved for the workspace.

**Check:**
```bash
docker compose logs openforge | grep "strategy"
docker compose logs celery-worker | grep "strategy"
```

---

## Knowledge Issues

### Knowledge not appearing in search

**Symptom:** You've added knowledge but search returns no results.

**Common causes:**
1. **Processing not complete** — Knowledge needs to be chunked and embedded before it's searchable. Check if the knowledge item shows a processing spinner.
2. **Wrong workspace** — Search is scoped to the current workspace. Make sure you're in the right one.
3. **Qdrant not ready** — Check `docker compose logs qdrant`.

**Fix:** Try reprocessing the knowledge item from its context menu (right-click > Reprocess).

### File upload failures

**Symptom:** Uploading PDFs, images, or other files fails.

**Check:**
```bash
docker compose logs openforge | grep -i "upload\|error"
```

**Common causes:**
1. **File too large** — The default max file size is 50 MB.
2. **Unsupported format** — Supported formats: PDF, DOCX, XLSX, PPTX, JPEG, PNG, MP3, WAV.
3. **Disk full** — Check available disk space for the uploads volume.

### Bookmark extraction not working

**Symptom:** Bookmarks are saved but content is not extracted.

**Common causes:**
1. **Auto-extraction disabled** — Enable it in Settings > Pipelines or during onboarding.
2. **Site blocks crawling** — Some websites block automated content extraction.
3. **SearXNG not running** — Some extraction flows use the SearXNG service. Check `docker compose logs searxng`.

---

## Automation Issues

### Automation not triggering

**Symptom:** Automation is configured but runs are not being created.

**Common causes:**
1. **Wrong status** — Automation must be in "active" state. Check if it's still in "draft" or "paused".
2. **Budget exhausted** — Check if `max_runs_per_day` or `max_concurrent_runs` limits have been reached.
3. **Cooldown active** — After a failure, the `cooldown_seconds_after_failure` setting may be preventing new runs.
4. **Agent not found** — The referenced agent slug must exist and have a compiled spec.

### Automation runs failing

**Symptom:** Automation triggers but runs end in "failed" status.

**Check:** View the run detail page for the error message and timeline.

**Common causes:**
1. **Agent compilation outdated** — Recompile the agent by editing and saving its blueprint.
2. **Provider not available** — The LLM provider may be down or the API key expired.
3. **Token budget exceeded** — The automation's `max_token_budget_per_day` may have been reached.

---

## Output Issues

### Outputs not being created

**Symptom:** Runs complete but no outputs appear.

**Common causes:**
1. **Strategy doesn't emit outputs** — Not all strategies produce outputs. The builder strategy is designed for output creation.
2. **Output routing not configured** — Check the automation's output routing config.

### Output versioning issues

**Symptom:** Output versions are not being created as expected.

**Fix:** Check the output detail page for version history. Each material change should create a new version. If versions are missing, check the backend logs for errors in the versioning system.

---

## Security and Authentication

### "Decryption failed" errors

**Symptom:** Previously working LLM providers show decryption errors.

**Cause:** The `ENCRYPTION_KEY` in `.env` changed between restarts. All API keys are encrypted with this key.

**Fix:**
1. Restore the original `ENCRYPTION_KEY` from your backup.
2. If the original key is lost, delete the affected providers in Settings and re-add them with fresh API keys.

**Prevention:** Always set and persist `ENCRYPTION_KEY` in `.env`. Generate with:
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Can't log in

**Symptom:** Login page appears but password is rejected.

**Common causes:**
1. **Wrong password** — The `ADMIN_PASSWORD` in `.env` can be plaintext or a bcrypt hash. Verify it matches.
2. **Session expired** — Default session expiry is 7 days. Clear cookies and try again.

**Fix:** If you've forgotten the password, update `ADMIN_PASSWORD` in `.env` and restart:
```bash
docker compose restart openforge
```

### Authentication bypass

**Symptom:** No login page appears even though you set `ADMIN_PASSWORD`.

**Check:** Ensure `ADMIN_PASSWORD` is set in `.env` (not empty) and the backend was restarted after the change.

---

## Performance Issues

### High memory usage

**Symptom:** Docker containers consuming excessive RAM.

**Explanation:** OpenForge loads ML models (embedding, CLIP, optional Whisper) into memory. Expected baseline:
- Backend: 1-2 GB (with embedding model loaded)
- Celery Worker: 1-2 GB
- Qdrant: 200 MB - 1 GB (depending on knowledge base size)
- PostgreSQL: 100-300 MB
- Redis: 50-100 MB

**Fix:** If memory is constrained:
1. Don't enable optional models (Whisper, CLIP) unless needed.
2. Reduce `CELERY_WORKERS` to 1.
3. Ensure Docker has sufficient memory allocated (4 GB minimum, 8 GB recommended).

### Slow search

**Symptom:** Search queries take several seconds.

**Common causes:**
1. **Reranking enabled** — Disable cross-encoder reranking in Settings for faster (but potentially less relevant) results.
2. **Large knowledge base** — With 50K+ knowledge items, consider running Qdrant on an SSD.
3. **Qdrant resource limits** — Increase the Qdrant memory limit in `docker-compose.yml` if needed.

---

## Docker Issues

### Container logs

View logs for any service:
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f openforge
docker compose logs -f celery-worker
docker compose logs -f tool-server
docker compose logs -f postgres
docker compose logs -f qdrant
docker compose logs -f redis
```

### Rebuilding containers

After code changes or updates:
```bash
# Rebuild all
docker compose build
docker compose up -d

# Rebuild specific service
docker compose build openforge
docker compose up -d openforge

# Rebuild tool server after tool changes
docker compose build tool-server && docker compose up -d tool-server
# Then sync tools:
curl -X POST http://localhost:3100/api/v1/tools/sync
```

### Resetting data

To start completely fresh:
```bash
docker compose down -v
rm -rf ./data
docker compose up -d
```

> **Warning:** This permanently deletes all data including knowledge, conversations, agents, automations, and settings.

### Volume permissions

**Symptom:** Permission denied errors when writing to mounted volumes.

**Fix:** Ensure the data directories exist and are writable:
```bash
mkdir -p data/workspace data/uploads data/postgres data/qdrant data/models data/redis
chmod -R 777 data/
```

---

## Getting Help

If your issue isn't covered here:

1. Check the container logs for specific error messages
2. Open an issue on GitHub with:
   - The error message or behavior you're experiencing
   - Your Docker Compose version (`docker compose version`)
   - Your OS and Docker version
   - Relevant log output (`docker compose logs <service>`)

---

*For configuration reference, see [Configuration](configuration.md). For deployment instructions, see [Deployment](deployment.md).*
