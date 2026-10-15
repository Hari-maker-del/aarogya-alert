"""System-health endpoint."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from app.config import get_settings
from app.database import get_db


router = APIRouter(prefix="/api", tags=["System"])


@router.get("/health")
def health(connection: sqlite3.Connection = Depends(get_db)) -> dict:
    settings = get_settings()
    observation_count = connection.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
    region_count = connection.execute("SELECT COUNT(*) FROM regions").fetchone()[0]
    latest_date = connection.execute("SELECT MAX(observation_date) FROM observations").fetchone()[0]
    return {
        "status": "ok",
        "api_version": settings.api_version,
        "dataset": {
            "status": "loaded" if observation_count else "empty",
            "region_count": region_count,
            "observation_count": observation_count,
            "latest_observation_date": latest_date,
            "synthetic_only": True,
        },
    }
