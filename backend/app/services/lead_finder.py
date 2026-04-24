from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Deque

import httpx
import structlog

from ..config import settings
from ..errors import RateLimitError, UpstreamError, ValidationError
from ..schemas.lead_finder import LeadFinderRequest, LeadFinderResponse, LeadResult
from .places import _get_client

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

# next_page_token is not immediately valid; Google recommends a short delay.
_NEXT_PAGE_TOKEN_DELAY_SECONDS = 2.0

# Place Details enrichment concurrency cap.
_ENRICHMENT_CONCURRENCY = 10

# Cap enrichment to keep costs predictable.
_ENRICHMENT_MAX_RESULTS = 30

# Per-user rate limit: max 5 searches / minute.
_RATE_LIMIT_WINDOW_SECONDS = 60.0
_RATE_LIMIT_MAX_REQUESTS = 5

# Per-user sliding-window rate limiter state.
_rate_limiter: dict[str, Deque[float]] = {}


# ---------------------------------------------------------------------------
# Known chain names to filter out when exclude_chains=True.
# Medical + legal; case-insensitive substring match on business name.
# ---------------------------------------------------------------------------
KNOWN_CHAINS = [
    # Medical
    "cvs",
    "walgreens",
    "rite aid",
    "kaiser",
    "ascension",
    "hca healthcare",
    "humana",
    "aetna",
    "unitedhealth",
    "providence health",
    "dignity health",
    "tenet health",
    "one medical",
    "minute clinic",
    "urgent care",
    "quest diagnostics",
    "labcorp",
    "concentra",
    # Chains
    "starbucks",
    "mcdonald",
    "7-eleven",
    "walmart",
    # Legal (big firms for law firm variant)
    "legalzoom",
    "rocket lawyer",
    "jackson lewis",
    "dla piper",
    "baker mckenzie",
    "kirkland & ellis",
]


# ---------------------------------------------------------------------------
# US state name -> 2-letter abbreviation (all 50 + DC). Keys are lowercase.
# ---------------------------------------------------------------------------
US_STATE_ABBR: dict[str, str] = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "district of columbia": "DC",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
}

# Valid 2-letter state abbreviations (values of US_STATE_ABBR).
_VALID_STATE_ABBRS = set(US_STATE_ABBR.values())


def _normalize_state(state: str | None) -> str | None:
    """Accept either a 2-letter code or a full state name; return canonical form.

    Returns the original trimmed value if it is not recognised — we still want
    to pass it through to Google rather than silently drop it.
    """
    if not state:
        return None
    trimmed = state.strip()
    if not trimmed:
        return None
    lowered = trimmed.lower()
    if lowered in US_STATE_ABBR:
        return US_STATE_ABBR[lowered]
    upper = trimmed.upper()
    if len(upper) == 2 and upper in _VALID_STATE_ABBRS:
        return upper
    return trimmed


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
def _check_rate_limit(user_id: str) -> None:
    """Sliding-window per-user rate limiter for lead-finder searches."""
    now = time.monotonic()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS

    bucket = _rate_limiter.setdefault(user_id, deque())

    while bucket and bucket[0] < window_start:
        bucket.popleft()

    if len(bucket) >= _RATE_LIMIT_MAX_REQUESTS:
        raise RateLimitError("Too many lead-finder requests")

    bucket.append(now)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def search_leads(
    req: LeadFinderRequest,
    user_id: str,
) -> LeadFinderResponse:
    """Run a Google Places Text Search and return normalized leads."""
    start = time.monotonic()

    if not settings.GOOGLE_API_KEY:
        raise UpstreamError("Google API key not configured")

    _check_rate_limit(user_id)

    # Build query: "<category> in <city>, <state>[, <zip>]"
    location_parts: list[str] = []
    if req.city and req.city.strip():
        location_parts.append(req.city.strip())
    normalized_state = _normalize_state(req.state)
    if normalized_state:
        location_parts.append(normalized_state)
    if req.zip and req.zip.strip():
        location_parts.append(req.zip.strip())

    if not location_parts:
        raise ValidationError("At least one of city / state / zip is required")

    query = f"{req.category.strip()} in {', '.join(location_parts)}"

    logger.info(
        "lead_finder_search",
        query=query,
        result_count=req.result_count,
        enrich=req.enrich,
        exclude_chains=req.exclude_chains,
        user_id=user_id,
    )

    client = await _get_client()

    # ---- Text Search with pagination (up to 3 pages, 20 per page) ----
    results: list[dict] = []
    next_page_token: str | None = None
    pages_needed = (req.result_count + 19) // 20

    for page_index in range(pages_needed):
        params: dict[str, str] = {
            "query": query,
            "key": settings.GOOGLE_API_KEY,
        }
        if next_page_token:
            # Google requires a short delay before next_page_token becomes valid.
            await asyncio.sleep(_NEXT_PAGE_TOKEN_DELAY_SECONDS)
            params["pagetoken"] = next_page_token

        try:
            resp = await client.get(_TEXT_SEARCH_URL, params=params)
        except httpx.HTTPError as exc:
            raise UpstreamError(f"Text search request failed: {exc}") from exc

        if resp.status_code != 200:
            raise UpstreamError(f"Text search HTTP {resp.status_code}")

        try:
            data = resp.json()
        except ValueError as exc:
            raise UpstreamError("Text search returned invalid JSON") from exc

        status = data.get("status")
        if status == "ZERO_RESULTS":
            break
        if status != "OK":
            error_message = data.get("error_message", "")
            raise UpstreamError(
                f"Text search status {status}: {error_message}"
            )

        results.extend(data.get("results") or [])

        next_page_token = data.get("next_page_token")
        if not next_page_token:
            break
        if len(results) >= req.result_count:
            break

    results = results[: req.result_count]

    # ---- Optionally enrich with Place Details ----
    enriched_by_id: dict[str, dict] = {}
    if req.enrich and 0 < len(results) <= _ENRICHMENT_MAX_RESULTS:
        sem = asyncio.Semaphore(_ENRICHMENT_CONCURRENCY)

        async def fetch_details(place_id: str) -> None:
            try:
                r = await client.get(
                    _PLACE_DETAILS_URL,
                    params={
                        "place_id": place_id,
                        "fields": (
                            "formatted_phone_number,"
                            "international_phone_number,"
                            "website,"
                            "address_components"
                        ),
                        "key": settings.GOOGLE_API_KEY,
                    },
                )
            except httpx.HTTPError as exc:
                logger.warning(
                    "place_details_failed",
                    place_id=place_id,
                    err=str(exc),
                )
                return

            if r.status_code != 200:
                logger.warning(
                    "place_details_failed",
                    place_id=place_id,
                    err=f"HTTP {r.status_code}",
                )
                return

            try:
                d = r.json()
            except ValueError as exc:
                logger.warning(
                    "place_details_failed",
                    place_id=place_id,
                    err=f"invalid JSON: {exc}",
                )
                return

            if d.get("status") == "OK":
                enriched_by_id[place_id] = d.get("result") or {}

        async def bounded(pid: str) -> None:
            async with sem:
                await fetch_details(pid)

        await asyncio.gather(
            *(
                bounded(r["place_id"])
                for r in results
                if r.get("place_id")
            )
        )

    # ---- Normalize + filter chains ----
    leads: list[LeadResult] = []
    excluded_chains = 0

    for r in results:
        place_id = r.get("place_id")
        if not place_id:
            continue

        name = r.get("name") or ""
        lowered_name = name.lower()
        is_chain = any(chain in lowered_name for chain in KNOWN_CHAINS)

        if req.exclude_chains and is_chain:
            excluded_chains += 1
            continue

        details = enriched_by_id.get(place_id, {})

        # Parse address components from Place Details if available.
        city: str | None = None
        state: str | None = None
        zip_code: str | None = None
        for comp in details.get("address_components") or []:
            types = comp.get("types") or []
            if "locality" in types:
                city = comp.get("long_name")
            elif "administrative_area_level_1" in types:
                state = comp.get("short_name")
            elif "postal_code" in types:
                zip_code = comp.get("long_name")

        location = (r.get("geometry") or {}).get("location") or {}

        leads.append(
            LeadResult(
                place_id=place_id,
                name=name,
                address=r.get("formatted_address"),
                city=city,
                state=state,
                zip=zip_code,
                phone=(
                    details.get("formatted_phone_number")
                    or details.get("international_phone_number")
                ),
                website=details.get("website"),
                lat=location.get("lat"),
                lng=location.get("lng"),
                rating=r.get("rating"),
                user_ratings_total=r.get("user_ratings_total"),
                business_types=r.get("types") or [],
                is_likely_chain=is_chain,
            )
        )

    latency_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "lead_finder_search_complete",
        query=query,
        total_fetched=len(results),
        total_returned=len(leads),
        excluded_chains=excluded_chains,
        enriched=len(enriched_by_id),
        latency_ms=latency_ms,
    )

    return LeadFinderResponse(
        leads=leads,
        total_returned=len(leads),
        query=query,
        excluded_chains=excluded_chains,
    )
