"""Read-side services with count suppression for API display."""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import date
from typing import Any

from fastapi import HTTPException, status

from app.config import get_settings


def row_to_region(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "region_id": row["region_id"],
        "region_name": row["region_name"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "population_band": row["population_band"],
        "neighbor_ids": json.loads(row["neighbor_ids"]),
    }


def get_region(connection: sqlite3.Connection, region_id: str) -> dict[str, Any]:
    row = connection.execute("SELECT * FROM regions WHERE region_id = ?", (region_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown region_id: {region_id}")
    return row_to_region(row)


def list_regions(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute("SELECT * FROM regions ORDER BY region_id").fetchall()
    return [row_to_region(row) for row in rows]


def serialize_observation(row: sqlite3.Row) -> dict[str, Any]:
    threshold = get_settings().small_count_threshold
    is_suppressed = row["aggregated_count"] < threshold
    return {
        "region_id": row["region_id"],
        "region_name": row["region_name"],
        "observation_date": row["observation_date"],
        "indicator_type": row["indicator_type"],
        "aggregated_count": None if is_suppressed else row["aggregated_count"],
        "source_type": row["source_type"],
        "population_band": row["population_band"],
        "data_quality_status": row["data_quality_status"],
        "is_suppressed": is_suppressed,
    }


def list_observations(
    connection: sqlite3.Connection,
    region_id: str | None = None,
    indicator_type: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = 1,
    page_size: int = 100,
) -> dict[str, Any]:
    clauses: list[str] = []
    params: list[Any] = []
    for field, value in (("o.region_id", region_id), ("o.indicator_type", indicator_type)):
        if value:
            clauses.append(f"{field} = ?")
            params.append(value)
    if start_date:
        clauses.append("o.observation_date >= ?")
        params.append(start_date.isoformat())
    if end_date:
        clauses.append("o.observation_date <= ?")
        params.append(end_date.isoformat())
    where_clause = " WHERE " + " AND ".join(clauses) if clauses else ""
    total = connection.execute(
        f"SELECT COUNT(*) FROM observations o {where_clause}", params
    ).fetchone()[0]
    offset = (page - 1) * page_size
    rows = connection.execute(
        f"""SELECT o.*, r.region_name FROM observations o
        JOIN regions r ON r.region_id = o.region_id {where_clause}
        ORDER BY o.observation_date DESC, o.region_id, o.indicator_type
        LIMIT ? OFFSET ?""",
        [*params, page_size, offset],
    ).fetchall()
    return {
        "items": [serialize_observation(row) for row in rows],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_items": total,
            "total_pages": math.ceil(total / page_size) if total else 0,
        },
    }


def observation_summary(
    connection: sqlite3.Connection, region_id: str | None, indicator_type: str | None,
    start_date: date | None, end_date: date | None,
) -> dict[str, Any]:
    clauses = ["1=1"]
    params: list[Any] = []
    for field, value in (("region_id", region_id), ("indicator_type", indicator_type)):
        if value:
            clauses.append(f"{field} = ?")
            params.append(value)
    if start_date:
        clauses.append("observation_date >= ?")
        params.append(start_date.isoformat())
    if end_date:
        clauses.append("observation_date <= ?")
        params.append(end_date.isoformat())
    where_clause = " AND ".join(clauses)
    row = connection.execute(
        f"""SELECT COUNT(*) AS observation_count, COALESCE(SUM(aggregated_count), 0) AS total_count,
        AVG(aggregated_count) AS average_count, MIN(observation_date) AS first_date,
        MAX(observation_date) AS last_date,
        SUM(CASE WHEN aggregated_count < ? THEN 1 ELSE 0 END) AS suppressed_observation_count
        FROM observations WHERE {where_clause}""",
        [get_settings().small_count_threshold, *params],
    ).fetchone()
    return {
        "observation_count": row["observation_count"],
        "aggregate_count": row["total_count"],
        "average_count": round(row["average_count"], 2) if row["average_count"] is not None else None,
        "first_date": row["first_date"],
        "last_date": row["last_date"],
        "suppressed_observation_count": row["suppressed_observation_count"],
        "note": "Aggregate counts are synthetic demonstration data; small values are suppressed in record-level responses.",
    }


def get_trends(connection: sqlite3.Connection, region_id: str, days: int) -> dict[str, Any]:
    get_region(connection, region_id)
    latest = connection.execute("SELECT MAX(observation_date) FROM observations").fetchone()[0]
    if not latest:
        return {"region_id": region_id, "days": days, "series": []}
    rows = connection.execute(
        """SELECT o.*, r.region_name FROM observations o JOIN regions r ON r.region_id=o.region_id
        WHERE o.region_id = ? AND o.observation_date >= date(?, ?)
        ORDER BY o.observation_date, o.indicator_type""",
        (region_id, latest, f"-{days - 1} days"),
    ).fetchall()
    return {"region_id": region_id, "days": days, "series": [serialize_observation(row) for row in rows]}


def map_data(connection: sqlite3.Connection) -> dict[str, Any]:
    regions = list_regions(connection)
    for region in regions:
        region["active_alert_count"] = connection.execute(
            "SELECT COUNT(*) FROM alerts WHERE region_id = ? AND active = 1", (region["region_id"],)
        ).fetchone()[0]
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [region["longitude"], region["latitude"]]},
                "properties": {key: value for key, value in region.items() if key not in {"longitude", "latitude"}},
            }
            for region in regions
        ],
        "limitations": "Fictional broad regional centroids for demonstration only; they are not facility locations or evidence of an outbreak.",
    }


def get_detection_observations(connection: sqlite3.Connection, lookback_days: int) -> list[sqlite3.Row]:
    latest = connection.execute("SELECT MAX(observation_date) FROM observations").fetchone()[0]
    if not latest:
        return []
    return connection.execute(
        """SELECT o.*, r.region_name FROM observations o JOIN regions r ON r.region_id=o.region_id
        WHERE o.observation_date >= date(?, ?) AND o.data_quality_status != 'missing'
        ORDER BY o.observation_date, o.region_id, o.indicator_type""",
        (latest, f"-{lookback_days - 1} days"),
    ).fetchall()


def get_history(connection: sqlite3.Connection, region_id: str, indicator_type: str, before_date: str) -> list[sqlite3.Row]:
    return connection.execute(
        """SELECT observation_date, aggregated_count, data_quality_status FROM observations
        WHERE region_id = ? AND indicator_type = ? AND observation_date < ?
        AND data_quality_status != 'missing' ORDER BY observation_date""",
        (region_id, indicator_type, before_date),
    ).fetchall()
