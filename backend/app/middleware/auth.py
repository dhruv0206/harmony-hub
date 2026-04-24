"""Supabase JWT verification.

Supports both modern ES256 (asymmetric, via JWKS) and legacy HS256 (shared secret).
The algorithm is detected from the token header and dispatched accordingly.

ES256 path: public keys are fetched from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`
and cached by PyJWKClient (1h lifespan by default). No shared secret needed.

HS256 path: uses `SUPABASE_JWT_SECRET` from env (only needed for legacy projects).
"""

from dataclasses import dataclass

import jwt
from fastapi import Request
from jwt import PyJWKClient

from ..config import settings
from ..errors import UnauthorizedError


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    role: str | None  # 'admin' | 'sales_rep' | 'provider' | 'law_firm' | None


def _extract_role(payload: dict) -> str | None:
    """Role may live in app_metadata (preferred) or user_metadata (fallback)."""
    app_meta = payload.get("app_metadata") or {}
    user_meta = payload.get("user_metadata") or {}
    return (
        app_meta.get("role")
        or user_meta.get("role")
        or payload.get("role")
    )


_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient | None:
    """Lazy singleton for the JWKS client. Requires SUPABASE_URL."""
    global _jwks_client
    if _jwks_client is None:
        if not settings.SUPABASE_URL:
            return None
        jwks_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(
            jwks_url,
            cache_keys=True,
            lifespan=3600,  # JWKS rotations are rare; 1h cache is safe
        )
    return _jwks_client


def _verify_asymmetric(token: str, alg: str) -> dict:
    jwks = _get_jwks_client()
    if jwks is None:
        raise UnauthorizedError("JWKS client not configured (SUPABASE_URL missing)")
    try:
        signing_key = jwks.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=[alg],
            audience="authenticated",
            options={"verify_exp": True},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Token expired") from exc
    except jwt.PyJWKClientError as exc:
        raise UnauthorizedError(f"JWKS error: {exc}") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError(f"Invalid token: {exc}") from exc


def _verify_symmetric(token: str) -> dict:
    if not settings.SUPABASE_JWT_SECRET:
        raise UnauthorizedError(
            "HS256 token received but SUPABASE_JWT_SECRET is not configured"
        )
    try:
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            options={"verify_exp": True},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError(f"Invalid token: {exc}") from exc


def verify_supabase_jwt(token: str) -> AuthUser:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError(f"Malformed token header: {exc}") from exc

    alg = (header.get("alg") or "").upper()

    if alg in ("ES256", "ES384", "ES512", "RS256", "RS384", "RS512"):
        payload = _verify_asymmetric(token, alg)
    elif alg == "HS256":
        payload = _verify_symmetric(token)
    else:
        raise UnauthorizedError(f"Unsupported JWT algorithm: {alg or 'unknown'}")

    sub = payload.get("sub")
    if not sub:
        raise UnauthorizedError("Token missing subject")

    return AuthUser(
        id=sub,
        email=payload.get("email"),
        role=_extract_role(payload),
    )


async def get_current_user(request: Request) -> AuthUser:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise UnauthorizedError("Missing or malformed Authorization header")
    token = auth_header.split(None, 1)[1].strip()
    user = verify_supabase_jwt(token)
    request.state.user = user
    return user
