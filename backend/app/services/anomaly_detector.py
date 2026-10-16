"""Positive-deviation anomaly scoring for aggregate regional indicators."""

from __future__ import annotations

from app.config import get_settings
from app.services.baseline_service import calculate_baseline


def evaluate_observation(observation, history: list, threshold: float) -> dict:
    baseline = calculate_baseline(history, observation["observation_date"])
    observed = int(observation["aggregated_count"])
    expected = baseline["expected_baseline"]
    difference = observed - expected
    score = difference / baseline["robust_scale"]
    minimum_count = get_settings().small_count_threshold
    enough_evidence = baseline["evidence_sufficiency"] != "insufficient"
    eligible_count = observed >= minimum_count
    valid_quality = observation["data_quality_status"] != "missing"

    if not valid_quality:
        detection_status = "excluded"
        detection_reason = "Observation is marked as missing and cannot be evaluated."
    elif not enough_evidence:
        detection_status = "insufficient_data"
        detection_reason = "Fewer than seven usable historical observations are available for the selected baseline."
    elif not eligible_count:
        detection_status = "below_minimum_count"
        detection_reason = f"Observed count is below the minimum reporting threshold of {minimum_count}."
    elif difference <= 0:
        detection_status = "within_baseline"
        detection_reason = "Observed count does not exceed the historical baseline."
    elif score < threshold:
        detection_status = "below_threshold"
        detection_reason = "Increase does not meet the configured anomaly-score threshold."
    else:
        detection_status = "signal"
        detection_reason = "Observed count exceeds the baseline and configured anomaly-score threshold; reviewer verification is required."

    is_anomaly = detection_status == "signal"
    return {
        "region_id": observation["region_id"],
        "region_name": observation["region_name"],
        "observation_date": observation["observation_date"],
        "indicator_type": observation["indicator_type"],
        "source_type": observation["source_type"],
        "observed_value": observed,
        "expected_baseline": expected,
        "absolute_difference": round(difference, 2),
        "percentage_change": round((difference / expected) * 100, 2) if expected >= 1 else None,
        "anomaly_score": round(score, 3),
        "detection_threshold": threshold,
        "baseline_observation_count": baseline["baseline_observation_count"],
        "baseline_method": baseline["method"],
        "evidence_sufficiency": baseline["evidence_sufficiency"],
        "detection_status": detection_status,
        "detection_reason": detection_reason,
        "data_quality_status": observation["data_quality_status"],
        "is_anomaly": is_anomaly,
    }
