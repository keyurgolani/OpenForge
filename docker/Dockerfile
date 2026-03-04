# ── Stage 1: Build frontend ──
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Skip tsc type-checking in Docker (checked locally); just bundle with vite
RUN npx vite build

# ── Stage 2: Production image ──
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (curl needed for HEALTHCHECK)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend assets
# Vite outDir is '../static' relative to frontend/, so the build outputs to /app/static/
COPY --from=frontend-build /app/static ./static/

# Create workspace, uploads, and model cache directories
RUN mkdir -p /workspace /uploads /models

# Set Python path
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1
# HuggingFace / sentence-transformers model cache — mount this as a volume
# so models survive container rebuilds (avoids re-downloading the ~130MB bge model)
ENV HF_HOME=/models
ENV SENTENCE_TRANSFORMERS_HOME=/models

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["uvicorn", "openforge.main:app", "--host", "0.0.0.0", "--port", "3000"]
