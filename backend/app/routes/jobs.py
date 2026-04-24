"""Job status route.

GET /api/v1/jobs/{job_id} — returns the current state of a job, but
only if the requesting user owns it (started_by match). Admins query
the same endpoint from their own session, so ownership is sufficient;
cross-user access is denied with a 404 to avoid leaking job ids.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends

from ..errors import NotFoundError
from ..middleware.auth import AuthUser, get_current_user
from ..schemas.imports import JobStatusResponse
from ..services import job_store

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["jobs"])


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    user: AuthUser = Depends(get_current_user),
) -> JobStatusResponse:
    """Fetch status for a job owned by the current user."""
    job = await job_store.get_user_job(job_id, user.id)
    if job is None:
        raise NotFoundError(
            "Job not found",
            details={"job_id": job_id},
        )

    return JobStatusResponse(
        id=job["id"],
        job_type=job.get("job_type") or "",
        status=job.get("status") or "queued",
        progress=job.get("progress") or 0,
        total_items=job.get("total_items"),
        processed_items=job.get("processed_items") or 0,
        result=job.get("result"),
        error_message=job.get("error_message"),
        started_at=job.get("started_at"),
        completed_at=job.get("completed_at"),
        errors=job.get("errors") or [],
    )
