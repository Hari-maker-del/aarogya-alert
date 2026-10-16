"""Route-level authorization regression matrix.

These tests replace the auth dependencies with explicit deny functions so they
verify route wiring without contacting Supabase or depending on a real account.
"""
from fastapi import HTTPException

from app.auth import (
    optional_authenticated_user,
    require_active_reviewer,
    require_admin,
    require_authenticated_user,
)
from app.main import app


def _deny_unauthenticated():
    raise HTTPException(status_code=401, detail="test: sign-in required")


def _deny_reviewer():
    raise HTTPException(status_code=403, detail="test: active reviewer required")


def _deny_admin():
    raise HTTPException(status_code=403, detail="test: administrator required")


def test_reviewer_profile_requires_sign_in(client):
    app.dependency_overrides[require_authenticated_user] = _deny_unauthenticated
    response = client.get("/api/reviewers/me")
    assert response.status_code == 401


def test_detection_run_requires_active_reviewer(client):
    app.dependency_overrides[require_active_reviewer] = _deny_reviewer
    response = client.post("/api/detection/run")
    assert response.status_code == 403


def test_investigation_write_routes_require_active_reviewer(client):
    app.dependency_overrides[require_active_reviewer] = _deny_reviewer
    requests = [
        ("POST", "/api/alerts/ALT-001/investigations", {"status": "new"}),
        ("PATCH", "/api/alerts/ALT-001/status", {"status": "investigating"}),
        ("PATCH", "/api/alerts/ALT-001/assignment", {"reviewer_id": "reviewer-2"}),
        ("POST", "/api/alerts/ALT-001/notes", {"note": "Review source data"}),
        ("GET", "/api/alerts/ALT-001/history", None),
        ("GET", "/api/reviewers/assignable", None),
    ]
    for method, url, payload in requests:
        response = client.request(method, url, json=payload) if payload is not None else client.get(url)
        assert response.status_code == 403, f"{method} {url}: {response.status_code} {response.text}"


def test_reviewer_directory_requires_admin(client):
    app.dependency_overrides[require_admin] = _deny_admin
    response = client.get("/api/reviewers")
    assert response.status_code == 403


def test_role_changes_require_admin(client):
    app.dependency_overrides[require_admin] = _deny_admin
    response = client.patch(
        "/api/reviewers/00000000-0000-4000-8000-000000000002/role",
        json={"role": "reviewer"},
    )
    assert response.status_code == 403


def test_invalid_bearer_token_is_rejected_on_authenticated_alert_reads(client):
    def reject_invalid_session():
        raise HTTPException(status_code=401, detail="Reviewer session is invalid or expired.")

    app.dependency_overrides[optional_authenticated_user] = reject_invalid_session
    for url in ("/api/alerts", "/api/alerts/ALT-001"):
        response = client.get(url, headers={"Authorization": "Bearer invalid-test-token"})
        assert response.status_code == 401, f"GET {url}: {response.status_code} {response.text}"


def test_public_alert_summary_does_not_require_authentication(client):
    response = client.get(
        "/api/alerts/summary",
        headers={"Authorization": "Bearer invalid-test-token"},
    )
    assert response.status_code == 200


def test_public_alert_reads_remain_public_without_a_bearer_token(client):
    app.dependency_overrides[optional_authenticated_user] = lambda: None
    assert client.get("/api/alerts").status_code == 200
    assert client.get("/api/alerts/summary").status_code == 200
