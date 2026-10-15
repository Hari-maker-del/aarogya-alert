"""Transparent multi-signal operational review rules."""

from __future__ import annotations


PHARMACY_INDICATOR = "respiratory_medicine_demand"
CLINICAL_INDICATORS = {"fever_clinic_visits", "gastrointestinal_clinic_visits"}


def assess_corroboration(candidates: list[dict], anomalous_neighbors: list[str], expected_indicator_count: int = 3) -> dict:
    anomalies = [item for item in candidates if item["is_anomaly"]]
    pharmacy = [item for item in anomalies if item["indicator_type"] == PHARMACY_INDICATOR]
    clinical = [item for item in anomalies if item["indicator_type"] in CLINICAL_INDICATORS]
    present_indicator_count = len({item["indicator_type"] for item in candidates})
    quality_statuses = {item["data_quality_status"] for item in candidates}
    evidence: list[str] = []
    uncertainty: list[str] = [
        "This is a synthetic-data demonstration signal, not a confirmed illness event or validated epidemiological prediction."
    ]
    signals: list[str] = []

    if pharmacy:
        signals.append("pharmacy_demand_anomaly")
        evidence.append("Aggregated pharmacy demand exceeds the configured robust baseline threshold.")
    if clinical:
        signals.append("clinical_indicator_anomaly")
        evidence.append("At least one aggregated clinic indicator also exceeds its configured baseline threshold.")
    if pharmacy and clinical:
        priority = "needs_review"
        evidence.append("Independent pharmacy and clinical aggregates are elevated on the same regional observation date.")
    elif len(clinical) >= 2:
        priority = "needs_review"
        evidence.append("Two independent aggregated clinic indicators are elevated together.")
    else:
        priority = "watch"
        if pharmacy:
            uncertainty.append("Clinical corroboration is not established; pharmacy demand alone is insufficient evidence of an outbreak.")
        else:
            uncertainty.append("Only one signal type is elevated, so corroboration is limited.")

    if anomalous_neighbors:
        signals.append("neighboring_region_anomaly")
        evidence.append(f"Configured neighboring-region grouping found unusual aggregates in: {', '.join(anomalous_neighbors)}.")
        if priority == "needs_review":
            priority = "priority_review"
    else:
        uncertainty.append("No configured neighboring-region corroboration was found for this observation date.")

    if present_indicator_count < expected_indicator_count:
        uncertainty.append("One or more expected indicator observations are missing for this region/date.")
    if "delayed" in quality_statuses:
        uncertainty.append("At least one observation is marked delayed and should be verified before action.")

    recommendations = [
        "Verify aggregate source completeness and delayed reporting with the authorized data steward.",
        "Review non-identifying regional context and compare subsequent aggregate reporting periods.",
    ]
    if pharmacy and not clinical:
        recommendations.append("Check whether relevant aggregate clinical indicators remain within their expected ranges before escalation.")
    if anomalous_neighbors:
        recommendations.append("Confirm whether the apparent neighboring pattern persists after the next reporting cycle.")
    return {
        "review_priority": priority,
        "contributing_signals": signals,
        "supporting_evidence": evidence,
        "uncertainty_notes": uncertainty,
        "recommended_verification_steps": recommendations,
        "data_quality_status": "missing" if present_indicator_count < expected_indicator_count else ("delayed" if "delayed" in quality_statuses else "acceptable"),
    }
