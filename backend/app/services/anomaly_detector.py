"""Positive-deviation anomaly scoring for aggregate regional indicators."""

from __future__ import annotations

from app.services.baseline_service import calculate_baseline


def evaluate_observation(observation, history: list, threshold: float) -> dict:
    baseline = calculate_baseline(history, observation["observation_date"])
    observed = int(observation["aggregated_count"])
    expected = baseline["expected_baseline"]
    difference = observed - expected
    score = difference / baseline["robust_scale"]
    percentage_change = round((difference / expected) * 100, 2) if expected > 0 else None
    is_anomaly = (
        baseline["baseline_observation_count"] >= 7
        and score >= threshold
        and difference > 0
        and observation["data_quality_status"] != "missing"
    )
    return {
        "region_id": observation["region_id"],
        "region_name": observation["region_name"],
        "observation_date": observation["observation_date"],
        "indicator_type": observation["indicator_type"],
        "source_type": observation["source_type"],
        "observed_value": observed,
        "expected_baseline": expected,
        "absolute_difference": round(difference, 2),
        "percentage_change": percentage_change,
        "anomaly_score": round(score, 3),
        "detection_threshold": threshold,
        "baseline_observation_count": baseline["baseline_observation_count"],
        "baseline_method": baseline["method"],
        "data_quality_status": observation["data_quality_status"],
        "is_anomaly": is_anomaly,
    }
