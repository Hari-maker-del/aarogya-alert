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
        json={"status": "investigating", "reviewer_id": "demo-reviewer-1"},
    )
    assert updated.status_code == 200
    assert updated.json()["investigation"]["status"] == "investigating"
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
            "reviewer_id": "public-health-reviewer-17",
            "actor_id": "demo-supervisor-1",
            "note": "Assign for independent feed validation.",
        },
    )
    assert assigned.status_code == 200
    assert assigned.json()["investigation"]["reviewer_id"] == "public-health-reviewer-17"
    assert assigned.json()["investigation"]["status"] == "assigned"

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
    assert any(event["action"] == "reviewer_assigned" and event["actor_id"] == "demo-supervisor-1" for event in events)
    assert any(event["action"] == "note_added" and event["actor_id"] == "public-health-reviewer-17" for event in events)

    detail = client.get(f"/api/alerts/{alert_id}").json()
    assert detail["assigned_reviewer_id"] == "public-health-reviewer-17"
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
