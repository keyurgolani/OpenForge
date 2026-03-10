from fastapi import APIRouter, Response, Request, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


def _verify_password(plain: str, stored: str) -> bool:
    """Verify password against stored value (bcrypt hash or plaintext)."""
    if stored.startswith(("$2b$", "$2a$", "$2y$")):
        import bcrypt
        return bcrypt.checkpw(plain.encode(), stored.encode())
    # Plaintext fallback
    return plain == stored


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    from openforge.config import get_settings
    settings = get_settings()

    if not settings.admin_password:
        return {"authenticated": True, "auth_enabled": False}

    if not _verify_password(body.password, settings.admin_password):
        raise HTTPException(status_code=401, detail="Invalid password")

    secret = settings.encryption_key or "openforge-fallback-secret"
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.session_expiry_hours)
    token = _encode_token(secret, exp)

    response.set_cookie(
        "openforge_session",
        token,
        httponly=True,
        samesite="lax",
        max_age=settings.session_expiry_hours * 3600,
    )
    return {"authenticated": True, "auth_enabled": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("openforge_session", samesite="lax")
    return {"ok": True}


@router.get("/check")
async def check(request: Request):
    from openforge.config import get_settings
    settings = get_settings()

    if not settings.admin_password:
        return {"authenticated": True, "auth_enabled": False}

    token = request.cookies.get("openforge_session")
    if not token:
        return {"authenticated": False, "auth_enabled": True}

    try:
        from jose import jwt, JWTError
        secret = settings.encryption_key or "openforge-fallback-secret"
        jwt.decode(token, secret, algorithms=["HS256"])
        return {"authenticated": True, "auth_enabled": True}
    except Exception:
        return {"authenticated": False, "auth_enabled": True}


def _encode_token(secret: str, exp: datetime) -> str:
    from jose import jwt
    return jwt.encode({"sub": "admin", "exp": exp}, secret, algorithm="HS256")
