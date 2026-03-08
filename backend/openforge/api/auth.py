"""Admin password authentication."""
from fastapi import APIRouter, Response, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import logging

logger = logging.getLogger("openforge.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

_password_hash_cache: bytes | None = None


class LoginRequest(BaseModel):
    password: str


def _get_cached_hash(password: str) -> bytes:
    """Get or compute bcrypt hash for the admin password."""
    global _password_hash_cache
    if _password_hash_cache is None:
        import bcrypt
        _password_hash_cache = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    return _password_hash_cache


@router.post("/login")
async def login(request: LoginRequest, response: Response):
    from openforge.config import get_settings
    import bcrypt
    import jose.jwt

    settings = get_settings()
    if not settings.admin_password:
        # No auth configured - return authenticated
        return {"authenticated": True, "auth_required": False}

    if not bcrypt.checkpw(request.password.encode(), _get_cached_hash(settings.admin_password)):
        raise HTTPException(401, "Invalid password")

    expiry = datetime.now(timezone.utc) + timedelta(hours=settings.session_expiry_hours)
    token = jose.jwt.encode(
        {"exp": expiry, "iat": datetime.now(timezone.utc)},
        settings.encryption_key or "default-insecure-key",
        algorithm="HS256",
    )

    response.set_cookie(
        key="openforge_session",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.session_expiry_hours * 3600,
        path="/",
    )
    return {"authenticated": True, "auth_required": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("openforge_session", path="/")
    return {"authenticated": False}


@router.get("/check")
async def check_auth(request: Request):
    from openforge.config import get_settings
    settings = get_settings()
    if not settings.admin_password:
        return {"authenticated": True, "auth_required": False}
    token = request.cookies.get("openforge_session")
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        import jose.jwt
        jose.jwt.decode(token, settings.encryption_key or "default-insecure-key", algorithms=["HS256"])
        return {"authenticated": True, "auth_required": True}
    except Exception:
        raise HTTPException(401, "Session expired or invalid")
