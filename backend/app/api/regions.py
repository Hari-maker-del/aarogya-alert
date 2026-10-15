"""Regional analytics and map-data endpoints."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from app.database import get_db
from app.services.data_service import get_region, get_trends, list_regions, map_data


router = APIRouter(prefix="/api/regions", tags=["Regions"])


@router.get("")
def regions(connection: sqlite3.Connection = Depends(get_db)) -> dict:
    return {"items": list_regions(connection), "synthetic_only": True}


@router.get("/map-data")
def region_map_data(connection: sqlite3.Connection = Depends(get_db)) -> dict:
    return map_data(connection)


@router.get("/{region_id}/trends")
def region_trends(
    region_id: str,
    days: int = Query(default=30, ge=1, le=90),
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    return get_trends(connection, region_id, days)


@router.get("/{region_id}")
def region_detail(region_id: str, connection: sqlite3.Connection = Depends(get_db)) -> dict:
    return get_region(connection, region_id)
