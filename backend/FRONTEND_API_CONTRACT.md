# AAROGYA ALERT frontend API contract

Local base URL: `http://localhost:8000`

All keys use `snake_case`; timestamps are ISO 8601 UTC. The API contains fictional, aggregate-only demo data. Review priorities are operational triage labels, never diagnoses or outbreak probabilities.

## Shared rules

- Record-level counts below the configurable suppression threshold (default `5`) become `null` with `is_suppressed: true`.
- Dates in query parameters use `YYYY-MM-DD`.
- Valid indicators: `respiratory_medicine_demand`, `fever_clinic_visits`, `gastrointestinal_clinic_visits`.
- Valid priorities: `normal`, `watch`, `needs_review`, `priority_review`.
- Valid investigation states: `new`, `assigned`, `investigating`, `escalated`, `closed`, `dismissed`.
- Invalid values return HTTP `422`; unknown resource IDs return HTTP `404`.

```json
{
  "error": {
    "code": "request_error",
    "message": "indicator_type must be one of: respiratory_medicine_demand, fever_clinic_visits, gastrointestinal_clinic_visits"
  }
}
```

Framework-level malformed requests use `code: "validation_error"` with a `details` array.

## System health

### `GET /api/health`

No parameters. Call at UI startup.

```bash
curl http://localhost:8000/api/health
```

```json
{
  "status": "ok",
  "api_version": "1.0.0",
  "dataset": {
    "status": "loaded",
    "region_count": 10,
    "observation_count": 2624,
    "latest_observation_date": "2026-10-15",
    "synthetic_only": true
  }
}
```

## Regions and map

### `GET /api/regions`

No parameters. Returns safe region metadata; `neighbor_ids` is a fictional demonstration adjacency list.

```bash
curl http://localhost:8000/api/regions
```

```json
{
  "items": [{
    "region_id": "REG-01",
    "region_name": "Aster Plains",
    "latitude": 20.1,
    "longitude": 77.2,
    "population_band": "50k-100k",
    "neighbor_ids": ["REG-02", "REG-05"]
  }],
  "synthetic_only": true
}
```

### `GET /api/regions/{region_id}`

Path parameter: `region_id`, such as `REG-03`. Returns the same object for one region or `404`.

```bash
curl http://localhost:8000/api/regions/REG-03
```

```json
{
  "region_id": "REG-03",
  "region_name": "Cedar Reach",
  "latitude": 20.2,
  "longitude": 78.42,
  "population_band": "50k-100k",
  "neighbor_ids": ["REG-02", "REG-04", "REG-07"]
}
```

### `GET /api/regions/{region_id}/trends?days=30`

`days` is optional from `1` through `90` and defaults to `30`. `series` is oldest-first for charting.

```bash
curl "http://localhost:8000/api/regions/REG-03/trends?days=7"
```

```json
{
  "region_id": "REG-03",
  "days": 7,
  "series": [{
    "region_id": "REG-03",
    "region_name": "Cedar Reach",
    "observation_date": "2026-10-15",
    "indicator_type": "respiratory_medicine_demand",
    "aggregated_count": 73,
    "source_type": "pharmacy_aggregate",
    "population_band": "50k-100k",
    "data_quality_status": "acceptable",
    "is_suppressed": false
  }]
}
```

### `GET /api/regions/map-data`

No parameters. Returns GeoJSON; point coordinates are `[longitude, latitude]` and are fictional broad centroids.

```bash
curl http://localhost:8000/api/regions/map-data
```

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": {"type": "Point", "coordinates": [77.2, 20.1]},
    "properties": {
      "region_id": "REG-01",
      "region_name": "Aster Plains",
      "population_band": "50k-100k",
      "neighbor_ids": ["REG-02", "REG-05"],
      "active_alert_count": 0
    }
  }],
  "limitations": "Fictional broad regional centroids for demonstration only; they are not facility locations or evidence of an outbreak."
}
```

## Observations

### `GET /api/observations`

Optional filters: `region_id`, `indicator_type`, `start_date`, `end_date`, `page` (default `1`), and `page_size` (default `100`, maximum `500`).

```bash
curl "http://localhost:8000/api/observations?region_id=REG-03&indicator_type=respiratory_medicine_demand&page=1&page_size=25"
```

```json
{
  "items": [{
    "region_id": "REG-03",
    "region_name": "Cedar Reach",
    "observation_date": "2026-10-15",
    "indicator_type": "respiratory_medicine_demand",
    "aggregated_count": 73,
    "source_type": "pharmacy_aggregate",
    "population_band": "50k-100k",
    "data_quality_status": "acceptable",
    "is_suppressed": false
  }],
  "pagination": {"page": 1, "page_size": 25, "total_items": 88, "total_pages": 4}
}
```

### `GET /api/observations/summary`

Accepts optional `region_id`, `indicator_type`, `start_date`, and `end_date`. It is suitable for KPI cards, not individual event display.

```bash
curl "http://localhost:8000/api/observations/summary?region_id=REG-03"
```

```json
{
  "observation_count": 266,
  "aggregate_count": 5300,
  "average_count": 19.92,
  "first_date": "2026-07-18",
  "last_date": "2026-10-15",
  "suppressed_observation_count": 0,
  "note": "Aggregate counts are synthetic demonstration data; small values are suppressed in record-level responses."
}
```

## Detection

### `POST /api/detection/run`

No body. Evaluates the recent configurable window (default seven days), creates new alerts, and updates matching alerts rather than duplicating them.

```bash
curl -X POST http://localhost:8000/api/detection/run
```

```json
{
  "run_id": "RUN-3A1F7C9D2B10",
  "status": "completed",
  "started_at": "2026-10-15T10:00:00+00:00",
  "completed_at": "2026-10-15T10:00:01+00:00",
  "observations_evaluated": 202,
  "alerts_created": 3,
  "alerts_updated": 0,
  "alerts": [{
    "alert_id": "ALT-03-20261015-RESP",
    "region_id": "REG-03",
    "indicator_type": "respiratory_medicine_demand",
    "review_priority": "watch"
  }]
}
```

`run_id` and timestamps vary; the final-day synthetic data itself is deterministic.

### `GET /api/detection/status`

No parameters. Returns the most recently recorded run, or `status: "not_run"` before a detection call.

```bash
curl http://localhost:8000/api/detection/status
```

```json
{
  "run_id": "RUN-3A1F7C9D2B10",
  "status": "completed",
  "observations_evaluated": 202,
  "alerts_created": 3,
  "alerts_updated": 0,
  "message": "Synthetic aggregate data evaluated with configurable demonstration thresholds."
}
```

## Alerts

### `GET /api/alerts`

Optional filters: `region_id`, `review_priority`, `investigation_status`, `start_date`, and `end_date`.

```bash
curl "http://localhost:8000/api/alerts?review_priority=priority_review"
```

```json
{
  "items": [{
    "alert_id": "ALT-07-20261015-RESP",
    "region_id": "REG-07",
    "region_name": "Grove Ward",
    "detected_at": "2026-10-15T10:00:00+00:00",
    "observation_date": "2026-10-15",
    "observation_window": "2026-10-15 daily aggregate; baseline excludes current observation",
    "indicator_type": "respiratory_medicine_demand",
    "observed_value": 76,
    "expected_baseline": 33.0,
    "absolute_difference": 43.0,
    "percentage_change": 130.3,
    "anomaly_score": 7.485,
    "detection_threshold": 3.5,
    "baseline_observation_count": 8,
    "review_priority": "priority_review",
    "contributing_signals": ["pharmacy_demand_anomaly", "clinical_indicator_anomaly", "neighboring_region_anomaly"],
    "supporting_evidence": ["Aggregated pharmacy demand exceeds the configured robust baseline threshold."],
    "uncertainty_notes": ["This is a synthetic-data demonstration signal, not a confirmed illness event or validated epidemiological prediction."],
    "data_quality_status": "acceptable",
    "recommended_verification_steps": ["Verify aggregate source completeness and delayed reporting with the authorized data steward."],
    "investigation_status": "new",
    "active": true,
    "created_at": "2026-10-15T10:00:00+00:00",
    "updated_at": "2026-10-15T10:00:00+00:00"
  }]
}
```

The displayed `REG-07` numeric values are calculated from the deterministic sample. Evidence arrays can contain additional messages in a live response.

### `GET /api/alerts/{alert_id}`

Returns the complete alert plus its investigation records. Unknown IDs return `404`.

```bash
curl http://localhost:8000/api/alerts/ALT-07-20261015-RESP
```

```json
{
  "alert_id": "ALT-07-20261015-RESP",
  "review_priority": "priority_review",
  "investigation_status": "new",
  "investigations": []
}
```

### `GET /api/alerts/summary`

No parameters. Use for dashboard KPI cards.

```bash
curl http://localhost:8000/api/alerts/summary
```

```json
{
  "active_alert_count": 3,
  "by_review_priority": {"watch": 1, "priority_review": 2},
  "by_investigation_status": {"new": 3}
}
```

## Investigation workflow

### `POST /api/alerts/{alert_id}/investigations`

Creates a record. Body fields: optional `status` (default `new`), `reviewer_id`, `findings`, and `outcome`. Use only pseudonymous demo reviewer IDs in this MVP.

```bash
curl -X POST http://localhost:8000/api/alerts/ALT-07-20261015-RESP/investigations -H "Content-Type: application/json" -d '{"status":"assigned","reviewer_id":"demo-reviewer-1","findings":"Checking aggregate feed completeness."}'
```

```json
{
  "investigation": {
    "investigation_id": "INV-0A1B2C3D4E",
    "alert_id": "ALT-07-20261015-RESP",
    "status": "assigned",
    "reviewer_id": "demo-reviewer-1",
    "created_at": "2026-10-15T10:05:00+00:00",
    "updated_at": "2026-10-15T10:05:00+00:00",
    "findings": "Checking aggregate feed completeness.",
    "outcome": null,
    "audit_history": [{"timestamp": "2026-10-15T10:05:00+00:00", "event": "created", "status": "assigned", "reviewer_id": "demo-reviewer-1"}]
  }
}
```

### `PATCH /api/alerts/{alert_id}/status`

Requires `status`; may include `reviewer_id`, `findings`, and `outcome`. Updates the most recent investigation and appends audit history. If none exists, creates one from this payload.

```bash
curl -X PATCH http://localhost:8000/api/alerts/ALT-07-20261015-RESP/status -H "Content-Type: application/json" -d '{"status":"investigating","reviewer_id":"demo-reviewer-1"}'
```

```json
{
  "investigation": {
    "investigation_id": "INV-0A1B2C3D4E",
    "alert_id": "ALT-07-20261015-RESP",
    "status": "investigating",
    "audit_history": [
      {"timestamp": "2026-10-15T10:05:00+00:00", "event": "created", "status": "assigned", "reviewer_id": "demo-reviewer-1"},
      {"timestamp": "2026-10-15T10:07:00+00:00", "event": "status_updated", "status": "investigating", "reviewer_id": "demo-reviewer-1"}
    ]
  }
}
```

## Frontend behavior notes

- Render `supporting_evidence`, `uncertainty_notes`, and `recommended_verification_steps` separately in alert detail.
- Use `review_priority` for triage styling. A pharmacy-only `watch` is deliberately not evidence of an outbreak.
- After PATCH, update the selected card with the returned investigation or refetch its detail.
- Show `data_quality_status` and `is_suppressed`; do not turn absent or withheld data into zero.
- Use GeoJSON coordinate ordering: `[longitude, latitude]`.
