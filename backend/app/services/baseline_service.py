"""Robust historical baseline calculation for synthetic demonstration data."""

from __future__ import annotations

from datetime import date

import numpy as np
try:
    from scipy.stats import median_abs_deviation
except ImportError:  # pragma: no cover - requirements install SciPy in normal use
    def median_abs_deviation(values, scale: float = 1.0) -> float:
        """Small fallback for constrained environments before dependencies install."""
        median = float(np.median(values))
        return float(np.median(np.abs(np.asarray(values) - median))) / scale


def calculate_baseline(history: list, current_date: str) -> dict:
    """Return a DOW-aware median/MAD baseline without using the current observation."""
    current = date.fromisoformat(current_date)
    parsed = [(date.fromisoformat(row["observation_date"]), float(row["aggregated_count"])) for row in history]
    same_weekday = [value for row_date, value in parsed if row_date.weekday() == current.weekday()][-8:]
    values = same_weekday if len(same_weekday) >= 4 else [value for _, value in parsed[-28:]]
    if not values:
        return {"expected_baseline": 0.0, "robust_scale": 1.0, "baseline_observation_count": 0, "method": "no_history"}
    expected = float(np.median(values))
    mad = float(median_abs_deviation(values, scale=1.0))
    # The Poisson-inspired floor keeps a near-zero MAD from turning ordinary
    # one-count changes into unstable extreme scores.
    robust_scale = max(1.4826 * mad, np.sqrt(max(expected, 1.0)), 1.0)
    return {
        "expected_baseline": round(expected, 2),
        "robust_scale": round(float(robust_scale), 4),
        "baseline_observation_count": len(values),
        "method": "day_of_week_median_mad" if values is same_weekday else "rolling_median_mad",
    }
