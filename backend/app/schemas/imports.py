"""Pydantic schemas for CSV bulk-import endpoints and job status."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ImportResponse(BaseModel):
    job_id: str
    status: str = "queued"
    total_items: int


class JobStatusResponse(BaseModel):
    id: str
    job_type: str
    status: str
    progress: int
    total_items: int | None = None
    processed_items: int
    result: dict | None = None
    error_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    errors: list[dict] = Field(default_factory=list)
