from fastapi import APIRouter, Depends, Query

from ..middleware.auth import AuthUser, get_current_user
from ..schemas.places import (
    AutocompleteResponse,
    GeocodeRequest,
    GeocodeResponse,
)
from ..services import places as places_service

router = APIRouter(prefix="/api/v1", tags=["places"])


@router.post("/geocode", response_model=GeocodeResponse)
async def geocode_endpoint(
    payload: GeocodeRequest,
    user: AuthUser = Depends(get_current_user),
) -> GeocodeResponse:
    return await places_service.geocode(payload.address, user.id)


@router.get("/places/autocomplete", response_model=AutocompleteResponse)
async def autocomplete_endpoint(
    query: str = Query(..., min_length=2),
    session_token: str | None = Query(default=None),
    country: str | None = Query(default="us"),
    user: AuthUser = Depends(get_current_user),
) -> AutocompleteResponse:
    suggestions, token = await places_service.autocomplete(
        query=query,
        session_token=session_token,
        country=country,
        user_id=user.id,
    )
    return AutocompleteResponse(suggestions=suggestions, session_token=token)
