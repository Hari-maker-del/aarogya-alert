"""Investigation-record creation endpoint."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from app.database import get_db
from app.schemas import InvestigationCreate, InvestigationNoteCreate, ReviewerAssignment
from app.services.alert_service import (
    add_investigation_note,
    assign_investigation_reviewer,
    create_investigation,
    list_audit_events,
)


router = APIRouter(prefix="/api/alerts", tags=["Investigations"])


@router.post("/{alert_id}/investigations", status_code=201)
def investigation_create(
    alert_id: str,
    payload: InvestigationCreate,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    return {"investigation": create_investigation(connection, alert_id, payload)}



@router.patch("/{alert_id}/assignment")
def investigation_assign_reviewer(
    alert_id: str,
    payload: ReviewerAssignment,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Assign or reassign an investigation and append an audit event."""
    return {"investigation": assign_investigation_reviewer(connection, alert_id, payload)}


@router.post("/{alert_id}/notes", status_code=201)
def investigation_add_note(
    alert_id: str,
    payload: InvestigationNoteCreate,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Append an investigation note without creating duplicate investigation records."""
    return {"event": add_investigation_note(connection, alert_id, payload)}


@router.get("/{alert_id}/history")
def investigation_history(
    alert_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Return append-only audit events for one alert."""
    return {"alert_id": alert_id, "items": list_audit_events(connection, alert_id, limit)}
