"""Explainable-alert endpoints."""

from __future__ import annotations

import sqlite3
from datetime import date

from fastapi import APIRouter, Depends

from app.database import get_db
from app.services.alert_service import alert_summary, get_alert, list_alerts, update_investigation_status
from app.schemas import InvestigationStatusUpdate
from app.utils.validation import require_known_investigation_status, require_known_priority, require_valid_date_range


router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


@router.get("/summary")
def alerts_summary(connection: sqlite3.Connection = Depends(get_db)) -> dict:
    return alert_summary(connection)


@router.get("")
def alerts(
    region_id: str | None = None,
    review_priority: str | None = None,
    investigation_status: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    require_known_priority(review_priority)
    require_known_investigation_status(investigation_status)
    require_valid_date_range(start_date, end_date)
    return {"items": list_alerts(
        connection, region_id, review_priority, investigation_status,
        start_date.isoformat() if start_date else None, end_date.isoformat() if end_date else None,
    )}


@router.patch("/{alert_id}/status")
def alert_status(
    alert_id: str,
    payload: InvestigationStatusUpdate,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    return {"investigation": update_investigation_status(connection, alert_id, payload)}


@router.get("/{alert_id}")
def alert_detail(alert_id: str, connection: sqlite3.Connection = Depends(get_db)) -> dict:
    return get_alert(connection, alert_id)
