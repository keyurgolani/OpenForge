# ── Stage 1: Build frontend ──
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production image ──
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./static/

# Create workspace directory
RUN mkdir -p /workspace /uploads

# Set Python path
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1

EXPOSE 3000

HEALTHCHECK CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["uvicorn", "openforge.main:app", "--host", "0.0.0.0", "--port", "3000"]
