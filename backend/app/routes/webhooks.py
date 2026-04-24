from __future__ import annotations

import json
from typing import Any

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


_NOT_IMPLEMENTED_BODIES = {
    "stripe": {
        "code": "NOT_IMPLEMENTED",
        "message": "Stripe webhook receiver — implementation pending.",
    },
    "docusign": {
        "code": "NOT_IMPLEMENTED",
        "message": "DocuSign webhook receiver — implementation pending.",
    },
    "twilio": {
        "code": "NOT_IMPLEMENTED",
        "message": "Twilio webhook receiver — implementation pending.",
    },
}


def _safe_json_load(raw: bytes) -> Any | None:
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


@router.post("/stripe")
async def stripe_webhook(request: Request) -> JSONResponse:
    """Receive Stripe events (payment_intent.succeeded, invoice.paid,
    subscription.updated, etc).

    Will verify the Stripe-Signature header against STRIPE_WEBHOOK_SECRET,
    then update invoices/payments in the database. Signature verification
    requires the raw request bytes, which is why this handler reads
    ``request.body()`` directly instead of binding a Pydantic model.
    """
    raw = await request.body()
    parsed = _safe_json_load(raw)
    event_type: str | None = None
    if isinstance(parsed, dict):
        value = parsed.get("type")
        if isinstance(value, str):
            event_type = value

    logger.info(
        "webhook_received",
        provider="stripe",
        event_type=event_type,
        byte_length=len(raw),
        signature_present=bool(request.headers.get("stripe-signature")),
    )

    return JSONResponse(
        status_code=501,
        content=_NOT_IMPLEMENTED_BODIES["stripe"],
    )


@router.post("/docusign")
async def docusign_webhook(request: Request) -> JSONResponse:
    """Receive DocuSign envelope status events.

    Will verify the HMAC signature header, then update
    ``signature_requests.status`` and persist ``signed_documents``. The raw
    request bytes are preserved here for future signature verification.
    """
    raw = await request.body()
    parsed = _safe_json_load(raw)
    event_type: str | None = None
    if isinstance(parsed, dict):
        for key in ("event", "status", "envelopeStatus"):
            value = parsed.get(key)
            if isinstance(value, str):
                event_type = value
                break

    logger.info(
        "webhook_received",
        provider="docusign",
        event_type=event_type,
        byte_length=len(raw),
        signature_present=bool(
            request.headers.get("x-docusign-signature-1")
            or request.headers.get("x-authorization-digest")
        ),
    )

    return JSONResponse(
        status_code=501,
        content=_NOT_IMPLEMENTED_BODIES["docusign"],
    )


@router.post("/twilio")
async def twilio_webhook(request: Request) -> JSONResponse:
    """Receive Twilio SMS delivery status updates.

    Will verify the X-Twilio-Signature header, then update notification
    delivery logs (e.g. queued/sent/delivered/failed). Twilio posts
    form-encoded data, so the raw bytes are retained for signature checks.
    """
    raw = await request.body()
    event_type: str | None = None
    # Twilio sends application/x-www-form-urlencoded; extract the message
    # status field without importing a form parser.
    content_type = (request.headers.get("content-type") or "").lower()
    if raw and "application/x-www-form-urlencoded" in content_type:
        try:
            from urllib.parse import parse_qs

            form = parse_qs(raw.decode("utf-8"))
            status_values = form.get("MessageStatus") or form.get("SmsStatus")
            if status_values:
                event_type = status_values[0]
        except (UnicodeDecodeError, ValueError):
            event_type = None

    logger.info(
        "webhook_received",
        provider="twilio",
        event_type=event_type,
        byte_length=len(raw),
        signature_present=bool(request.headers.get("x-twilio-signature")),
    )

    return JSONResponse(
        status_code=501,
        content=_NOT_IMPLEMENTED_BODIES["twilio"],
    )
