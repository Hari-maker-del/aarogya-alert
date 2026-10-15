"""Investigation-record creation endpoint."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from app.database import get_db
from app.schemas import InvestigationCreate
from app.services.alert_service import create_investigation


router = APIRouter(prefix="/api/alerts", tags=["Investigations"])


@router.post("/{alert_id}/investigations", status_code=201)
def investigation_create(
    alert_id: str,
    payload: InvestigationCreate,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    return {"investigation": create_investigation(connection, alert_id, payload)}
