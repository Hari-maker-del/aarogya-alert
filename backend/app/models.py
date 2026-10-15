"""Domain constants and fictional regional reference data."""

from __future__ import annotations

from dataclasses import asdict, dataclass


INDICATORS = (
    "respiratory_medicine_demand",
    "fever_clinic_visits",
    "gastrointestinal_clinic_visits",
)
INVESTIGATION_STATUSES = (
    "new",
    "assigned",
    "investigating",
    "escalated",
    "closed",
    "dismissed",
)
REVIEW_PRIORITIES = ("normal", "watch", "needs_review", "priority_review")
DATA_QUALITY_STATUSES = ("acceptable", "delayed", "missing")


@dataclass(frozen=True)
class RegionSeed:
    region_id: str
    region_name: str
    latitude: float
    longitude: float
    population_band: str
    neighbor_ids: tuple[str, ...]

    def as_dict(self) -> dict:
        data = asdict(self)
        data["neighbor_ids"] = list(self.neighbor_ids)
        return data


# These are fictional demonstration regions. Coordinates represent broad regional
# centroids only and never health facilities, homes, or individuals.
REGIONS = (
    RegionSeed("REG-01", "Aster Plains", 20.10, 77.20, "50k-100k", ("REG-02", "REG-05")),
    RegionSeed("REG-02", "Birch Valley", 20.48, 77.78, "100k-250k", ("REG-01", "REG-03", "REG-06")),
    RegionSeed("REG-03", "Cedar Reach", 20.20, 78.42, "50k-100k", ("REG-02", "REG-04", "REG-07")),
    RegionSeed("REG-04", "Dawn Fields", 19.72, 78.86, "25k-50k", ("REG-03", "REG-08")),
    RegionSeed("REG-05", "Elm Crossing", 19.54, 76.98, "100k-250k", ("REG-01", "REG-06", "REG-09")),
    RegionSeed("REG-06", "Fern District", 19.92, 77.62, "250k-500k", ("REG-02", "REG-05", "REG-07", "REG-10")),
    RegionSeed("REG-07", "Grove Ward", 20.06, 78.18, "100k-250k", ("REG-03", "REG-06", "REG-08")),
    RegionSeed("REG-08", "Harbor Ridge", 19.58, 78.48, "50k-100k", ("REG-04", "REG-07", "REG-10")),
    RegionSeed("REG-09", "Indigo Basin", 19.10, 77.22, "25k-50k", ("REG-05", "REG-10")),
    RegionSeed("REG-10", "Juniper South", 19.28, 77.94, "100k-250k", ("REG-06", "REG-08", "REG-09")),
)
