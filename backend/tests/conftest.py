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
def client(seeded_test_database):
    from app.main import app
    with TestClient(app) as test_client:
        yield test_client
