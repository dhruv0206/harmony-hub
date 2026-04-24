from __future__ import annotations

import time
from typing import Any

import httpx
import structlog

from ..config import settings
from ..errors import NotFoundError, UpstreamError, ValidationError

logger = structlog.get_logger()

_HTTP_TIMEOUT_SECONDS = 30.0


async def invoke_edge_function(
    function_name: str,
    payload: dict[str, Any],
    user_jwt: str | None = None,
) -> dict[str, Any]:
    """Invoke a Supabase Edge Function and return its JSON response.

    Args:
        function_name: Name of the deployed edge function (e.g. "calculate-health-scores").
        payload: JSON-serialisable body to POST.
        user_jwt: Optional caller JWT; if provided, forwarded as the bearer token so
            the edge function runs with the caller's RLS context. Falls back to the
            service-role key when not provided.

    Returns:
        The decoded JSON response from the edge function.

    Raises:
        NotFoundError: Function not deployed (HTTP 404).
        ValidationError: Other client-side (4xx) error from the function.
        UpstreamError: Server-side (5xx), timeout, or transport-level failure.
    """
    if not settings.SUPABASE_URL:
        raise UpstreamError("SUPABASE_URL is not configured")

    base_url = settings.SUPABASE_URL.rstrip("/")
    url = f"{base_url}/functions/v1/{function_name}"

    bearer = user_jwt if user_jwt else settings.SUPABASE_SERVICE_ROLE_KEY
    if not bearer:
        raise UpstreamError("No auth token available to invoke edge function")

    headers = {
        "Authorization": f"Bearer {bearer}",
        "Content-Type": "application/json",
    }
    # Supabase edge runtime expects the anon (or service role) key as the apikey
    # header in addition to the Authorization bearer. Prefer anon for user-token
    # calls so RLS is applied against the caller's JWT; fall back to service role.
    apikey = settings.SUPABASE_ANON_KEY or settings.SUPABASE_SERVICE_ROLE_KEY
    if apikey:
        headers["apikey"] = apikey

    start = time.monotonic()
    status: int | None = None

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            try:
                resp = await client.post(url, json=payload, headers=headers)
            except httpx.TimeoutException as exc:
                duration_ms = int((time.monotonic() - start) * 1000)
                logger.error(
                    "edge_function_invoke",
                    function_name=function_name,
                    status="timeout",
                    duration_ms=duration_ms,
                    error=str(exc),
                )
                raise UpstreamError(
                    f"Edge function {function_name} timed out after {_HTTP_TIMEOUT_SECONDS}s"
                ) from exc
            except httpx.HTTPError as exc:
                duration_ms = int((time.monotonic() - start) * 1000)
                logger.error(
                    "edge_function_invoke",
                    function_name=function_name,
                    status="transport_error",
                    duration_ms=duration_ms,
                    error=str(exc),
                )
                raise UpstreamError(
                    f"Edge function {function_name} request failed: {exc}"
                ) from exc

            status = resp.status_code
            duration_ms = int((time.monotonic() - start) * 1000)
            logger.info(
                "edge_function_invoke",
                function_name=function_name,
                status=status,
                duration_ms=duration_ms,
            )

            # Success
            if 200 <= status < 300:
                try:
                    return resp.json()
                except ValueError as exc:
                    raise UpstreamError(
                        f"Edge function {function_name} returned invalid JSON"
                    ) from exc

            # Parse body once for error branches — may not be JSON.
            body_text = resp.text
            body_json: Any = None
            try:
                body_json = resp.json()
            except ValueError:
                body_json = None

            # 404 — function not deployed
            if status == 404:
                raise NotFoundError(
                    f"Edge function {function_name} not deployed",
                    details={"body": body_json if body_json is not None else body_text},
                )

            # Other 4xx
            if 400 <= status < 500:
                message = _extract_error_message(body_json) or body_text or (
                    f"Edge function {function_name} returned HTTP {status}"
                )
                raise ValidationError(
                    message,
                    details={
                        "status": status,
                        "body": body_json if body_json is not None else body_text,
                    },
                )

            # 5xx
            raise UpstreamError(
                f"Edge function {function_name} returned HTTP {status}",
                details={"body": body_json if body_json is not None else body_text},
            )
    except (NotFoundError, ValidationError, UpstreamError):
        raise
    except Exception as exc:  # pragma: no cover - defensive catch-all
        duration_ms = int((time.monotonic() - start) * 1000)
        logger.exception(
            "edge_function_invoke_unexpected",
            function_name=function_name,
            status=status,
            duration_ms=duration_ms,
        )
        raise UpstreamError(
            f"Edge function {function_name} failed unexpectedly: {exc}"
        ) from exc


def _extract_error_message(body: Any) -> str | None:
    """Best-effort extraction of a human-readable error message from an edge
    function response body."""
    if not isinstance(body, dict):
        return None
    for key in ("message", "error", "error_description", "msg"):
        value = body.get(key)
        if isinstance(value, str) and value:
            return value
        if isinstance(value, dict):
            inner = value.get("message")
            if isinstance(inner, str) and inner:
                return inner
    return None
