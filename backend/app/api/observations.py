"""Aggregate-observation read endpoints."""

from __future__ import annotations

import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.database import get_db
from app.services.data_service import list_observations, observation_summary
from app.utils.validation import require_known_indicator, require_valid_date_range


router = APIRouter(prefix="/api/observations", tags=["Observations"])


@router.get("/summary")
def observations_summary(
    region_id: str | None = None,
    indicator_type: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    require_known_indicator(indicator_type)
    require_valid_date_range(start_date, end_date)
    return observation_summary(connection, region_id, indicator_type, start_date, end_date)


@router.get("")
def observations(
    region_id: str | None = None,
    indicator_type: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    require_known_indicator(indicator_type)
    require_valid_date_range(start_date, end_date)
    return list_observations(connection, region_id, indicator_type, start_date, end_date, page, page_size)
