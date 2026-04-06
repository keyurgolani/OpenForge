.PHONY: test test-backend test-frontend test-tool-server lint typecheck build dev clean

# ── Testing ──────────────────────────────────────────────────────────────────

test: test-backend test-frontend  ## Run all tests
	@echo "All tests passed."

test-backend:  ## Run backend pytest suite
	cd backend && python -m pytest tests/ --tb=short -q

test-frontend:  ## Run frontend vitest suite
	cd frontend && npx vitest run

test-tool-server:  ## Run tool server tests
	cd tool_server && python -m pytest tests/ --tb=short -q

test-backend-cov:  ## Run backend tests with coverage report
	cd backend && python -m pytest tests/ --tb=short --cov-report=html

# ── Linting & Type Checking ─────────────────────────────────────────────────

lint:  ## Run frontend linter
	cd frontend && npm run lint

typecheck:  ## Run TypeScript type checking
	cd frontend && npm run typecheck

# ── Docker ───────────────────────────────────────────────────────────────────

build:  ## Build all Docker images
	docker compose build

dev:  ## Start development environment
	docker compose -f docker-compose.dev.yml up

up:  ## Start production environment
	docker compose up -d

down:  ## Stop all containers
	docker compose down

# ── Docker Testing ───────────────────────────────────────────────────────────

docker-test:  ## Run tests inside Docker containers
	docker compose -f docker-compose.test.yml run --rm backend-test
	docker compose -f docker-compose.test.yml run --rm frontend-test
	docker compose -f docker-compose.test.yml down

# ── Utilities ────────────────────────────────────────────────────────────────

clean:  ## Remove build artifacts and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -prune -o -type d -name dist -exec rm -rf {} + 2>/dev/null || true
	rm -rf backend/htmlcov backend/.coverage

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
