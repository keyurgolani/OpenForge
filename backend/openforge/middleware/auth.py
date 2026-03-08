"""Auth middleware for OpenForge."""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

PUBLIC_PATHS = {"/api/auth/login", "/api/auth/logout", "/api/auth/check", "/api/health"}
PUBLIC_PREFIXES = ("/assets/", "/_app/", "/fonts/", "/icons/", "/manifest.json", "/favicon")


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        from openforge.config import get_settings
        settings = get_settings()

        if not settings.admin_password:
            return await call_next(request)

        path = request.url.path

        if path in PUBLIC_PATHS or any(path.startswith(p) for p in PUBLIC_PREFIXES):
            return await call_next(request)

        token = request.cookies.get("openforge_session")
        if not token:
            if path.startswith("/api/") or path.startswith("/ws/"):
                return JSONResponse({"detail": "Not authenticated"}, status_code=401)
            return await call_next(request)

        try:
            import jose.jwt
            jose.jwt.decode(token, settings.encryption_key or "default-insecure-key", algorithms=["HS256"])
        except Exception:
            if path.startswith("/api/") or path.startswith("/ws/"):
                return JSONResponse({"detail": "Session expired"}, status_code=401)
            return await call_next(request)

        return await call_next(request)
