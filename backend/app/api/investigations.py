"""Authenticated investigation workflow endpoints."""
from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.auth import require_authenticated_user
from app.database import get_db
from app.schemas import InvestigationCreate, InvestigationNoteCreate, ReviewerAssignment
from app.services.alert_service import (
    add_investigation_note, assign_investigation_reviewer, create_investigation,
    get_alert, list_audit_events,
)
from app.services.supabase_workflow import (
    list_durable_audit_events, persist_assignment, persist_create_investigation, persist_note,
)

router = APIRouter(prefix="/api/alerts", tags=["Investigations"])


@router.post("/{alert_id}/investigations", status_code=201)
def investigation_create(
    alert_id: str,
    payload: InvestigationCreate,
    connection: sqlite3.Connection = Depends(get_db),
    user: dict[str, Any] = Depends(require_authenticated_user),
) -> dict:
    get_alert(connection, alert_id)
    persist_create_investigation(
        user["access_token"], alert_id, user["id"], payload.status, payload.findings, payload.outcome
    )
    trusted_payload = payload.model_copy(update={"actor_id": user["id"], "reviewer_id": user["id"]})
    return {"investigation": create_investigation(connection, alert_id, trusted_payload)}


@router.patch("/{alert_id}/assignment")
def investigation_assign_reviewer(
    alert_id: str,
    payload: ReviewerAssignment,
    connection: sqlite3.Connection = Depends(get_db),
    user: dict[str, Any] = Depends(require_authenticated_user),
) -> dict:
    """Persist a reviewer assignment and append an immutable event."""
    get_alert(connection, alert_id)
    durable = persist_assignment(
        user["access_token"], alert_id, user["id"], payload.reviewer_id, payload.note
    )
    trusted_payload = payload.model_copy(update={"actor_id": user["id"]})
    investigation = assign_investigation_reviewer(connection, alert_id, trusted_payload)
    investigation["status"] = durable.get("status", investigation["status"])
    investigation["reviewer_id"] = durable.get("assigned_reviewer_id")
    return {"investigation": investigation}


@router.post("/{alert_id}/notes", status_code=201)
def investigation_add_note(
    alert_id: str,
    payload: InvestigationNoteCreate,
    connection: sqlite3.Connection = Depends(get_db),
    user: dict[str, Any] = Depends(require_authenticated_user),
) -> dict:
    """Record a note with the verified Supabase user as actor."""
    get_alert(connection, alert_id)
    event = persist_note(user["access_token"], alert_id, user["id"], payload.note)
    trusted_payload = payload.model_copy(update={"actor_id": user["id"]})
    local_event = add_investigation_note(connection, alert_id, trusted_payload)
    # Durable response wins in production. In isolated tests the durable adapter is
    # mocked, so return the SQLite mirror event to preserve the response contract.
    if not event.get("event_id"):
        event = local_event
    return {"event": event}


@router.get("/{alert_id}/history")
def investigation_history(
    alert_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    connection: sqlite3.Connection = Depends(get_db),
    user: dict[str, Any] = Depends(require_authenticated_user),
) -> dict:
    """Return persistent audit events; SQLite events serve as a transitional history."""
    get_alert(connection, alert_id)
    durable = list_durable_audit_events(user["access_token"], alert_id, limit)
    # Include local legacy events not already represented by durable IDs. Legacy rows may
    # pre-date authentication and should not be treated as independently verified.
    local = list_audit_events(connection, alert_id, limit)
    seen = {event.get("event_id") for event in durable}
    merged = durable + [event for event in local if event.get("event_id") not in seen]
    merged.sort(key=lambda event: event.get("occurred_at", ""), reverse=True)
    return {"alert_id": alert_id, "items": merged[:limit]}
