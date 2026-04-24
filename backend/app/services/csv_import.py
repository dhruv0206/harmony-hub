"""CSV bulk-import workers for providers and law firms.

Parses the uploaded CSV (header row required), validates each row,
geocodes the address when enough parts are present, and inserts in
batches of 50 via the service-role client.

Rows that fail individual validation, geocode, or insert steps are
logged and tracked on the job's `errors` list; they do NOT abort the
whole job. The worker only marks the job `failed` on an unhandled
top-level exception (e.g. CSV parse error).
"""

from __future__ import annotations

import csv
import io
from typing import Any, Iterable

import structlog

from ..errors import UpstreamError
from ..schemas.places import GeocodeResponse
from . import job_store
from .places import geocode
from .supabase_admin import admin_insert

logger = structlog.get_logger()


_BATCH_SIZE = 50

# Columns copied through verbatim (after trim + empty-string -> None) for
# providers. `business_name` is required and handled separately.
_PROVIDER_OPTIONAL_COLUMNS = (
    "contact_name",
    "contact_email",
    "contact_phone",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "zip_code",
    "provider_type",
    "notes",
    "npi_number",
    "tax_id",
    "website",
)

_LAW_FIRM_OPTIONAL_COLUMNS = (
    "contact_name",
    "contact_email",
    "contact_phone",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "zip_code",
    "notes",
    "firm_size",
    "website",
)


def _clean(value: Any) -> str | None:
    """Trim strings; coerce empties to None."""
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    trimmed = value.strip()
    return trimmed or None


def _build_address(row: dict[str, Any]) -> tuple[str | None, int]:
    """Return (address_string, part_count) from line1/city/state/zip."""
    parts = [
        _clean(row.get("address_line1")),
        _clean(row.get("city")),
        _clean(row.get("state")),
        _clean(row.get("zip_code")),
    ]
    present = [p for p in parts if p]
    if not present:
        return None, 0
    return ", ".join(present), len(present)


async def _maybe_geocode(
    row: dict[str, Any],
    user_id: str,
    row_index: int,
    job_id: str,
) -> GeocodeResponse | None:
    """Geocode the row's address when at least 2 parts are present.

    Returns None on missing data or on a recoverable UpstreamError.
    """
    address, part_count = _build_address(row)
    if not address or part_count < 2:
        return None
    try:
        return await geocode(address, user_id)
    except UpstreamError as exc:
        logger.warning(
            "csv_import_geocode_failed",
            job_id=job_id,
            row_index=row_index,
            error=str(exc),
        )
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "csv_import_geocode_unexpected",
            job_id=job_id,
            row_index=row_index,
            error=str(exc),
        )
        return None


def _parse_rows(csv_text: str) -> list[dict[str, Any]]:
    """Parse CSV text into a list of dict rows (one per data line)."""
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames is None:
        return []
    return [dict(r) for r in reader]


def _project_optional(row: dict[str, Any], columns: Iterable[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col in columns:
        val = _clean(row.get(col))
        if val is not None:
            out[col] = val
    return out


async def _flush_batch(
    table: str,
    batch: list[dict[str, Any]],
    batch_start_index: int,
    job_id: str,
) -> tuple[int, list[dict[str, Any]]]:
    """Insert a batch; on failure fall back to per-row inserts so one bad
    row does not poison the whole chunk. Returns (inserted_count, errors).
    """
    if not batch:
        return 0, []
    try:
        inserted = await admin_insert(table, batch)
        return len(inserted), []
    except UpstreamError as exc:
        logger.warning(
            "csv_import_batch_insert_failed_fallback_per_row",
            job_id=job_id,
            table=table,
            batch_size=len(batch),
            error=str(exc),
        )

    inserted_count = 0
    errors: list[dict[str, Any]] = []
    for offset, row in enumerate(batch):
        try:
            inserted = await admin_insert(table, [row])
            inserted_count += len(inserted)
        except UpstreamError as exc:
            errors.append(
                {
                    "row_index": batch_start_index + offset,
                    "reason": f"insert_failed: {exc.message}",
                }
            )
    return inserted_count, errors


async def _run_import(
    *,
    job_id: str,
    user_id: str,
    csv_text: str,
    table: str,
    name_field: str,
    optional_columns: tuple[str, ...],
) -> None:
    """Shared worker body for both provider + law firm imports."""
    logger.info("csv_import_start", job_id=job_id, table=table)
    await job_store.mark_processing(job_id)

    try:
        rows = _parse_rows(csv_text)
    except Exception as exc:  # noqa: BLE001
        await job_store.fail_job(job_id, f"Failed to parse CSV: {exc}")
        raise

    imported = 0
    skipped = 0
    batch: list[dict[str, Any]] = []
    batch_start_index = 0
    processed = 0

    try:
        for row_index, raw_row in enumerate(rows):
            processed = row_index + 1
            row_error: dict[str, Any] | None = None

            name_value = _clean(raw_row.get(name_field))
            if not name_value:
                skipped += 1
                row_error = {
                    "row_index": row_index,
                    "reason": f"missing required column: {name_field}",
                }
                logger.info(
                    "csv_import_row_skipped",
                    job_id=job_id,
                    row_index=row_index,
                    reason=row_error["reason"],
                )
                await job_store.update_progress(job_id, processed, row_error)
                continue

            record: dict[str, Any] = {name_field: name_value}
            record.update(_project_optional(raw_row, optional_columns))

            geo = await _maybe_geocode(raw_row, user_id, row_index, job_id)
            if geo is not None:
                record["latitude"] = geo.lat
                record["longitude"] = geo.lng
                # Prefer the canonical formatted address when available
                # and line1 wasn't explicitly supplied.
                if not record.get("address_line1") and geo.formatted_address:
                    record["address_line1"] = geo.formatted_address

            batch.append(record)

            if len(batch) >= _BATCH_SIZE:
                inserted, errors = await _flush_batch(
                    table, batch, batch_start_index, job_id
                )
                imported += inserted
                skipped += len(errors)
                for err in errors:
                    await job_store.update_progress(job_id, processed, err)
                batch = []
                batch_start_index = row_index + 1

            await job_store.update_progress(job_id, processed, row_error)

        # Flush the final partial batch.
        if batch:
            inserted, errors = await _flush_batch(
                table, batch, batch_start_index, job_id
            )
            imported += inserted
            skipped += len(errors)
            for err in errors:
                await job_store.update_progress(job_id, processed, err)

        await job_store.complete_job(
            job_id,
            {
                "imported": imported,
                "skipped": skipped,
                "total_rows": len(rows),
            },
        )
        logger.info(
            "csv_import_complete",
            job_id=job_id,
            table=table,
            imported=imported,
            skipped=skipped,
            total_rows=len(rows),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("csv_import_unhandled", job_id=job_id, table=table)
        await job_store.fail_job(job_id, str(exc))
        raise


async def run_provider_import(job_id: str, user_id: str, csv_text: str) -> None:
    """Background worker: import providers from CSV text."""
    await _run_import(
        job_id=job_id,
        user_id=user_id,
        csv_text=csv_text,
        table="providers",
        name_field="business_name",
        optional_columns=_PROVIDER_OPTIONAL_COLUMNS,
    )


async def run_law_firm_import(job_id: str, user_id: str, csv_text: str) -> None:
    """Background worker: import law firms from CSV text."""
    await _run_import(
        job_id=job_id,
        user_id=user_id,
        csv_text=csv_text,
        table="law_firms",
        name_field="firm_name",
        optional_columns=_LAW_FIRM_OPTIONAL_COLUMNS,
    )


__all__ = ["run_provider_import", "run_law_firm_import"]
