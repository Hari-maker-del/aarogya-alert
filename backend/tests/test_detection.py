from fastapi import HTTPException

from app.main import app
from app.auth import require_active_reviewer
from app.services.anomaly_detector import evaluate_observation


def test_detection_run_requires_active_reviewer(client):
    def reject_unapproved_reviewer():
        raise HTTPException(status_code=403, detail="Reviewer approval required")

    app.dependency_overrides[require_active_reviewer] = reject_unapproved_reviewer
    response = client.post("/api/detection/run")
    assert response.status_code == 403
    assert response.json()["error"]["message"] == "Reviewer approval required"


def test_injected_scenarios_have_distinct_review_priorities(client):
    response = client.post("/api/detection/run")
    assert response.status_code == 200
    assert response.json()["status"] == "completed"

    alerts = client.get("/api/alerts").json()["items"]
    pharmacy_only = next(alert for alert in alerts if alert["region_id"] == "REG-03" and alert["indicator_type"] == "respiratory_medicine_demand")
    corroborated = next(alert for alert in alerts if alert["region_id"] == "REG-07" and alert["indicator_type"] == "respiratory_medicine_demand")
    assert pharmacy_only["review_priority"] == "watch"
    assert "Clinical corroboration is not established" in " ".join(pharmacy_only["uncertainty_notes"])
    assert corroborated["review_priority"] == "priority_review"
    assert "clinical_indicator_anomaly" in corroborated["contributing_signals"]
    assert "neighboring_region_anomaly" in corroborated["contributing_signals"]


def test_repeat_detection_updates_rather_than_duplicates(client):
    client.post("/api/detection/run")
    before = client.get("/api/alerts").json()["items"]
    rerun = client.post("/api/detection/run").json()
    after = client.get("/api/alerts").json()["items"]
    assert rerun["alerts_created"] == 0
    assert rerun["alerts_updated"] >= 1
    assert len(after) == len(before)


def test_zero_history_and_variance_are_handled_without_division_by_zero():
    observation = {
        "region_id": "REG-X", "region_name": "Test", "observation_date": "2026-10-15",
        "indicator_type": "fever_clinic_visits", "source_type": "clinic_aggregate",
        "aggregated_count": 0, "data_quality_status": "acceptable",
    }
    result = evaluate_observation(observation, [], threshold=3.5)
    assert result["baseline_observation_count"] == 0
    assert result["anomaly_score"] == 0
    assert result["is_anomaly"] is False
