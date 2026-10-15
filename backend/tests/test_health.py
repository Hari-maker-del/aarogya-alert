def test_health_reports_loaded_synthetic_dataset(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["dataset"]["synthetic_only"] is True
    assert body["dataset"]["region_count"] == 10
    assert body["dataset"]["observation_count"] >= 2500
