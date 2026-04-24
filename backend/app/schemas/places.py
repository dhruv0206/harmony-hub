from pydantic import BaseModel, Field


class GeocodeRequest(BaseModel):
    address: str = Field(..., min_length=3, max_length=500)


class GeocodeResponse(BaseModel):
    lat: float
    lng: float
    formatted_address: str
    place_id: str | None = None


class AutocompleteRequest(BaseModel):
    query: str = Field(..., min_length=2)
    session_token: str | None = None
    country: str | None = "us"


class AutocompleteSuggestion(BaseModel):
    place_id: str
    description: str
    main_text: str
    secondary_text: str | None = None


class AutocompleteResponse(BaseModel):
    suggestions: list[AutocompleteSuggestion]
    session_token: str
