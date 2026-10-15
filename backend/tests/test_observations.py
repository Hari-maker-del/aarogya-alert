from app.database import get_connection
from app.seed_data import generate_synthetic_observations


def test_dataset_generation_is_deterministic_and_aggregate_only():
    first = generate_synthetic_observations()
    second = generate_synthetic_observations()
    assert first == second
    assert {"region_id", "observation_date", "indicator_type", "aggregated_count", "source_type", "population_band", "data_quality_status"} <= set(first[0])
    assert "patient_name" not in first[0]


def test_observation_filters_and_pagination(client):
    response = client.get("/api/observations", params={"region_id": "REG-03", "indicator_type": "respiratory_medicine_demand", "page": 1, "page_size": 5})
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 5
    assert body["pagination"]["total_items"] >= 80
    assert all(item["region_id"] == "REG-03" for item in body["items"])


def test_small_counts_are_suppressed_in_record_responses(client):
    with get_connection() as connection:
        connection.execute(
            """INSERT OR REPLACE INTO observations(region_id, observation_date, indicator_type, aggregated_count,
            source_type, population_band, data_quality_status, is_injected_anomaly)
            VALUES ('REG-01', '2026-10-16', 'fever_clinic_visits', 3, 'clinic_aggregate', '50k-100k', 'acceptable', 0)"""
        )
    response = client.get("/api/observations", params={"region_id": "REG-01", "start_date": "2026-10-16"})
    item = response.json()["items"][0]
    assert item["aggregated_count"] is None
    assert item["is_suppressed"] is True


def test_invalid_parameters_return_consistent_validation_error(client):
    response = client.get("/api/observations", params={"indicator_type": "made_up_indicator"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request_error"
