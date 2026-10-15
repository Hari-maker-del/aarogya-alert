"""Deterministic isolated database setup for API tests."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


PROJECT_DIR = Path(__file__).resolve().parent.parent
TEST_DB = PROJECT_DIR / "data" / "test_aarogya_alert.db"
TEST_CSV = PROJECT_DIR / "data" / "test_synthetic_observations.csv"
os.environ["AAROGYA_DATABASE_PATH"] = str(TEST_DB)
os.environ["AAROGYA_CSV_PATH"] = str(TEST_CSV)


@pytest.fixture(scope="session", autouse=True)
def seeded_test_database():
    if TEST_DB.exists():
        TEST_DB.unlink()
    from app.seed_data import seed_database
    seed_database()
    yield
    import gc
    gc.collect()
    try:
        if TEST_DB.exists():
            TEST_DB.unlink()
    except (PermissionError, OSError):
        pass
    try:
        if TEST_CSV.exists():
            TEST_CSV.unlink()
    except (PermissionError, OSError):
        pass


@pytest.fixture()
def client(seeded_test_database, monkeypatch):
    from app.main import app
    from app.auth import optional_authenticated_user, require_authenticated_user
    from app.api import alerts as alerts_api, investigations as investigations_api
    from app.services import supabase_workflow

    user = {"id": "00000000-0000-4000-8000-000000000001", "email": "reviewer@example.test", "access_token": "test-access-token"}
    app.dependency_overrides[require_authenticated_user] = lambda: user
    app.dependency_overrides[optional_authenticated_user] = lambda: user
    # Keep route tests isolated from external Supabase services while exercising the
    # SQLite mirror and API response contract. Durable HTTP calls are covered separately.
    monkeypatch.setattr(alerts_api, "persist_status", lambda *args, **kwargs: {"status": args[3] if len(args) > 3 else "new", "assigned_reviewer_id": user["id"]})
    def fake_get_workflow(_token, alert_id):
        from app.database import get_connection
        with get_connection() as connection:
            row = connection.execute(
                "SELECT status, reviewer_id, findings, outcome, created_at, updated_at FROM investigations "
                "WHERE alert_id=? ORDER BY updated_at DESC, created_at DESC LIMIT 1",
                (alert_id,),
            ).fetchone()
        if not row:
            return None
        value = dict(row)
        value["assigned_reviewer_id"] = value.pop("reviewer_id")
        return value
    monkeypatch.setattr(alerts_api, "get_workflow", fake_get_workflow)
    monkeypatch.setattr(alerts_api, "list_workflows", lambda *args, **kwargs: [])
    monkeypatch.setattr(alerts_api, "list_durable_audit_events", lambda *args, **kwargs: [])
    monkeypatch.setattr(investigations_api, "persist_assignment", lambda *args, **kwargs: {"status": "assigned", "assigned_reviewer_id": args[3] if len(args) > 3 else None})
    monkeypatch.setattr(investigations_api, "persist_create_investigation", lambda *args, **kwargs: {"status": "assigned"})
    monkeypatch.setattr(investigations_api, "persist_note", lambda *args, **kwargs: {"action": "note_added"})
    monkeypatch.setattr(investigations_api, "list_durable_audit_events", lambda *args, **kwargs: [])
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
