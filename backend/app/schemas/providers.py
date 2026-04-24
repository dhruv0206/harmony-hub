from pydantic import BaseModel


class HealthScoreRefreshResponse(BaseModel):
    provider_id: str
    new_score: int | None = None
    refreshed_at: str
