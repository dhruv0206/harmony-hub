from fastapi import APIRouter, Depends

from ..middleware.auth import AuthUser, get_current_user
from ..schemas.lead_finder import LeadFinderRequest, LeadFinderResponse
from ..services.lead_finder import search_leads

router = APIRouter(prefix="/api/v1/lead-finder", tags=["lead-finder"])


@router.post("/search", response_model=LeadFinderResponse)
async def find_leads(
    req: LeadFinderRequest,
    user: AuthUser = Depends(get_current_user),
) -> LeadFinderResponse:
    return await search_leads(req, user_id=user.id)
