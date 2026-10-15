"""Minimal, explainable neighboring-region grouping for the MVP."""

from __future__ import annotations

from app.models import REGIONS


NEIGHBORS = {region.region_id: set(region.neighbor_ids) for region in REGIONS}


def anomalous_neighbors(region_id: str, observation_date: str, anomalous_keys: set[tuple[str, str]]) -> list[str]:
    """Return known adjacent regions with an anomaly on the same date.

    This is simple geographic grouping, not a spatial epidemiology model.
    """
    return sorted(
        neighbor_id for neighbor_id in NEIGHBORS.get(region_id, set())
        if (neighbor_id, observation_date) in anomalous_keys
    )
