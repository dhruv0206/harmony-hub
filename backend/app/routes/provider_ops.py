from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from ..dependencies import require_role
from ..errors import NotFoundError
from ..middleware.auth import AuthUser
from ..schemas.providers import HealthScoreRefreshResponse
from ..services.supabase_edge import invoke_edge_function

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/providers", tags=["providers"])


def _extract_bearer(request: Request) -> str | None:
    """Pull the caller's raw JWT out of the Authorization header (if any)."""
    auth_header = request.headers.get("authorization") or request.headers.get(
        "Authorization"
    )
    if not auth_header:
        return None
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(None, 1)[1].strip() or None
    return None


def _coerce_score(value: Any) -> int | None:
    """Defensively coerce an unknown-shape edge function score value to int | None."""
    if value is None:
        return None
    if isinstance(value, bool):
        # bools are ints in Python — treat as not-a-score.
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        try:
            return int(value)
        except (ValueError, OverflowError):
            return None
    if isinstance(value, str):
        try:
            return int(float(value))
        except ValueError:
            return None
    return None


@router.post(
    "/{provider_id}/health-score/refresh",
    response_model=HealthScoreRefreshResponse,
)
async def refresh_health_score(
    provider_id: str,
    request: Request,
    user: AuthUser = Depends(require_role("admin", "sales_rep")),
) -> HealthScoreRefreshResponse | JSONResponse:
    """Trigger the calculate-health-scores edge function for a provider.

    The caller's JWT is forwarded so the edge function runs with their RLS
    context. Returns the freshly-computed score, or a 503 with a stable
    FUNCTION_NOT_DEPLOYED code when the edge function has not yet been
    deployed to the live Supabase project.
    """
    user_jwt = _extract_bearer(request)

    try:
        result = await invoke_edge_function(
            "calculate-health-scores",
            {"provider_id": provider_id},
            user_jwt=user_jwt,
        )
    except NotFoundError:
        logger.warning(
            "health_score_refresh_function_missing",
            provider_id=provider_id,
            user_id=user.id,
        )
        return JSONResponse(
            status_code=503,
            content={
                "code": "FUNCTION_NOT_DEPLOYED",
                "message": (
                    "calculate-health-scores has not been deployed to Supabase "
                    "yet. Deploy it from the CLI or dashboard."
                ),
            },
        )

    # Defensive: the edge function's exact shape is TBD.
    raw_score: Any = None
    if isinstance(result, dict):
        for key in ("new_score", "score", "health_score"):
            if key in result:
                raw_score = result[key]
                break

    new_score = _coerce_score(raw_score)
    refreshed_at = datetime.now(timezone.utc).isoformat()

    logger.info(
        "health_score_refresh",
        provider_id=provider_id,
        user_id=user.id,
        new_score=new_score,
    )

    return HealthScoreRefreshResponse(
        provider_id=provider_id,
        new_score=new_score,
        refreshed_at=refreshed_at,
    )
