"""CSV bulk-import routes for providers and law firms.

POST /api/v1/providers/import     (admin-only)
POST /api/v1/law-firms/import     (admin-only)

Each endpoint accepts a multipart form-data upload with a single
`file` field, parses the header row to estimate `total_items`,
registers a background job in `job_store`, and kicks off the import
as an asyncio.Task. The import itself runs asynchronously — clients
poll `GET /api/v1/jobs/{job_id}` for status.
"""

from __future__ import annotations

import asyncio
import csv
import io
from typing import Awaitable, Callable

import structlog
from fastapi import APIRouter, Depends, UploadFile

from ..dependencies import require_role
from ..errors import ValidationError
from ..middleware.auth import AuthUser
from ..schemas.imports import ImportResponse
from ..services import job_store
from ..services.csv_import import run_law_firm_import, run_provider_import

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["imports"])


_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


async def _read_csv_text(file: UploadFile) -> str:
    """Read an UploadFile as UTF-8 text, with a sane upper bound."""
    raw = await file.read()
    if not raw:
        raise ValidationError("Uploaded file is empty")
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise ValidationError(
            "Uploaded file exceeds size limit",
            details={"max_bytes": _MAX_UPLOAD_BYTES, "received_bytes": len(raw)},
        )
    # Strip BOM if present; Excel likes to add one.
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValidationError(
            "Uploaded file is not valid UTF-8",
            details={"error": str(exc)},
        ) from exc
    return text


def _count_data_rows(csv_text: str, required_column: str) -> int:
    """Count data rows (excluding header) and validate the required column exists."""
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None:
        raise ValidationError("CSV file has no header row")
    normalized = {h.strip() for h in reader.fieldnames if h is not None}
    if required_column not in normalized:
        raise ValidationError(
            f"CSV is missing required column: {required_column}",
            details={"required": required_column, "found": sorted(normalized)},
        )
    return sum(1 for _ in reader)


async def _schedule_import(
    *,
    job_type: str,
    required_column: str,
    worker: Callable[[str, str, str], Awaitable[None]],
    file: UploadFile,
    user: AuthUser,
) -> ImportResponse:
    csv_text = await _read_csv_text(file)
    total_items = _count_data_rows(csv_text, required_column)
    if total_items == 0:
        raise ValidationError("CSV contains no data rows")

    job = await job_store.create_job(
        job_type=job_type,
        started_by=user.id,
        total_items=total_items,
    )
    job_id = job["id"]

    async def _runner() -> None:
        try:
            await worker(job_id, user.id, csv_text)
        except Exception:  # noqa: BLE001
            # csv_import already marks the job failed + logs before re-raising.
            logger.exception("import_task_crashed", job_id=job_id, job_type=job_type)

    asyncio.create_task(_runner())

    logger.info(
        "import_scheduled",
        job_id=job_id,
        job_type=job_type,
        total_items=total_items,
        user_id=user.id,
        filename=file.filename,
    )
    return ImportResponse(job_id=job_id, status="queued", total_items=total_items)


@router.post("/providers/import", response_model=ImportResponse)
async def import_providers(
    file: UploadFile,
    user: AuthUser = Depends(require_role("admin")),
) -> ImportResponse:
    """Start a background CSV import job for providers. Admin-only."""
    return await _schedule_import(
        job_type="provider_import",
        required_column="business_name",
        worker=run_provider_import,
        file=file,
        user=user,
    )


@router.post("/law-firms/import", response_model=ImportResponse)
async def import_law_firms(
    file: UploadFile,
    user: AuthUser = Depends(require_role("admin")),
) -> ImportResponse:
    """Start a background CSV import job for law firms. Admin-only."""
    return await _schedule_import(
        job_type="law_firm_import",
        required_column="firm_name",
        worker=run_law_firm_import,
        file=file,
        user=user,
    )
