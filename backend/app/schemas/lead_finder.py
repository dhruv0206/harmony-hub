from pydantic import BaseModel, Field


class LeadFinderRequest(BaseModel):
    category: str = Field(min_length=2, max_length=200)
    city: str | None = None
    state: str | None = None  # 2-letter US state code or full state name
    zip: str | None = None
    result_count: int = Field(default=20, ge=1, le=60)  # Google max = 60 across 3 pages
    exclude_chains: bool = True
    enrich: bool = True  # fetch Place Details for phone/website (costs extra)


class LeadResult(BaseModel):
    place_id: str
    name: str
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    phone: str | None = None
    website: str | None = None
    lat: float | None = None
    lng: float | None = None
    rating: float | None = None
    user_ratings_total: int | None = None
    business_types: list[str] = []
    is_likely_chain: bool = False


class LeadFinderResponse(BaseModel):
    leads: list[LeadResult]
    total_returned: int
    query: str
    excluded_chains: int = 0
