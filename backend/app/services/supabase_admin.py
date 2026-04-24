"""Service-role Supabase client wrapper.

This module exposes a singleton Supabase client initialized with the
SERVICE_ROLE key. It BYPASSES Row Level Security, so it must only be
used from code paths where authorization has already been enforced
(e.g. after `require_role('admin')` in a route dependency).

supabase-py v2 ships both a sync `Client` and an async client. For MVP
simplicity we use the sync client and dispatch blocking calls via
`asyncio.to_thread()` so we never block the event loop.
"""

from __future__ import annotations

import asyncio
from threading import Lock
from typing import Any

import structlog
from supabase import Client, create_client

from ..config import settings
from ..errors import UpstreamError

logger = structlog.get_logger()

_client: Client | None = None
_client_lock = Lock()


def get_admin_client() -> Client:
    """Return (lazily initializing) the service-role Supabase client.

    Thread-safe; safe to call from async code (cheap after first init).
    """
    global _client
    if _client is not None:
        return _client

    with _client_lock:
        if _client is not None:
            return _client
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise UpstreamError(
                "Supabase admin client not configured",
                details={"reason": "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing"},
            )
        _client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        logger.info("supabase_admin_client_initialized")
        return _client


def _insert_sync(table: str, rows: list[dict]) -> list[dict]:
    client = get_admin_client()
    resp = client.table(table).insert(rows).execute()
    return resp.data or []


def _update_sync(table: str, row_id: str, data: dict) -> dict:
    client = get_admin_client()
    resp = client.table(table).update(data).eq("id", row_id).execute()
    rows = resp.data or []
    return rows[0] if rows else {}


def _select_by_id_sync(table: str, row_id: str) -> dict | None:
    client = get_admin_client()
    resp = client.table(table).select("*").eq("id", row_id).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


async def admin_insert(table: str, rows: list[dict]) -> list[dict]:
    """Insert rows into a table using the service-role client.

    Returns the inserted rows (with DB-generated columns populated).
    Raises UpstreamError on failure.
    """
    if not rows:
        return []
    try:
        return await asyncio.to_thread(_insert_sync, table, rows)
    except Exception as exc:
        logger.error(
            "supabase_admin_insert_failed",
            table=table,
            row_count=len(rows),
            error=str(exc),
        )
        raise UpstreamError(
            f"Failed to insert into {table}: {exc}",
            details={"table": table, "row_count": len(rows)},
        ) from exc


async def admin_update(table: str, row_id: str, data: dict) -> dict:
    """Update a single row by id using the service-role client.

    Returns the updated row or {} if nothing matched.
    Raises UpstreamError on failure.
    """
    try:
        return await asyncio.to_thread(_update_sync, table, row_id, data)
    except Exception as exc:
        logger.error(
            "supabase_admin_update_failed",
            table=table,
            row_id=row_id,
            error=str(exc),
        )
        raise UpstreamError(
            f"Failed to update {table}: {exc}",
            details={"table": table, "row_id": row_id},
        ) from exc


async def admin_select_by_id(table: str, row_id: str) -> dict | None:
    """Fetch a single row by id using the service-role client.

    Returns the row dict, or None if not found. Raises UpstreamError on
    transport/protocol failures.
    """
    try:
        return await asyncio.to_thread(_select_by_id_sync, table, row_id)
    except Exception as exc:
        logger.error(
            "supabase_admin_select_failed",
            table=table,
            row_id=row_id,
            error=str(exc),
        )
        raise UpstreamError(
            f"Failed to select from {table}: {exc}",
            details={"table": table, "row_id": row_id},
        ) from exc


__all__ = [
    "get_admin_client",
    "admin_insert",
    "admin_update",
    "admin_select_by_id",
]
