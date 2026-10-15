"""Explainable-alert endpoints."""
from __future__ import annotations

import sqlite3
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends

from app.auth import optional_authenticated_user, require_authenticated_user
from app.database import get_db
from app.services.alert_service import alert_summary, get_alert, list_alerts, update_investigation_status
from app.services.supabase_workflow import (
    get_workflow, list_durable_audit_events, list_workflows, persist_status,
)
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
    user: dict[str, Any] | None = Depends(optional_authenticated_user),
) -> dict:
    require_known_priority(review_priority)
    require_known_investigation_status(investigation_status)
    require_valid_date_range(start_date, end_date)
    items = list_alerts(
        connection, region_id, review_priority, investigation_status,
        start_date.isoformat() if start_date else None, end_date.isoformat() if end_date else None,
    )
    if user:
        durable = {item["alert_id"]: item for item in list_workflows(user["access_token"])}
        for item in items:
            workflow = durable.get(item["alert_id"])
            if workflow:
                item["investigation_status"] = workflow["status"]
                item["assigned_reviewer_id"] = workflow.get("assigned_reviewer_id")
    return {"items": items}


@router.patch("/{alert_id}/status")
def alert_status(
    alert_id: str,
    payload: InvestigationStatusUpdate,
    connection: sqlite3.Connection = Depends(get_db),
    user: dict[str, Any] = Depends(require_authenticated_user),
) -> dict:
    alert = get_alert(connection, alert_id)
    durable = persist_status(
        user["access_token"], alert_id, user["id"], payload.status,
        payload.findings, payload.outcome,
    )
    trusted_payload = payload.model_copy(update={"actor_id": user["id"], "reviewer_id": user["id"]})
    investigation = update_investigation_status(connection, alert_id, trusted_payload)
    investigation["status"] = durable.get("status", payload.status)
    investigation["reviewer_id"] = durable.get("assigned_reviewer_id")
    return {"investigation": investigation}


@router.get("/{alert_id}")
def alert_detail(
    alert_id: str,
    connection: sqlite3.Connection = Depends(get_db),
    user: dict[str, Any] | None = Depends(optional_authenticated_user),
) -> dict:
    alert = get_alert(connection, alert_id)
    if not user:
        # Do not expose legacy demo audit records as if they had verified authors.
        alert["audit_events"] = []
        alert["assigned_reviewer_id"] = None
        alert["investigations"] = []
        return alert
    workflow = get_workflow(user["access_token"], alert_id)
    if not workflow:
        alert["audit_events"] = []
        alert["assigned_reviewer_id"] = None
        alert["investigations"] = []
        return alert
    alert["investigation_status"] = workflow["status"]
    alert["assigned_reviewer_id"] = workflow.get("assigned_reviewer_id")
    alert["investigations"] = [{
        "investigation_id": "SUPABASE-" + alert_id,
        "alert_id": alert_id,
        "status": workflow["status"],
        "reviewer_id": workflow.get("assigned_reviewer_id"),
        "findings": workflow.get("findings"),
        "outcome": workflow.get("outcome"),
        "created_at": workflow.get("created_at"),
        "updated_at": workflow.get("updated_at"),
    }]
    durable_events = list_durable_audit_events(user["access_token"], alert_id, 100)
    alert["audit_events"] = durable_events
    return alert
