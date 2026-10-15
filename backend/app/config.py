"""Application configuration kept deliberately small for the hackathon MVP."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    app_name: str = "AAROGYA ALERT API"
    api_version: str = "1.0.0"
    database_path: Path = BASE_DIR / "data" / "aarogya_alert.db"
    csv_path: Path = BASE_DIR / "data" / "synthetic_observations.csv"
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)
    small_count_threshold: int = 5
    anomaly_threshold: float = 3.5
    detection_lookback_days: int = 7


def get_settings() -> Settings:
    """Build settings from environment variables without requiring a .env package."""
    database_path = Path(
        os.getenv("AAROGYA_DATABASE_PATH", str(BASE_DIR / "data" / "aarogya_alert.db"))
    )
    csv_path = Path(
        os.getenv("AAROGYA_CSV_PATH", str(BASE_DIR / "data" / "synthetic_observations.csv"))
    )
    origins = tuple(
        origin.strip()
        for origin in os.getenv("AAROGYA_CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    )
    return Settings(
        database_path=database_path,
        csv_path=csv_path,
        cors_origins=origins or ("http://localhost:5173",),
        small_count_threshold=int(os.getenv("AAROGYA_SMALL_COUNT_THRESHOLD", "5")),
        anomaly_threshold=float(os.getenv("AAROGYA_ANOMALY_THRESHOLD", "3.5")),
        detection_lookback_days=int(os.getenv("AAROGYA_DETECTION_LOOKBACK_DAYS", "7")),
    )
