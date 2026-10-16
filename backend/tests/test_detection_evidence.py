from __future__ import annotations

import sqlite3

from app import database


def test_detection_run_persists_explanation_fields_on_alerts(client):
    response = client.post("/api/detection/run")
    assert response.status_code == 200
    alerts = client.get("/api/alerts").json()["items"]
    assert alerts, "seeded demo should produce at least one review signal"
    alert = alerts[0]
    assert alert["baseline_method"] in {"day_of_week_median_mad", "rolling_28_day_median_mad", "not_recorded"}
    assert alert["evidence_sufficiency"] in {"adequate", "limited", "insufficient", "not_recorded"}
    assert alert["detection_status"] in {"signal", "not_recorded"}
    assert alert["detection_reason"]


def test_init_db_adds_evidence_columns_to_legacy_alert_table(monkeypatch):
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute("""
        CREATE TABLE alerts (
            alert_id TEXT PRIMARY KEY,
            dedup_key TEXT NOT NULL UNIQUE,
            region_id TEXT NOT NULL,
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
        )
    """)
    monkeypatch.setattr(database, "get_connection", lambda: connection)

    database.init_db()

    columns = {row["name"] for row in connection.execute("PRAGMA table_info(alerts)")}
    assert {"baseline_method", "evidence_sufficiency", "detection_status", "detection_reason"} <= columns
    connection.close()
