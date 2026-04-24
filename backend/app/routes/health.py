from fastapi import APIRouter

from ..config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    """Liveness check. Returns basic service info; does not touch DB or upstreams."""
    return {
        "status": "ok",
        "service": "phh-backend",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT,
    }
