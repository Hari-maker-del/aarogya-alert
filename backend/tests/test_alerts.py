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
