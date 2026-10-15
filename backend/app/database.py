"""SQLite schema and safe connection helpers."""

from __future__ import annotations

import sqlite3
from collections.abc import Generator

from app.config import get_settings


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS regions (
    region_id TEXT PRIMARY KEY,
    region_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    population_band TEXT NOT NULL,
    neighbor_ids TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    region_id TEXT NOT NULL REFERENCES regions(region_id),
    observation_date TEXT NOT NULL,
    indicator_type TEXT NOT NULL,
    aggregated_count INTEGER NOT NULL CHECK (aggregated_count >= 0),
    source_type TEXT NOT NULL,
    population_band TEXT NOT NULL,
    data_quality_status TEXT NOT NULL,
    is_injected_anomaly INTEGER NOT NULL DEFAULT 0,
    UNIQUE(region_id, observation_date, indicator_type)
);
CREATE INDEX IF NOT EXISTS idx_observations_filters
    ON observations(region_id, indicator_type, observation_date);

CREATE TABLE IF NOT EXISTS alerts (
    alert_id TEXT PRIMARY KEY,
    dedup_key TEXT NOT NULL UNIQUE,
    region_id TEXT NOT NULL REFERENCES regions(region_id),
    region_name TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    observation_date TEXT NOT NULL,
    observation_window TEXT NOT NULL,
    indicator_type TEXT NOT NULL,
    observed_value INTEGER NOT NULL,
    expected_baseline REAL NOT NULL,
    absolute_difference REAL NOT NULL,
    percentage_change REAL,
    anomaly_score REAL NOT NULL,
    detection_threshold REAL NOT NULL,
    baseline_observation_count INTEGER NOT NULL,
    review_priority TEXT NOT NULL,
    contributing_signals TEXT NOT NULL,
    supporting_evidence TEXT NOT NULL,
    uncertainty_notes TEXT NOT NULL,
    data_quality_status TEXT NOT NULL,
    recommended_verification_steps TEXT NOT NULL,
    investigation_status TEXT NOT NULL DEFAULT 'new',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_filters
    ON alerts(region_id, review_priority, investigation_status, observation_date);

CREATE TABLE IF NOT EXISTS investigations (
    investigation_id TEXT PRIMARY KEY,
    alert_id TEXT NOT NULL REFERENCES alerts(alert_id),
    status TEXT NOT NULL,
    reviewer_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    findings TEXT,
    outcome TEXT,
    audit_history TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS detection_runs (
    run_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    observations_evaluated INTEGER NOT NULL DEFAULT 0,
    alerts_created INTEGER NOT NULL DEFAULT 0,
    alerts_updated INTEGER NOT NULL DEFAULT 0,
    message TEXT
);

-- Append-only workflow audit trail. Events are never updated in-place.
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    alert_id TEXT NOT NULL REFERENCES alerts(alert_id),
    investigation_id TEXT REFERENCES investigations(investigation_id),
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    note TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_events_alert_time
    ON audit_events(alert_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_time
    ON audit_events(actor_id, occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are append-only');
END;
CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are append-only');
END;
"""


def get_connection() -> sqlite3.Connection:
    settings = get_settings()
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(settings.database_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(SCHEMA)


def get_db() -> Generator[sqlite3.Connection, None, None]:
    connection = get_connection()
    try:
        yield connection
    finally:
        connection.close()
