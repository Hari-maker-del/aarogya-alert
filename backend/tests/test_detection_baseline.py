from datetime import date, timedelta

from app.services.anomaly_detector import evaluate_observation
from app.services.baseline_service import calculate_baseline


def _history(start: str, days: int, value: int = 10, skip=()):
    first = date.fromisoformat(start)
    skipped = set(skip)
    return [
        {
            "observation_date": (first + timedelta(days=i)).isoformat(),
            "aggregated_count": value,
            "data_quality_status": "acceptable",
        }
        for i in range(days)
        if i not in skipped
    ]


def _observation(day: str, count: int):
    return {
        "region_id": "REG-X",
        "region_name": "Test region",
        "observation_date": day,
        "indicator_type": "fever_clinic_visits",
        "source_type": "clinic_aggregate",
        "aggregated_count": count,
        "data_quality_status": "acceptable",
    }


def test_sparse_weekday_history_uses_limited_evidence_when_four_to_six_points_exist():
    current = date(2026, 10, 15)
    history = _history((current - timedelta(days=35)).isoformat(), 35)
    baseline = calculate_baseline(history, current.isoformat())
    assert baseline["baseline_observation_count"] == 5
    assert baseline["evidence_sufficiency"] == "limited"
    result = evaluate_observation(_observation(current.isoformat(), 30), history, threshold=3.5)
    assert result["is_anomaly"] is True
    assert result["detection_status"] == "signal"


def test_short_history_with_fewer_than_seven_usable_points_is_insufficient():
    current = date(2026, 10, 15)
    history = _history((current - timedelta(days=6)).isoformat(), 6)
    result = evaluate_observation(_observation(current.isoformat(), 30), history, threshold=3.5)
    assert result["is_anomaly"] is False
    assert result["detection_status"] == "insufficient_data"
    assert result["evidence_sufficiency"] == "insufficient"


def test_zero_baseline_does_not_flag_count_below_minimum_threshold():
    current = date(2026, 10, 15)
    history = _history((current - timedelta(days=56)).isoformat(), 56, value=0)
    result = evaluate_observation(_observation(current.isoformat(), 4), history, threshold=3.5)
    assert result["is_anomaly"] is False
    assert result["detection_status"] == "below_minimum_count"
    assert result["percentage_change"] is None


def test_threefold_spike_detected_with_28_days_history():
    current = date(2026, 10, 15)
    history = _history((current - timedelta(days=28)).isoformat(), 28, value=10)
    result = evaluate_observation(_observation(current.isoformat(), 30), history, threshold=3.5)
    assert result["is_anomaly"] is True


def test_threefold_spike_detected_with_35_days_history():
    current = date(2026, 10, 15)
    history = _history((current - timedelta(days=35)).isoformat(), 35, value=10)
    result = evaluate_observation(_observation(current.isoformat(), 30), history, threshold=3.5)
    assert result["is_anomaly"] is True


def test_history_older_than_56_days_is_ignored():
    current = date(2026, 10, 15)
    history = _history((current - timedelta(days=70)).isoformat(), 70, value=10)
    baseline = calculate_baseline(history, current.isoformat())
    assert baseline["baseline_observation_count"] == 8
    assert baseline["expected_baseline"] == 10


def test_missing_quality_history_is_excluded():
    current = date(2026, 10, 15)
    history = _history((current - timedelta(days=28)).isoformat(), 28, value=10)
    for row in history:
        row["data_quality_status"] = "missing"
    baseline = calculate_baseline(history, current.isoformat())
    assert baseline["evidence_sufficiency"] == "insufficient"
