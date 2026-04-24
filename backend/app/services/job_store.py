"""In-memory job store with best-effort persistence to `background_jobs`.

The in-memory dict is the source of truth for the lifetime of a single
process (sufficient for one Cloud Run instance). Every state transition
mirrors to the Supabase `background_jobs` table so users can still fetch
job status if a query hits a different instance, and so completed jobs
survive restarts.

Progress updates batch DB writes (every 10 processed items) to keep the
import hot loop cheap.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import structlog

from ..errors import UpstreamError
from .supabase_admin import admin_insert, admin_select_by_id, admin_update

logger = structlog.get_logger()


_jobs: dict[str, dict[str, Any]] = {}
_lock = asyncio.Lock()

# Persist every Nth progress update to reduce write load.
_PROGRESS_WRITE_EVERY = 10


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_payload(job: dict[str, Any]) -> dict[str, Any]:
    """Project an in-memory job into the columns that exist on background_jobs."""
    # result is jsonb; fold errors into result on reads for the API layer.
    return {
        "id": job["id"],
        "job_type": job["job_type"],
        "status": job["status"],
        "progress": job.get("progress", 0),
        "total_items": job.get("total_items"),
        "processed_items": job.get("processed_items", 0),
        "result": job.get("result"),
        "error_message": job.get("error_message"),
        "started_by": job.get("started_by"),
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
    }


async def _persist_insert(job: dict[str, Any]) -> None:
    try:
        await admin_insert("background_jobs", [_db_payload(job)])
    except UpstreamError as exc:
        logger.warning(
            "job_store_persist_insert_failed",
            job_id=job["id"],
            error=str(exc),
        )


async def _persist_update(job_id: str, patch: dict[str, Any]) -> None:
    try:
        await admin_update("background_jobs", job_id, patch)
    except UpstreamError as exc:
        logger.warning(
            "job_store_persist_update_failed",
            job_id=job_id,
            error=str(exc),
        )


def _compute_progress(processed: int, total: int | None) -> int:
    if not total or total <= 0:
        return 0
    pct = int((processed / total) * 100)
    return max(0, min(100, pct))


async def create_job(
    job_type: str,
    started_by: str,
    total_items: int,
) -> dict[str, Any]:
    """Create a new job in memory and write the initial row to the DB."""
    job_id = str(uuid4())
    now = _now_iso()
    job: dict[str, Any] = {
        "id": job_id,
        "job_type": job_type,
        "status": "queued",
        "progress": 0,
        "total_items": total_items,
        "processed_items": 0,
        "result": None,
        "error_message": None,
        "started_by": started_by,
        "started_at": now,
        "completed_at": None,
        "errors": [],
    }
    async with _lock:
        _jobs[job_id] = job

    await _persist_insert(job)
    logger.info(
        "job_created",
        job_id=job_id,
        job_type=job_type,
        total_items=total_items,
        started_by=started_by,
    )
    return job


async def mark_processing(job_id: str) -> None:
    """Flip status from queued -> processing on first work."""
    async with _lock:
        job = _jobs.get(job_id)
        if not job or job["status"] != "queued":
            return
        job["status"] = "processing"
    await _persist_update(job_id, {"status": "processing"})


async def update_progress(
    job_id: str,
    processed: int,
    error: dict[str, Any] | None = None,
) -> None:
    """Record forward progress. Writes to DB every N updates."""
    async with _lock:
        job = _jobs.get(job_id)
        if not job:
            logger.warning("job_store_update_progress_missing", job_id=job_id)
            return
        job["processed_items"] = processed
        job["progress"] = _compute_progress(processed, job.get("total_items"))
        if job["status"] == "queued":
            job["status"] = "processing"
        if error is not None:
            job["errors"].append(error)
        should_persist = (
            processed % _PROGRESS_WRITE_EVERY == 0
            or error is not None
        )
        snapshot = {
            "status": job["status"],
            "progress": job["progress"],
            "processed_items": job["processed_items"],
        }

    if should_persist:
        await _persist_update(job_id, snapshot)


async def complete_job(job_id: str, result: dict[str, Any]) -> None:
    """Mark job completed and persist final state."""
    async with _lock:
        job = _jobs.get(job_id)
        if not job:
            logger.warning("job_store_complete_missing", job_id=job_id)
            return
        # Surface accumulated row-level errors so clients have a single
        # JSON blob with everything the UI needs.
        merged_result = dict(result)
        if job.get("errors") and "errors" not in merged_result:
            merged_result["errors"] = list(job["errors"])
        job["status"] = "completed"
        job["progress"] = 100
        job["result"] = merged_result
        job["completed_at"] = _now_iso()
        patch = {
            "status": "completed",
            "progress": 100,
            "processed_items": job.get("processed_items", 0),
            "result": merged_result,
            "completed_at": job["completed_at"],
        }

    await _persist_update(job_id, patch)
    logger.info("job_completed", job_id=job_id, result=patch["result"])


async def fail_job(job_id: str, error_message: str) -> None:
    """Mark job failed and persist final state."""
    async with _lock:
        job = _jobs.get(job_id)
        if not job:
            logger.warning("job_store_fail_missing", job_id=job_id)
            return
        job["status"] = "failed"
        job["error_message"] = error_message
        job["completed_at"] = _now_iso()
        patch = {
            "status": "failed",
            "error_message": error_message,
            "completed_at": job["completed_at"],
            "processed_items": job.get("processed_items", 0),
            "progress": job.get("progress", 0),
        }

    await _persist_update(job_id, patch)
    logger.error("job_failed", job_id=job_id, error=error_message)


def _hydrate_from_db(row: dict[str, Any]) -> dict[str, Any]:
    """Shape a DB row into the same dict layout as in-memory jobs."""
    result = row.get("result") or None
    errors: list[dict[str, Any]] = []
    if isinstance(result, dict) and isinstance(result.get("errors"), list):
        errors = list(result["errors"])
    return {
        "id": row["id"],
        "job_type": row.get("job_type"),
        "status": row.get("status"),
        "progress": row.get("progress") or 0,
        "total_items": row.get("total_items"),
        "processed_items": row.get("processed_items") or 0,
        "result": result,
        "error_message": row.get("error_message"),
        "started_by": row.get("started_by"),
        "started_at": row.get("started_at"),
        "completed_at": row.get("completed_at"),
        "errors": errors,
    }


async def get_job(job_id: str) -> dict[str, Any] | None:
    """Fetch a job from memory; fall back to DB when not present."""
    async with _lock:
        job = _jobs.get(job_id)
        if job is not None:
            # Return a shallow copy so callers can't mutate store state.
            return dict(job)

    row = await admin_select_by_id("background_jobs", job_id)
    if not row:
        return None
    return _hydrate_from_db(row)


async def get_user_job(job_id: str, user_id: str) -> dict[str, Any] | None:
    """Return job only if it was started by this user."""
    job = await get_job(job_id)
    if not job:
        return None
    if job.get("started_by") != user_id:
        return None
    return job


__all__ = [
    "create_job",
    "mark_processing",
    "update_progress",
    "complete_job",
    "fail_job",
    "get_job",
    "get_user_job",
]
