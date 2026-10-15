"""Generate deterministic aggregate-only demo data and load it into SQLite.

Run with ``python -m app.seed_data``.  Re-running is safe: the database uses
the observation natural key (region, date, indicator) and updates rows instead
of inserting duplicates.
"""

from __future__ import annotations

import csv
import math
from random import Random
from datetime import date, timedelta

from app.config import get_settings
from app.database import get_connection, init_db
from app.models import INDICATORS, REGIONS


DEMO_END_DATE = date(2026, 10, 15)
DEMO_DAYS = 90


def generate_synthetic_observations() -> list[dict]:
    """Create reproducible regional aggregates, never individual health records."""
    rng = Random(20261015)
    start_date = DEMO_END_DATE - timedelta(days=DEMO_DAYS - 1)
    base_by_indicator = {
        "respiratory_medicine_demand": 27,
        "fever_clinic_visits": 18,
        "gastrointestinal_clinic_visits": 14,
    }
    population_multiplier = {"25k-50k": 0.80, "50k-100k": 1.0, "100k-250k": 1.28, "250k-500k": 1.65}
    rows: list[dict] = []

    for region_index, region in enumerate(REGIONS):
        for day_index in range(DEMO_DAYS):
            observation_date = start_date + timedelta(days=day_index)
            for indicator_index, indicator in enumerate(INDICATORS):
                # Seasonal and weekday structure makes a rolling/dow baseline meaningful.
                base = base_by_indicator[indicator] * population_multiplier[region.population_band]
                seasonal = 3.2 * math.sin((2 * math.pi * day_index / 42) + region_index * 0.38 + indicator_index)
                weekday_effect = 2.0 if observation_date.weekday() in (0, 1) else -0.8
                random_variation = rng.gauss(0, max(1.4, base * 0.085))
                count = max(0, int(round(base + seasonal + weekday_effect + random_variation)))
                quality_draw = rng.random()
                injected_target = observation_date == DEMO_END_DATE and (
                    (region.region_id == "REG-03" and indicator == "respiratory_medicine_demand")
                    or (region.region_id in {"REG-07", "REG-08"} and indicator in {"respiratory_medicine_demand", "fever_clinic_visits"})
                )

                # Missing data is represented by an absent observation; delayed data is kept
                # explicitly so the UI and detector can expose the limitation.
                if quality_draw < 0.025 and not injected_target:
                    continue
                quality = "delayed" if quality_draw < 0.055 else "acceptable"
                is_injected_anomaly = 0

                # Deliberate, documented demo scenarios on the final date:
                # REG-03 = pharmacy-only spike; REG-07/08 = corroborated neighboring spike.
                if observation_date == DEMO_END_DATE:
                    if region.region_id == "REG-03" and indicator == "respiratory_medicine_demand":
                        count += 44
                        is_injected_anomaly = 1
                        quality = "acceptable"
                    if region.region_id in {"REG-07", "REG-08"}:
                        additions = {
                            "respiratory_medicine_demand": 42 if region.region_id == "REG-07" else 36,
                            "fever_clinic_visits": 31 if region.region_id == "REG-07" else 27,
                        }
                        if indicator in additions:
                            count += additions[indicator]
                            is_injected_anomaly = 1
                            quality = "acceptable"

                rows.append(
                    {
                        "region_id": region.region_id,
                        "region_name": region.region_name,
                        "observation_date": observation_date.isoformat(),
                        "indicator_type": indicator,
                        "aggregated_count": count,
                        "source_type": "pharmacy_aggregate" if indicator == "respiratory_medicine_demand" else "clinic_aggregate",
                        "population_band": region.population_band,
                        "data_quality_status": quality,
                        "is_injected_anomaly": is_injected_anomaly,
                    }
                )
    return rows


def write_csv(rows: list[dict]) -> None:
    settings = get_settings()
    settings.csv_path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "region_id", "region_name", "observation_date", "indicator_type", "aggregated_count",
        "source_type", "population_band", "data_quality_status", "is_injected_anomaly",
    ]
    with settings.csv_path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def seed_database(force: bool = False) -> dict:
    """Upsert reference data and deterministic observations; return load metadata."""
    init_db()
    rows = generate_synthetic_observations()
    write_csv(rows)
    with get_connection() as connection:
        for region in REGIONS:
            connection.execute(
                """INSERT INTO regions(region_id, region_name, latitude, longitude, population_band, neighbor_ids)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(region_id) DO UPDATE SET
                    region_name=excluded.region_name, latitude=excluded.latitude,
                    longitude=excluded.longitude, population_band=excluded.population_band,
                    neighbor_ids=excluded.neighbor_ids""",
                (region.region_id, region.region_name, region.latitude, region.longitude, region.population_band,
                 __import__("json").dumps(list(region.neighbor_ids))),
            )
        connection.executemany(
            """INSERT INTO observations(
                region_id, observation_date, indicator_type, aggregated_count, source_type,
                population_band, data_quality_status, is_injected_anomaly
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(region_id, observation_date, indicator_type) DO UPDATE SET
                aggregated_count=excluded.aggregated_count, source_type=excluded.source_type,
                population_band=excluded.population_band, data_quality_status=excluded.data_quality_status,
                is_injected_anomaly=excluded.is_injected_anomaly""",
            [
                (row["region_id"], row["observation_date"], row["indicator_type"], row["aggregated_count"],
                 row["source_type"], row["population_band"], row["data_quality_status"], row["is_injected_anomaly"])
                for row in rows
            ],
        )
    return {"regions": len(REGIONS), "observations": len(rows), "csv_path": str(get_settings().csv_path), "force": force}


def seed_if_empty() -> dict | None:
    init_db()
    with get_connection() as connection:
        count = connection.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
    return seed_database() if count == 0 else None


if __name__ == "__main__":
    result = seed_database()
    print(f"Seeded {result['observations']} aggregate observations across {result['regions']} fictional regions.")
