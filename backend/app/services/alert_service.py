"""Detection orchestration, alert persistence, and investigation workflow."""

from __future__ import annotations

import json
import sqlite3
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status

from app.config import get_settings
from app.services.anomaly_detector import evaluate_observation
from app.services.corroboration_service import assess_corroboration
from app.services.data_service import get_detection_observations, get_history
from app.services.spatial_service import anomalous_neighbors


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _alert_id(region_id: str, observation_date: str, indicator_type: str) -> str:
    indicator_code = {"respiratory_medicine_demand": "RESP", "fever_clinic_visits": "FEV", "gastrointestinal_clinic_visits": "GI"}[indicator_type]
    return f"ALT-{region_id.replace('REG-', '')}-{observation_date.replace('-', '')}-{indicator_code}"


def _serialize_alert(row: sqlite3.Row) -> dict[str, Any]:
    value = dict(row)
    for key in ("contributing_signals", "supporting_evidence", "uncertainty_notes", "recommended_verification_steps"):
        value[key] = json.loads(value[key])
    value["active"] = bool(value["active"])
    return value


def run_detection(connection: sqlite3.Connection) -> dict[str, Any]:
    """Evaluate recent eligible observations and idempotently create/update alerts."""
    run_id = f"RUN-{uuid.uuid4().hex[:12].upper()}"
    started_at = now_iso()
    connection.execute(
        "INSERT INTO detection_runs(run_id, started_at, status) VALUES (?, ?, 'running')",
        (run_id, started_at),
    )
    settings = get_settings()
    observations = get_detection_observations(connection, settings.detection_lookback_days)
    evaluated: list[dict] = []
    try:
        for observation in observations:
            history = get_history(connection, observation["region_id"], observation["indicator_type"], observation["observation_date"])
            evaluated.append(evaluate_observation(observation, history, settings.anomaly_threshold))

        grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for candidate in evaluated:
            grouped[(candidate["region_id"], candidate["observation_date"])].append(candidate)
        anomalous_keys = {
            (candidate["region_id"], candidate["observation_date"])
            for candidate in evaluated if candidate["is_anomaly"]
        }
        created = 0
        updated = 0
        resulting_alerts: list[dict] = []

        for (region_id, observation_date), candidates in grouped.items():
            anomalies = [candidate for candidate in candidates if candidate["is_anomaly"]]
            if not anomalies:
                continue
            nearby = anomalous_neighbors(region_id, observation_date, anomalous_keys)
            assessment = assess_corroboration(candidates, nearby)
            # Prefer pharmacy as the lead indicator when it contributed, so the UI can
            # describe a pharmacy-driven case with the clinic signals alongside it.
            primary = next((item for item in anomalies if item["indicator_type"] == "respiratory_medicine_demand"), None)
            primary = primary or max(anomalies, key=lambda item: item["anomaly_score"])
            dedup_key = f"{region_id}|{observation_date}|{primary['indicator_type']}"
            alert_id = _alert_id(region_id, observation_date, primary["indicator_type"])
            current_time = now_iso()
            existing = connection.execute("SELECT * FROM alerts WHERE dedup_key = ?", (dedup_key,)).fetchone()
            investigation_status = existing["investigation_status"] if existing else "new"
            values = (
                alert_id, dedup_key, primary["region_id"], primary["region_name"], current_time,
                primary["observation_date"],
                f"{primary['observation_date']} daily aggregate; baseline excludes current observation",
                primary["indicator_type"], primary["observed_value"], primary["expected_baseline"],
                primary["absolute_difference"], primary["percentage_change"], primary["anomaly_score"],
                primary["detection_threshold"], primary["baseline_observation_count"], assessment["review_priority"],
                json.dumps(assessment["contributing_signals"]), json.dumps(assessment["supporting_evidence"]),
                json.dumps(assessment["uncertainty_notes"]), assessment["data_quality_status"],
                json.dumps(assessment["recommended_verification_steps"]), investigation_status, current_time, current_time,
            )
            if existing:
                connection.execute(
                    """UPDATE alerts SET region_name=?, detected_at=?, observation_window=?, observed_value=?,
                    expected_baseline=?, absolute_difference=?, percentage_change=?, anomaly_score=?,
                    detection_threshold=?, baseline_observation_count=?, review_priority=?, contributing_signals=?,
                    supporting_evidence=?, uncertainty_notes=?, data_quality_status=?, recommended_verification_steps=?,
                    active=1, updated_at=? WHERE dedup_key=?""",
                    (
                        primary["region_name"], current_time,
                        f"{primary['observation_date']} daily aggregate; baseline excludes current observation",
                        primary["observed_value"], primary["expected_baseline"], primary["absolute_difference"],
                        primary["percentage_change"], primary["anomaly_score"], primary["detection_threshold"],
                        primary["baseline_observation_count"], assessment["review_priority"],
                        json.dumps(assessment["contributing_signals"]), json.dumps(assessment["supporting_evidence"]),
                        json.dumps(assessment["uncertainty_notes"]), assessment["data_quality_status"],
                        json.dumps(assessment["recommended_verification_steps"]), current_time, dedup_key,
                    ),
                )
                updated += 1
            else:
                connection.execute(
                    """INSERT INTO alerts(
                    alert_id, dedup_key, region_id, region_name, detected_at, observation_date, observation_window,
                    indicator_type, observed_value, expected_baseline, absolute_difference, percentage_change,
                    anomaly_score, detection_threshold, baseline_observation_count, review_priority,
                    contributing_signals, supporting_evidence, uncertainty_notes, data_quality_status,
                    recommended_verification_steps, investigation_status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    values,
                )
                created += 1
            stored = connection.execute("SELECT * FROM alerts WHERE dedup_key = ?", (dedup_key,)).fetchone()
            resulting_alerts.append(_serialize_alert(stored))

        completed_at = now_iso()
        connection.execute(
            """UPDATE detection_runs SET completed_at=?, status='completed', observations_evaluated=?,
            alerts_created=?, alerts_updated=?, message=? WHERE run_id=?""",
            (completed_at, len(evaluated), created, updated,
             "Synthetic aggregate data evaluated with configurable demonstration thresholds.", run_id),
        )
        connection.commit()
        return {
            "run_id": run_id,
            "status": "completed",
            "started_at": started_at,
            "completed_at": completed_at,
            "observations_evaluated": len(evaluated),
            "alerts_created": created,
            "alerts_updated": updated,
            "alerts": resulting_alerts,
        }
    except Exception as exc:
        connection.execute(
            "UPDATE detection_runs SET completed_at=?, status='failed', message=? WHERE run_id=?",
            (now_iso(), str(exc)[:500], run_id),
        )
        connection.commit()
        raise


def latest_detection_status(connection: sqlite3.Connection) -> dict[str, Any]:
    row = connection.execute("SELECT * FROM detection_runs ORDER BY started_at DESC LIMIT 1").fetchone()
    if not row:
        return {"status": "not_run", "message": "No detection run has been recorded yet."}
    return dict(row)


def list_alerts(
    connection: sqlite3.Connection, region_id: str | None = None, review_priority: str | None = None,
    investigation_status: str | None = None, start_date: str | None = None, end_date: str | None = None,
) -> list[dict[str, Any]]:
    clauses = ["1=1"]
    params: list[Any] = []
    for field, value in (("region_id", region_id), ("review_priority", review_priority), ("investigation_status", investigation_status)):
        if value:
            clauses.append(f"{field} = ?")
            params.append(value)
    if start_date:
        clauses.append("observation_date >= ?")
        params.append(start_date)
    if end_date:
        clauses.append("observation_date <= ?")
        params.append(end_date)
    rows = connection.execute(
        f"SELECT * FROM alerts WHERE {' AND '.join(clauses)} ORDER BY observation_date DESC, anomaly_score DESC", params
    ).fetchall()
    return [_serialize_alert(row) for row in rows]


def get_alert(connection: sqlite3.Connection, alert_id: str) -> dict[str, Any]:
    row = connection.execute("SELECT * FROM alerts WHERE alert_id = ?", (alert_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown alert_id: {alert_id}")
    alert = _serialize_alert(row)
    investigations = connection.execute(
        "SELECT * FROM investigations WHERE alert_id = ? ORDER BY created_at, updated_at", (alert_id,)
    ).fetchall()
    serialized_investigations = [_serialize_investigation(item) for item in investigations]
    alert["investigations"] = serialized_investigations
    latest = connection.execute(
        "SELECT reviewer_id FROM investigations WHERE alert_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1",
        (alert_id,),
    ).fetchone()
    alert["assigned_reviewer_id"] = latest["reviewer_id"] if latest else None
    audit_rows = connection.execute(
        "SELECT * FROM audit_events WHERE alert_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 100",
        (alert_id,),
    ).fetchall()
    alert["audit_events"] = [_serialize_audit_event(item) for item in audit_rows]
    return alert


def alert_summary(connection: sqlite3.Connection) -> dict[str, Any]:
    by_priority = {
        row["review_priority"]: row["count"]
        for row in connection.execute("SELECT review_priority, COUNT(*) AS count FROM alerts WHERE active=1 GROUP BY review_priority")
    }
    by_investigation_status = {
        row["investigation_status"]: row["count"]
        for row in connection.execute("SELECT investigation_status, COUNT(*) AS count FROM alerts WHERE active=1 GROUP BY investigation_status")
    }
    return {
        "active_alert_count": sum(by_priority.values()),
        "by_review_priority": by_priority,
        "by_investigation_status": by_investigation_status,
    }


def _serialize_investigation(row: sqlite3.Row) -> dict[str, Any]:
    value = dict(row)
    value["audit_history"] = json.loads(value["audit_history"])
    return value


def _serialize_audit_event(row: sqlite3.Row) -> dict[str, Any]:
    value = dict(row)
    before_json = value.pop("before_json", None)
    after_json = value.pop("after_json", None)
    value["before"] = json.loads(before_json) if before_json else None
    value["after"] = json.loads(after_json) if after_json else None
    value.pop("id", None)
    return value


def _record_audit_event(
    connection: sqlite3.Connection,
    alert_id: str,
    investigation_id: str | None,
    actor_id: str | None,
    action: str,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    note: str | None = None,
    timestamp: str | None = None,
) -> None:
    """Append a durable, separately-queryable audit event."""
    connection.execute(
        """INSERT INTO audit_events(
            event_id, alert_id, investigation_id, actor_id, action, occurred_at,
            before_json, after_json, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            f"AUD-{uuid.uuid4().hex[:16].upper()}",
            alert_id,
            investigation_id,
            (actor_id or "system").strip() or "system",
            action,
            timestamp or now_iso(),
            json.dumps(before, sort_keys=True) if before is not None else None,
            json.dumps(after, sort_keys=True) if after is not None else None,
            note,
        ),
    )


def list_audit_events(connection: sqlite3.Connection, alert_id: str, limit: int = 100) -> list[dict[str, Any]]:
    exists = connection.execute("SELECT 1 FROM alerts WHERE alert_id = ?", (alert_id,)).fetchone()
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown alert_id: {alert_id}")
    rows = connection.execute(
        "SELECT * FROM audit_events WHERE alert_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?",
        (alert_id, limit),
    ).fetchall()
    return [_serialize_audit_event(row) for row in rows]


def create_investigation(connection: sqlite3.Connection, alert_id: str, payload) -> dict[str, Any]:
    alert = get_alert(connection, alert_id)
    timestamp = now_iso()
    investigation_id = f"INV-{uuid.uuid4().hex[:10].upper()}"
    audit_history = [{
        "timestamp": timestamp,
        "event": "created",
        "status": payload.status,
        "reviewer_id": payload.reviewer_id,
        "actor_id": getattr(payload, "actor_id", None) or payload.reviewer_id or "system",
    }]
    connection.execute(
        """INSERT INTO investigations(investigation_id, alert_id, status, reviewer_id, created_at, updated_at,
        findings, outcome, audit_history) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (investigation_id, alert_id, payload.status, payload.reviewer_id, timestamp, timestamp,
         payload.findings, payload.outcome, json.dumps(audit_history)),
    )
    connection.execute(
        "UPDATE alerts SET investigation_status=?, updated_at=? WHERE alert_id=?",
        (payload.status, timestamp, alert_id),
    )
    _record_audit_event(
        connection, alert_id, investigation_id,
        getattr(payload, "actor_id", None) or payload.reviewer_id,
        "investigation_created",
        {"investigation_status": alert["investigation_status"], "reviewer_id": alert.get("assigned_reviewer_id")},
        {"investigation_id": investigation_id, "investigation_status": payload.status, "reviewer_id": payload.reviewer_id},
        note=payload.findings or payload.outcome,
        timestamp=timestamp,
    )
    connection.commit()
    row = connection.execute("SELECT * FROM investigations WHERE investigation_id=?", (investigation_id,)).fetchone()
    return _serialize_investigation(row)


def update_investigation_status(connection: sqlite3.Connection, alert_id: str, payload) -> dict[str, Any]:
    alert = get_alert(connection, alert_id)
    latest = connection.execute(
        "SELECT * FROM investigations WHERE alert_id=? ORDER BY updated_at DESC, created_at DESC LIMIT 1",
        (alert_id,),
    ).fetchone()
    if not latest:
        return create_investigation(connection, alert_id, payload)

    timestamp = now_iso()
    audit_history = json.loads(latest["audit_history"])
    actor_id = getattr(payload, "actor_id", None) or payload.reviewer_id or latest["reviewer_id"] or "system"
    before = {
        "investigation_status": latest["status"],
        "reviewer_id": latest["reviewer_id"],
        "findings": latest["findings"],
        "outcome": latest["outcome"],
    }
    resulting_reviewer = payload.reviewer_id if payload.reviewer_id is not None else latest["reviewer_id"]
    resulting_findings = payload.findings if payload.findings is not None else latest["findings"]
    resulting_outcome = payload.outcome if payload.outcome is not None else latest["outcome"]
    after = {
        "investigation_status": payload.status,
        "reviewer_id": resulting_reviewer,
        "findings": resulting_findings,
        "outcome": resulting_outcome,
    }
    audit_history.append({
        "timestamp": timestamp,
        "event": "status_updated",
        "actor_id": actor_id,
        "before": before,
        "after": after,
    })
    connection.execute(
        """UPDATE investigations SET status=?, reviewer_id=COALESCE(?, reviewer_id), updated_at=?,
        findings=COALESCE(?, findings), outcome=COALESCE(?, outcome), audit_history=? WHERE investigation_id=?""",
        (payload.status, payload.reviewer_id, timestamp, payload.findings, payload.outcome,
         json.dumps(audit_history), latest["investigation_id"]),
    )
    connection.execute(
        "UPDATE alerts SET investigation_status=?, updated_at=? WHERE alert_id=?",
        (payload.status, timestamp, alert_id),
    )
    _record_audit_event(
        connection, alert_id, latest["investigation_id"], actor_id, "status_updated",
        before, after, note=payload.findings or payload.outcome, timestamp=timestamp,
    )
    connection.commit()
    row = connection.execute(
        "SELECT * FROM investigations WHERE investigation_id=?", (latest["investigation_id"],)
    ).fetchone()
    return _serialize_investigation(row)


def assign_investigation_reviewer(connection: sqlite3.Connection, alert_id: str, payload) -> dict[str, Any]:
    alert = get_alert(connection, alert_id)
    timestamp = now_iso()
    latest = connection.execute(
        "SELECT * FROM investigations WHERE alert_id=? ORDER BY updated_at DESC, created_at DESC LIMIT 1",
        (alert_id,),
    ).fetchone()
    actor_id = getattr(payload, "actor_id", None) or "system"
    if latest:
        previous_status = latest["status"]
        next_status = "assigned" if previous_status == "new" else previous_status
        before = {"investigation_status": previous_status, "reviewer_id": latest["reviewer_id"]}
        after = {"investigation_status": next_status, "reviewer_id": payload.reviewer_id}
        audit_history = json.loads(latest["audit_history"])
        audit_history.append({
            "timestamp": timestamp,
            "event": "reviewer_assigned",
            "actor_id": actor_id,
            "before": before,
            "after": after,
            "note": payload.note,
        })
        connection.execute(
            """UPDATE investigations SET status=?, reviewer_id=?, updated_at=?, audit_history=?
            WHERE investigation_id=?""",
            (next_status, payload.reviewer_id, timestamp, json.dumps(audit_history), latest["investigation_id"]),
        )
        investigation_id = latest["investigation_id"]
    else:
        investigation_id = f"INV-{uuid.uuid4().hex[:10].upper()}"
        next_status = "assigned"
        before = {"investigation_status": alert["investigation_status"], "reviewer_id": None}
        after = {"investigation_status": next_status, "reviewer_id": payload.reviewer_id}
        audit_history = [{
            "timestamp": timestamp, "event": "created", "status": next_status,
            "reviewer_id": payload.reviewer_id, "actor_id": actor_id,
        }, {
            "timestamp": timestamp, "event": "reviewer_assigned", "actor_id": actor_id,
            "before": before, "after": after, "note": payload.note,
        }]
        connection.execute(
            """INSERT INTO investigations(investigation_id, alert_id, status, reviewer_id, created_at, updated_at,
            findings, outcome, audit_history) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (investigation_id, alert_id, next_status, payload.reviewer_id, timestamp, timestamp,
             None, None, json.dumps(audit_history)),
        )
    connection.execute(
        "UPDATE alerts SET investigation_status=?, updated_at=? WHERE alert_id=?",
        (next_status, timestamp, alert_id),
    )
    _record_audit_event(
        connection, alert_id, investigation_id, actor_id, "reviewer_assigned",
        before, after, note=payload.note, timestamp=timestamp,
    )
    connection.commit()
    row = connection.execute("SELECT * FROM investigations WHERE investigation_id=?", (investigation_id,)).fetchone()
    return _serialize_investigation(row)


def add_investigation_note(connection: sqlite3.Connection, alert_id: str, payload) -> dict[str, Any]:
    get_alert(connection, alert_id)
    latest = connection.execute(
        "SELECT investigation_id FROM investigations WHERE alert_id=? ORDER BY updated_at DESC, created_at DESC LIMIT 1",
        (alert_id,),
    ).fetchone()
    timestamp = now_iso()
    _record_audit_event(
        connection, alert_id, latest["investigation_id"] if latest else None,
        payload.actor_id, "note_added", None, {"note": payload.note},
        note=payload.note, timestamp=timestamp,
    )
    connection.commit()
    row = connection.execute(
        "SELECT * FROM audit_events WHERE alert_id=? AND action='note_added' ORDER BY id DESC LIMIT 1",
        (alert_id,),
    ).fetchone()
    return _serialize_audit_event(row)
