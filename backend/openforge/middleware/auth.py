from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from jose import jwt, JWTError

from openforge.config import get_settings

# Paths that never require authentication
PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/check",
    "/api/health",
}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        settings = get_settings()

        # Always pass OPTIONS through so CORS preflight works
        if request.method == "OPTIONS":
            return await call_next(request)

        # Auth is disabled when admin_password is not set
        if not settings.admin_password:
            return await call_next(request)

        # Public paths bypass auth
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        # WebSocket connections handle auth themselves
        if request.url.path.startswith("/ws/"):
            return await call_next(request)

        token = request.cookies.get("openforge_session")
        if not token:
            return self._unauth_response("Not authenticated")

        try:
            secret = settings.encryption_key or "openforge-fallback-secret"
            jwt.decode(token, secret, algorithms=["HS256"])
        except JWTError:
            return self._unauth_response("Invalid or expired session")

        return await call_next(request)

    def _unauth_response(self, detail: str) -> JSONResponse:
        resp = JSONResponse({"detail": detail}, status_code=401)
        # Ensure CORS headers are present so the browser sees the 401
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        return resp
