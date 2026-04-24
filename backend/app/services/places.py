from __future__ import annotations

import time
import uuid
from collections import OrderedDict, deque
from typing import Deque
from urllib.parse import quote

import httpx
import structlog

from ..config import settings
from ..errors import RateLimitError, UpstreamError, ValidationError
from ..schemas.places import AutocompleteSuggestion, GeocodeResponse

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_CACHE_MAX_ENTRIES = 500
_CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 hours

_RATE_LIMIT_WINDOW_SECONDS = 1.0
_RATE_LIMIT_MAX_REQUESTS = 10

_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json"

_HTTP_TIMEOUT_SECONDS = 10.0

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------
# LRU cache: key -> (expires_at_monotonic, GeocodeResponse)
_cache: "OrderedDict[str, tuple[float, GeocodeResponse]]" = OrderedDict()

# HTTP singleton
_http: httpx.AsyncClient | None = None

# Per-user sliding-window rate limiter
_rate_limiter: dict[str, Deque[float]] = {}


# ---------------------------------------------------------------------------
# HTTP client management
# ---------------------------------------------------------------------------
async def _get_client() -> httpx.AsyncClient:
    """Return the lazily-initialised singleton httpx AsyncClient."""
    global _http
    if _http is None:
        _http = httpx.AsyncClient(
            timeout=_HTTP_TIMEOUT_SECONDS,
            limits=httpx.Limits(
                max_connections=20,
                max_keepalive_connections=5,
            ),
        )
    return _http


async def close_client() -> None:
    """Close the singleton httpx client. Call on FastAPI shutdown."""
    global _http
    if _http is not None:
        await _http.aclose()
        _http = None


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
def _check_rate_limit(user_id: str) -> None:
    """Sliding-window per-user rate limiter.

    Raises RateLimitError if the caller exceeds the configured threshold.
    """
    now = time.monotonic()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS

    bucket = _rate_limiter.setdefault(user_id, deque())

    # Drop timestamps outside the current window
    while bucket and bucket[0] < window_start:
        bucket.popleft()

    if len(bucket) >= _RATE_LIMIT_MAX_REQUESTS:
        raise RateLimitError("Too many geocoding requests")

    bucket.append(now)


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------
def _normalize_address(address: str) -> str:
    return address.strip().lower()


def _cache_get(key: str) -> GeocodeResponse | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.monotonic() >= expires_at:
        # Expired — evict
        _cache.pop(key, None)
        return None
    # Mark as most-recently-used
    _cache.move_to_end(key)
    return value


def _cache_set(key: str, value: GeocodeResponse) -> None:
    expires_at = time.monotonic() + _CACHE_TTL_SECONDS
    _cache[key] = (expires_at, value)
    _cache.move_to_end(key)
    while len(_cache) > _CACHE_MAX_ENTRIES:
        _cache.popitem(last=False)


# ---------------------------------------------------------------------------
# Public API: geocode
# ---------------------------------------------------------------------------
async def geocode(address: str, user_id: str) -> GeocodeResponse:
    """Geocode a free-form address via the Google Geocoding API.

    - Validates and normalises input
    - Applies per-user rate limits
    - Uses an in-memory LRU cache (24h TTL)
    - Raises domain exceptions on upstream / validation failures
    """
    start = time.monotonic()

    if not address or not address.strip():
        raise ValidationError("Address is required")

    _check_rate_limit(user_id)

    key = _normalize_address(address)

    cached = _cache_get(key)
    if cached is not None:
        logger.info("places_cache_hit", address=key)
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "places_geocode",
            address=key,
            status="OK",
            cache="hit",
            latency_ms=latency_ms,
        )
        return cached

    logger.info("places_cache_miss", address=key)

    if not settings.GOOGLE_API_KEY:
        raise UpstreamError("Google API key not configured")

    client = await _get_client()
    url = (
        f"{_GEOCODE_URL}?address={quote(address.strip())}"
        f"&key={settings.GOOGLE_API_KEY}"
    )

    try:
        resp = await client.get(url)
    except httpx.HTTPError as exc:
        raise UpstreamError(f"Geocoding request failed: {exc}") from exc

    if resp.status_code >= 500:
        raise UpstreamError(
            f"Places API HTTP {resp.status_code}"
        )

    try:
        data = resp.json()
    except ValueError as exc:
        raise UpstreamError("Places API returned invalid JSON") from exc

    status = data.get("status", "UNKNOWN")
    error_message = data.get("error_message", "")
    results = data.get("results") or []

    if status == "ZERO_RESULTS" or (status == "OK" and not results):
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "places_geocode",
            address=key,
            status=status,
            cache="miss",
            latency_ms=latency_ms,
        )
        raise ValidationError("No results for address")

    if status != "OK":
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "places_geocode",
            address=key,
            status=status,
            cache="miss",
            latency_ms=latency_ms,
        )
        raise UpstreamError(
            f"Places API returned {status}: {error_message}"
        )

    first = results[0]
    location = (first.get("geometry") or {}).get("location") or {}
    lat = location.get("lat")
    lng = location.get("lng")
    formatted_address = first.get("formatted_address")
    place_id = first.get("place_id")

    if lat is None or lng is None or not formatted_address:
        raise UpstreamError("Places API response missing required fields")

    result = GeocodeResponse(
        lat=float(lat),
        lng=float(lng),
        formatted_address=formatted_address,
        place_id=place_id,
    )

    _cache_set(key, result)

    latency_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "places_geocode",
        address=key,
        status=status,
        cache="miss",
        latency_ms=latency_ms,
    )

    return result


# ---------------------------------------------------------------------------
# Public API: autocomplete
# ---------------------------------------------------------------------------
async def autocomplete(
    query: str,
    session_token: str | None,
    country: str | None,
    user_id: str,
) -> tuple[list[AutocompleteSuggestion], str]:
    """Autocomplete address predictions via Google Places Autocomplete.

    Returns a (suggestions, session_token) tuple. If session_token is None,
    a new uuid4 token is generated and returned, so the frontend can reuse
    it for subsequent keystrokes in the same typing session (Places billing
    optimisation).
    """
    start = time.monotonic()

    if not query or not query.strip():
        raise ValidationError("Query is required")

    _check_rate_limit(user_id)

    if not settings.GOOGLE_API_KEY:
        raise UpstreamError("Google API key not configured")

    token = session_token or str(uuid.uuid4())

    params = [
        f"input={quote(query.strip())}",
        "types=address",
        f"sessiontoken={quote(token)}",
        f"key={settings.GOOGLE_API_KEY}",
    ]
    if country:
        params.append(f"components=country:{quote(country.strip().lower())}")

    url = f"{_AUTOCOMPLETE_URL}?{'&'.join(params)}"

    client = await _get_client()
    try:
        resp = await client.get(url)
    except httpx.HTTPError as exc:
        raise UpstreamError(f"Autocomplete request failed: {exc}") from exc

    if resp.status_code >= 500:
        raise UpstreamError(f"Places API HTTP {resp.status_code}")

    try:
        data = resp.json()
    except ValueError as exc:
        raise UpstreamError("Places API returned invalid JSON") from exc

    status = data.get("status", "UNKNOWN")
    error_message = data.get("error_message", "")

    if status == "ZERO_RESULTS":
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "places_autocomplete",
            query=query,
            status=status,
            count=0,
            latency_ms=latency_ms,
        )
        return [], token

    if status != "OK":
        raise UpstreamError(
            f"Places API returned {status}: {error_message}"
        )

    predictions = data.get("predictions") or []
    suggestions: list[AutocompleteSuggestion] = []
    for pred in predictions:
        place_id = pred.get("place_id")
        description = pred.get("description")
        if not place_id or not description:
            continue
        structured = pred.get("structured_formatting") or {}
        main_text = structured.get("main_text") or description
        secondary_text = structured.get("secondary_text")
        suggestions.append(
            AutocompleteSuggestion(
                place_id=place_id,
                description=description,
                main_text=main_text,
                secondary_text=secondary_text,
            )
        )

    latency_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "places_autocomplete",
        query=query,
        status=status,
        count=len(suggestions),
        latency_ms=latency_ms,
    )

    return suggestions, token
