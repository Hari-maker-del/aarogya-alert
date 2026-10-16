import pytest

def _first_alert_id(client):
    client.post("/api/detection/run")
    return client.get("/api/alerts").json()["items"][0]["alert_id"]


def test_create_and_update_investigation(client):
    alert_id = _first_alert_id(client)
    created = client.post(
        f"/api/alerts/{alert_id}/investigations",
        json={"status": "assigned", "reviewer_id": "demo-reviewer-1", "findings": "Checking aggregate feed completeness."},
    )
    assert created.status_code == 201
    updated = client.patch(
        f"/api/alerts/{alert_id}/status",
        json={
            "status": "investigating",
            "reviewer_id": "demo-reviewer-1",
            "findings": "Validated aggregate feed timestamps; independent corroboration is pending.",
            "outcome": "Continue review and request a second aggregate source.",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["investigation"]["status"] == "investigating"
    assert updated.json()["investigation"]["findings"] == "Validated aggregate feed timestamps; independent corroboration is pending."
    assert updated.json()["investigation"]["outcome"] == "Continue review and request a second aggregate source."
    assert len(updated.json()["investigation"]["audit_history"]) == 2
    detail = client.get(f"/api/alerts/{alert_id}").json()
    assert detail["investigation_status"] == "investigating"


def test_unknown_alert_returns_consistent_not_found(client):
    response = client.get("/api/alerts/ALT-NOT-REAL")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "request_error"



def test_reviewer_assignment_notes_and_audit_history_are_persisted(client):
    alert_id = _first_alert_id(client)

    assigned = client.patch(
        f"/api/alerts/{alert_id}/assignment",
        json={
            "reviewer_id": "00000000-0000-4000-8000-000000000017",
            "actor_id": "demo-supervisor-1",
            "note": "Assign for independent feed validation.",
        },
    )
    assert assigned.status_code == 200
    assert assigned.json()["investigation"]["reviewer_id"] == "00000000-0000-4000-8000-000000000017"
    assert assigned.json()["investigation"]["status"] in {"assigned", "investigating", "escalated"}

    noted = client.post(
        f"/api/alerts/{alert_id}/notes",
        json={"actor_id": "public-health-reviewer-17", "note": "Compared aggregate feed timestamps."},
    )
    assert noted.status_code == 201
    assert noted.json()["event"]["action"] == "note_added"
    assert noted.json()["event"]["note"] == "Compared aggregate feed timestamps."

    history = client.get(f"/api/alerts/{alert_id}/history")
    assert history.status_code == 200
    events = history.json()["items"]
    assert any(event["action"] == "reviewer_assigned" and event["actor_id"] == "00000000-0000-4000-8000-000000000001" for event in events)
    assert any(event["action"] == "note_added" and event["actor_id"] == "00000000-0000-4000-8000-000000000001" for event in events)

    detail = client.get(f"/api/alerts/{alert_id}").json()
    assert detail["assigned_reviewer_id"] == "00000000-0000-4000-8000-000000000017"
    assert len(detail["audit_events"]) >= 2


def test_audit_events_are_append_only(client):
    import sqlite3

    from app.database import get_connection

    alert_id = _first_alert_id(client)
    event = client.post(
        f"/api/alerts/{alert_id}/notes",
        json={"actor_id": "reviewer-readonly-test", "note": "Audit immutability check."},
    ).json()["event"]

    with get_connection() as connection:
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            connection.execute(
                "UPDATE audit_events SET note=? WHERE event_id=?",
                ("tampered", event["event_id"]),
            )

def test_pending_reviewer_cannot_write_workflow(client):
    from app.auth import require_active_reviewer
    from app.main import app

    app.dependency_overrides[require_active_reviewer] = lambda: (_ for _ in ()).throw(
        __import__("fastapi").HTTPException(status_code=403, detail="awaiting administrator approval")
    )
    alert_id = _first_alert_id(client)
    response = client.post(
        f"/api/alerts/{alert_id}/notes",
        json={"actor_id": "untrusted-client", "note": "This should not be accepted."},
    )
    assert response.status_code == 403


def test_assignable_reviewers_only_returns_approved_accounts(client, monkeypatch):
    from app.api import reviewers as reviewers_api

    monkeypatch.setattr(reviewers_api, "list_reviewer_roles", lambda _token: [
        {"user_id": "00000000-0000-4000-8000-000000000011", "email": "approved@example.test", "role": "reviewer"},
        {"user_id": "00000000-0000-4000-8000-000000000012", "email": "admin@example.test", "role": "admin"},
        {"user_id": "00000000-0000-4000-8000-000000000013", "email": "pending@example.test", "role": "pending"},
    ])

    response = client.get("/api/reviewers/assignable")

    assert response.status_code == 200
    assert [item["role"] for item in response.json()["items"]] == ["reviewer", "admin"]
    assert all("requested_at" not in item for item in response.json()["items"])


def test_assignable_reviewers_requires_active_reviewer(client, monkeypatch):
    from app.main import app
    from app.auth import require_active_reviewer
    from fastapi import HTTPException
    from app.api import reviewers as reviewers_api

    monkeypatch.setattr(reviewers_api, "list_reviewer_roles", lambda _token: pytest.fail("must not query reviewer directory"))
    app.dependency_overrides[require_active_reviewer] = lambda: (_ for _ in ()).throw(HTTPException(status_code=403, detail="Reviewer approval required"))
    try:
        response = client.get("/api/reviewers/assignable")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(require_active_reviewer, None)
