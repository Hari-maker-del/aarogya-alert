"""Robust historical baseline calculation for aggregate demonstration data."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np

try:
    from scipy.stats import median_abs_deviation
except ImportError:  # pragma: no cover - normal installs include SciPy
    def median_abs_deviation(values, scale: float = 1.0) -> float:
        median = float(np.median(values))
        return float(np.median(np.abs(np.asarray(values) - median))) / scale


def calculate_baseline(history: list, current_date: str) -> dict:
    """Calculate a baseline using only eligible observations before current_date.

    Weekday-specific history is preferred when it has at least four points.
    Sparse weekday history falls back to a 28-day rolling window. History older
    than 56 days is excluded so gaps cannot silently pull in stale observations.
    Fewer than seven usable points are explicitly marked as insufficient.
    """
    current = date.fromisoformat(current_date)
    cutoff_56 = current - timedelta(days=56)
    cutoff_28 = current - timedelta(days=28)

    parsed = []
    for row in history:
        row_date = date.fromisoformat(row["observation_date"])
        quality = row["data_quality_status"] if "data_quality_status" in row.keys() else "acceptable"
        if cutoff_56 <= row_date < current and quality != "missing":
            parsed.append((row_date, float(row["aggregated_count"])))
    parsed.sort(key=lambda item: item[0])

    recent_28 = [(row_date, value) for row_date, value in parsed if row_date >= cutoff_28]
    same_weekday = [value for row_date, value in parsed if row_date.weekday() == current.weekday()][-8:]

    if len(same_weekday) >= 4:
        values = same_weekday
        method = "day_of_week_median_mad"
        sufficiency = "adequate" if len(values) >= 7 else "limited"
    else:
        values = [value for _, value in recent_28]
        method = "rolling_28_day_median_mad"
        sufficiency = "adequate" if len(values) >= 7 else "insufficient"

    # Four to six same-weekday observations are usable but explicitly limited.
    # Rolling baselines still require at least seven usable observations.
    if len(values) < 7 and sufficiency != "limited":
        return {
            "expected_baseline": round(float(np.median(values)), 2) if values else 0.0,
            "robust_scale": 1.0,
            "baseline_observation_count": len(values),
            "method": method if values else "no_history",
            "evidence_sufficiency": "insufficient",
        }

    expected = float(np.median(values))
    mad = float(median_abs_deviation(values, scale=1.0))
    robust_scale = max(1.4826 * mad, np.sqrt(max(expected, 1.0)), 1.0)
    return {
        "expected_baseline": round(expected, 2),
        "robust_scale": round(float(robust_scale), 4),
        "baseline_observation_count": len(values),
        "method": method,
        "evidence_sufficiency": sufficiency,
    }
