"""Supabase/PostgREST persistence for authenticated investigation workflows."""
from __future__ import annotations

import os
import uuid
from typing import Any

import httpx
from fastapi import HTTPException


def _config() -> tuple[str, str]:
    url = os.getenv("AAROGYA_SUPABASE_URL", "").rstrip("/")
    key = os.getenv("AAROGYA_SUPABASE_PUBLISHABLE_KEY", "")
    if not url or not key:
        raise HTTPException(status_code=503, detail="Durable investigation storage is not configured.")
    return url, key


def _rest(
    method: str,
    resource: str,
    token: str,
    *,
    params: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    prefer: str | None = None,
) -> Any:
    url, key = _config()
    headers = {"apikey": key, "Authorization": f"Bearer {token}", "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    try:
        response = httpx.request(
            method, f"{url}/rest/v1/{resource}", params=params, json=body, headers=headers, timeout=10.0
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Durable investigation storage is temporarily unavailable.") from exc
    if not response.is_success:
        if response.status_code in (401, 403):
            raise HTTPException(status_code=403, detail="Supabase rejected this reviewer's access to the workflow record.")
        if response.status_code == 409:
            raise HTTPException(status_code=409, detail="A concurrent investigation update needs to be retried.")
        # Do not relay raw Postgres errors or request details to public callers.
        raise HTTPException(status_code=502, detail="Could not save the durable investigation record.")
    if not response.content:
        return None
    try:
        return response.json()
    except ValueError:
        return None


def get_workflow(token: str, alert_id: str) -> dict[str, Any] | None:
    result = _rest("GET", "alert_investigations", token,
                   params={"select": "*", "alert_id": f"eq.{alert_id}", "limit": "1"})
    return result[0] if result else None


def list_workflows(token: str) -> list[dict[str, Any]]:
    return _rest(
        "GET", "alert_investigations", token,
        params={"select": "alert_id,status,assigned_reviewer_id,created_at,updated_at", "order": "updated_at.desc", "limit": "1000"},
    ) or []


def list_durable_audit_events(token: str, alert_id: str, limit: int = 100) -> list[dict[str, Any]]:
    rows = _rest(
        "GET", "audit_events", token,
        params={
            "select": "id,event_id,alert_id,actor_id,action,occurred_at,before_json,after_json,note",
            "alert_id": f"eq.{alert_id}", "order": "occurred_at.desc,id.desc", "limit": str(limit),
        },
    ) or []
    return [_serialize_event(row) for row in rows]


def _serialize_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": row.get("event_id"),
        "alert_id": row.get("alert_id"),
        "actor_id": row.get("actor_id"),
        "action": row.get("action"),
        "occurred_at": row.get("occurred_at"),
        "before": row.get("before_json"),
        "after": row.get("after_json"),
        "note": row.get("note"),
        "source": "supabase",
    }


def _ensure_workflow(token: str, alert_id: str, actor_id: str, *, status: str = "new",
                     assigned_reviewer_id: str | None = None) -> dict[str, Any]:
    existing = get_workflow(token, alert_id)
    if existing:
        return existing
    body = {"alert_id": alert_id, "status": status, "created_by": actor_id}
    if assigned_reviewer_id:
        body["assigned_reviewer_id"] = assigned_reviewer_id
    created = _rest("POST", "alert_investigations", token, body=body, prefer="return=representation")
    if created:
        return created[0]
    # A concurrent insert can win after the initial lookup.
    existing = get_workflow(token, alert_id)
    if existing:
        return existing
    raise HTTPException(status_code=502, detail="Could not initialize the durable investigation record.")


def _append_event(token: str, *, alert_id: str, actor_id: str, action: str,
                  before: dict[str, Any] | None = None, after: dict[str, Any] | None = None,
                  note: str | None = None) -> dict[str, Any]:
    inserted = _rest(
        "POST", "audit_events", token,
        body={
            "alert_id": alert_id, "actor_id": actor_id, "action": action,
            "before_json": before, "after_json": after, "note": note,
        },
        prefer="return=representation",
    )
    return _serialize_event(inserted[0]) if inserted else {}


def persist_status(
    token: str, alert_id: str, actor_id: str, new_status: str,
    findings: str | None = None, outcome: str | None = None,
) -> dict[str, Any]:
    current = _ensure_workflow(
        token, alert_id, actor_id, status="new",
        assigned_reviewer_id=actor_id if new_status in {"assigned", "investigating", "escalated"} else None,
    )
    before = {"status": current["status"], "assigned_reviewer_id": current.get("assigned_reviewer_id")}
    patch: dict[str, Any] = {"status": new_status}
    if findings is not None:
        patch["findings"] = findings
    if outcome is not None:
        patch["outcome"] = outcome
    updated_rows = _rest(
        "PATCH", "alert_investigations", token,
        params={"alert_id": f"eq.{alert_id}", "select": "*"},
        body=patch, prefer="return=representation",
    )
    updated = updated_rows[0] if updated_rows else {**current, **patch}
    after = {"status": updated["status"], "assigned_reviewer_id": updated.get("assigned_reviewer_id")}
    _append_event(token, alert_id=alert_id, actor_id=actor_id, action="status_updated",
                  before=before, after=after, note=findings or outcome)
    return updated


def persist_assignment(token: str, alert_id: str, actor_id: str, reviewer_id: str,
                       note: str | None = None) -> dict[str, Any]:
    try:
        reviewer_id = str(uuid.UUID(reviewer_id))
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=422, detail="Reviewer ID must be a registered Supabase user UUID.") from exc
    current = _ensure_workflow(
        token, alert_id, actor_id, status="assigned", assigned_reviewer_id=reviewer_id
    )
    next_status = "assigned" if current["status"] == "new" else current["status"]
    before = {"status": current["status"], "assigned_reviewer_id": current.get("assigned_reviewer_id")}
    patch = {"assigned_reviewer_id": reviewer_id, "status": next_status}
    updated_rows = _rest(
        "PATCH", "alert_investigations", token,
        params={"alert_id": f"eq.{alert_id}", "select": "*"},
        body=patch, prefer="return=representation",
    )
    updated = updated_rows[0] if updated_rows else {**current, **patch}
    after = {"status": updated["status"], "assigned_reviewer_id": updated.get("assigned_reviewer_id")}
    _append_event(token, alert_id=alert_id, actor_id=actor_id, action="reviewer_assigned",
                  before=before, after=after, note=note)
    return updated


def persist_note(token: str, alert_id: str, actor_id: str, note: str) -> dict[str, Any]:
    current = _ensure_workflow(token, alert_id, actor_id)
    return _append_event(
        token, alert_id=alert_id, actor_id=actor_id, action="note_added",
        before={"status": current["status"], "assigned_reviewer_id": current.get("assigned_reviewer_id")},
        after={"status": current["status"], "assigned_reviewer_id": current.get("assigned_reviewer_id")},
        note=note,
    )


def persist_create_investigation(
    token: str, alert_id: str, actor_id: str, new_status: str,
    findings: str | None = None, outcome: str | None = None,
) -> dict[str, Any]:
    current = _ensure_workflow(
        token, alert_id, actor_id, status=new_status,
        assigned_reviewer_id=actor_id if new_status in {"assigned", "investigating", "escalated"} else None,
    )
    before = {"status": current["status"], "assigned_reviewer_id": current.get("assigned_reviewer_id")}
    patch: dict[str, Any] = {"status": new_status}
    if findings is not None:
        patch["findings"] = findings
    if outcome is not None:
        patch["outcome"] = outcome
    rows = _rest(
        "PATCH", "alert_investigations", token,
        params={"alert_id": f"eq.{alert_id}", "select": "*"},
        body=patch, prefer="return=representation",
    )
    updated = rows[0] if rows else {**current, **patch}
    _append_event(
        token, alert_id=alert_id, actor_id=actor_id, action="investigation_created",
        before=before, after={"status": updated["status"], "assigned_reviewer_id": updated.get("assigned_reviewer_id")},
        note=findings or outcome,
    )
    return updated
