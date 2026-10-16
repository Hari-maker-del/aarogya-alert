"""Regression coverage for authorization and durable workflow records."""

from __future__ import annotations

import httpx
import pytest
from fastapi import HTTPException

from app.auth import require_active_reviewer, require_authenticated_user, optional_authenticated_user, require_admin
from app.main import app
from app.services import supabase_workflow


def _first_alert_id(client):
    response = client.post("/api/detection/run")
    assert response.status_code == 200
    return client.get("/api/alerts").json()["items"][0]["alert_id"]


def test_unauthenticated_session_cannot_change_alert_status(client):
    alert_id = _first_alert_id(client)

    app.dependency_overrides.pop(require_active_reviewer, None)
    app.dependency_overrides.pop(require_authenticated_user, None)
    app.dependency_overrides.pop(optional_authenticated_user, None)

    response = client.patch(
        f"/api/alerts/{alert_id}/status",
        json={"status": "investigating", "actor_id": "spoofed-client"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "request_error"


def test_pending_reviewer_cannot_change_status_or_write_durable_history(client, monkeypatch):
    from app.api import alerts as alerts_api

    alert_id = _first_alert_id(client)
    original_persist = alerts_api.persist_status

    def should_not_persist(*args, **kwargs):
        pytest.fail("A pending reviewer must be rejected before durable persistence.")

    monkeypatch.setattr(alerts_api, "persist_status", should_not_persist)
    app.dependency_overrides.pop(require_active_reviewer, None)
    monkeypatch.setattr("app.auth.get_reviewer_role", lambda user: "pending")

    response = client.patch(
        f"/api/alerts/{alert_id}/status",
        json={"status": "investigating", "actor_id": "spoofed-client"},
    )

    assert response.status_code == 403
    assert "awaiting administrator approval" in response.json()["error"]["message"]
    assert alerts_api.persist_status is should_not_persist
    assert original_persist is not should_not_persist


def test_verified_session_identity_wins_over_client_supplied_actor_and_reviewer(client):
    alert_id = _first_alert_id(client)
    response = client.patch(
        f"/api/alerts/{alert_id}/status",
        json={
            "status": "investigating",
            "actor_id": "spoofed-actor",
            "reviewer_id": "spoofed-reviewer",
            "findings": "Validated synthetic data window.",
        },
    )

    assert response.status_code == 200
    investigation = response.json()["investigation"]
    assert investigation["reviewer_id"] == "00000000-0000-4000-8000-000000000001"
    assert investigation["audit_history"][-1]["actor_id"] == "00000000-0000-4000-8000-000000000001"
    assert investigation["audit_history"][-1]["after"]["investigation_status"] == "investigating"


def test_history_endpoint_prefers_durable_events_and_obeys_requested_limit(client, monkeypatch):
    from app.api import investigations as investigations_api

    alert_id = _first_alert_id(client)
    captured = {}

    def durable_history(token, requested_alert_id, limit):
        captured.update(token=token, alert_id=requested_alert_id, limit=limit)
        return [{
            "event_id": "SUPABASE-EVENT-01",
            "alert_id": requested_alert_id,
            "actor_id": "00000000-0000-4000-8000-000000000001",
            "action": "status_updated",
            "occurred_at": "2026-10-15T10:00:00Z",
            "source": "supabase",
        }]

    monkeypatch.setattr(investigations_api, "list_durable_audit_events", durable_history)
    response = client.get(f"/api/alerts/{alert_id}/history?limit=1")

    assert response.status_code == 200
    assert captured == {
        "token": "test-access-token",
        "alert_id": alert_id,
        "limit": 1,
    }
    assert response.json()["items"][0]["source"] == "supabase"
    assert response.json()["items"][0]["event_id"] == "SUPABASE-EVENT-01"


def test_durable_status_update_uses_atomic_rpc_and_verified_actor(monkeypatch):
    monkeypatch.setenv("AAROGYA_SUPABASE_URL", "https://sample-project.supabase.co")
    monkeypatch.setenv("AAROGYA_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
    requests = []
    alert_id = "ALT-REGTEST-20261015-RESP"
    actor_id = "00000000-0000-4000-8000-000000000001"

    def fake_request(method, url, *, params=None, json=None, headers=None, timeout=None):
        requests.append({"method": method, "url": url, "json": json, "headers": headers or {}})
        assert method == "POST"
        assert url.endswith("/rpc/apply_investigation_change")
        return httpx.Response(200, json={
            "investigation": {
                "alert_id": alert_id, "status": "investigating",
                "assigned_reviewer_id": actor_id, "findings": "Verified feed window."
            },
            "audit_event": {
                "event_id": "DURABLE-EVENT-01", "alert_id": alert_id,
                "actor_id": actor_id, "action": "status_updated",
                "occurred_at": "2026-10-15T10:00:00Z", "source": "supabase"
            }
        }, request=httpx.Request(method, url))

    monkeypatch.setattr(supabase_workflow.httpx, "request", fake_request)
    result = supabase_workflow.persist_status(
        "verified-token", alert_id, actor_id, "investigating",
        findings="Verified feed window.",
    )
    assert result["status"] == "investigating"
    assert len(requests) == 1
    request = requests[0]
    assert request["url"].endswith("/rpc/apply_investigation_change")
    assert request["headers"]["Authorization"] == "Bearer verified-token"
    assert request["json"]["p_alert_id"] == alert_id
    assert request["json"]["p_action"] == "status_updated"
    assert request["json"]["p_new_status"] == "investigating"
    assert request["json"]["p_findings"] == "Verified feed window."


def test_audit_event_reader_marks_records_as_supabase_source(monkeypatch):
    monkeypatch.setenv("AAROGYA_SUPABASE_URL", "https://sample-project.supabase.co")
    monkeypatch.setenv("AAROGYA_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
    captured = {}

    def fake_request(method, url, *, params=None, json=None, headers=None, timeout=None):
        captured.update(method=method, url=url, params=params or {}, headers=headers or {})
        return httpx.Response(
            200,
            json=[{
                "event_id": "DURABLE-EVENT-02",
                "alert_id": "ALT-TEST",
                "actor_id": "verified-reviewer",
                "action": "note_added",
                "occurred_at": "2026-10-15T10:00:00Z",
                "before_json": {"status": "new"},
                "after_json": {"status": "new"},
                "note": "A durable note.",
            }],
            request=httpx.Request(method, url),
        )

    monkeypatch.setattr(supabase_workflow.httpx, "request", fake_request)
    events = supabase_workflow.list_durable_audit_events("verified-token", "ALT-TEST", 7)

    assert captured["method"] == "GET"
    assert captured["url"].endswith("/audit_events")
    assert captured["params"]["limit"] == "7"
    assert captured["params"]["alert_id"] == "eq.ALT-TEST"
    assert captured["headers"]["Authorization"] == "Bearer verified-token"
    assert events[0]["source"] == "supabase"
    assert events[0]["before"] == {"status": "new"}
    assert events[0]["after"] == {"status": "new"}



def test_pending_reviewer_cannot_write_notes_or_assignments(client, monkeypatch):
    from app.api import investigations as investigations_api

    alert_id = _first_alert_id(client)

    def should_not_persist(*args, **kwargs):
        pytest.fail("A pending reviewer must be rejected before durable persistence.")

    monkeypatch.setattr(investigations_api, "persist_note", should_not_persist)
    monkeypatch.setattr(investigations_api, "persist_assignment", should_not_persist)
    app.dependency_overrides.pop(require_active_reviewer, None)
    monkeypatch.setattr("app.auth.get_reviewer_role", lambda user: "pending")

    note_response = client.post(
        f"/api/alerts/{alert_id}/notes",
        json={"note": "This write must be rejected."},
    )
    assignment_response = client.patch(
        f"/api/alerts/{alert_id}/assignment",
        json={"reviewer_id": "00000000-0000-4000-8000-000000000001"},
    )

    assert note_response.status_code == 403
    assert assignment_response.status_code == 403
    assert "awaiting administrator approval" in note_response.json()["error"]["message"]
    assert "awaiting administrator approval" in assignment_response.json()["error"]["message"]


def test_pending_reviewer_cannot_read_admin_access_review_or_change_roles(client, monkeypatch):
    app.dependency_overrides.pop(require_active_reviewer, None)
    app.dependency_overrides.pop(require_admin, None)
    monkeypatch.setattr("app.auth.get_reviewer_role", lambda user: "pending")

    list_response = client.get("/api/reviewers")
    role_response = client.patch(
        "/api/reviewers/00000000-0000-4000-8000-000000000002/role",
        json={"role": "reviewer"},
    )

    assert list_response.status_code == 403
    assert role_response.status_code == 403
    assert "awaiting administrator approval" in list_response.json()["error"]["message"]
    assert "awaiting administrator approval" in role_response.json()["error"]["message"]


def test_admin_cannot_change_own_role(client, monkeypatch):
    app.dependency_overrides.pop(require_active_reviewer, None)
    app.dependency_overrides.pop(require_admin, None)
    monkeypatch.setattr("app.auth.get_reviewer_role", lambda user: "admin")

    response = client.patch(
        "/api/reviewers/00000000-0000-4000-8000-000000000001/role",
        json={"role": "reviewer"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "Admins cannot change their own role."



def test_status_change_fails_closed_when_atomic_rpc_does_not_confirm_audit(monkeypatch):
    monkeypatch.setenv("AAROGYA_SUPABASE_URL", "https://sample-project.supabase.co")
    monkeypatch.setenv("AAROGYA_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")

    def fake_request(method, url, *, params=None, json=None, headers=None, timeout=None):
        assert method == "POST"
        assert url.endswith("/rpc/apply_investigation_change")
        return httpx.Response(200, json={
            "investigation": {"alert_id": "ALT-REGTEST-AUDIT-FAIL", "status": "investigating"},
            "audit_event": {}
        }, request=httpx.Request(method, url))

    monkeypatch.setattr(supabase_workflow.httpx, "request", fake_request)
    with pytest.raises(HTTPException) as error:
        supabase_workflow.persist_status(
            "verified-token", "ALT-REGTEST-AUDIT-FAIL",
            "00000000-0000-4000-8000-000000000001", "investigating"
        )
    assert error.value.status_code == 502
    assert "audit event" in error.value.detail
