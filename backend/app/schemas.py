"""Request schemas and stable response envelopes for the public API."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models import INVESTIGATION_STATUSES


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ObservationListResponse(BaseModel):
    items: list[dict]
    pagination: Pagination


class InvestigationCreate(BaseModel):
    status: Literal["new", "assigned", "investigating", "escalated", "closed", "dismissed"] = "new"
    reviewer_id: str | None = Field(default=None, max_length=100)
    findings: str | None = Field(default=None, max_length=2000)
    outcome: str | None = Field(default=None, max_length=1000)


class InvestigationStatusUpdate(BaseModel):
    status: Literal["new", "assigned", "investigating", "escalated", "closed", "dismissed"]
    reviewer_id: str | None = Field(default=None, max_length=100)
    findings: str | None = Field(default=None, max_length=2000)
    outcome: str | None = Field(default=None, max_length=1000)


class DateRange(BaseModel):
    start_date: date | None = None
    end_date: date | None = None

    @field_validator("end_date")
    @classmethod
    def validate_end_date(cls, value: date | None, info):
        start_date = info.data.get("start_date")
        if value and start_date and value < start_date:
            raise ValueError("end_date must be on or after start_date")
        return value
