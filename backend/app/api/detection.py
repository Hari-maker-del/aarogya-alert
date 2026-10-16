"""Detection run and status endpoints."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from app.auth import require_active_reviewer
from app.database import get_db
from app.services.alert_service import latest_detection_status, run_detection


router = APIRouter(prefix="/api/detection", tags=["Detection"])


@router.post("/run")
def detection_run(
    connection: sqlite3.Connection = Depends(get_db),
    _: dict = Depends(require_active_reviewer),
) -> dict:
    return run_detection(connection)


@router.get("/status")
def detection_status(connection: sqlite3.Connection = Depends(get_db)) -> dict:
    return latest_detection_status(connection)
