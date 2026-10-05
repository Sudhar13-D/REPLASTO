import pytest
from starlette.testclient import TestClient
from app.main import app
from app.db import init_db
from app.seed import seed_database

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    init_db()
    seed_database(force=True)

@pytest.fixture
def client():
    return TestClient(app)

def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

def test_serve_index(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "Replasto" in res.text
    assert "DEMO DATA: synthetic, not field data" in res.text

def test_api_overview(client):
    res = client.get("/api/overview")
    assert res.status_code == 200
    data = res.json()
    assert "kpis" in data
    assert "total_kg_period" in data["kpis"]
    assert "chart_data" in data
    assert "flags_list" in data

def test_api_batches_list_and_detail(client):
    res = client.get("/api/batches")
    assert res.status_code == 200
    data = res.json()
    assert "batches" in data
    assert len(data["batches"]) > 0

    first_id = data["batches"][0]["id"]
    detail_res = client.get(f"/api/batches/{first_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == first_id
    assert "prev_hash" in detail
    assert "hash" in detail
    assert "version_history" in detail

def test_api_batch_qr(client):
    b_res = client.get("/api/batches")
    target_id = b_res.json()["batches"][0]["id"]
    res = client.get(f"/api/batches/{target_id}/qr")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"

def test_api_create_batch_and_chain_extension(client):
    payload = {
        "village_id": "SHED-01",
        "stream": "MLP",
        "kg_node": 58.4,
        "operator_id": "OP-TEST"
    }
    res = client.post("/api/batches", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "hash" in data
    assert "prev_hash" in data

def test_api_offline_sync(client):
    offline_items = [
        {
            "village_id": "SHED-02",
            "stream": "HDPE",
            "kg_node": 52.0,
            "created_at": "2026-09-15 12:00:00",
            "operator_id": "OP-102"
        },
        {
            "village_id": "SHED-02",
            "stream": "PET",
            "kg_node": 49.5,
            "created_at": "2026-09-15 12:30:00",
            "operator_id": "OP-102"
        }
    ]
    res = client.post("/api/batches/sync-offline", json=offline_items)
    assert res.status_code == 200
    data = res.json()
    assert data["synced_count"] == 2
    assert len(data["records"]) == 2

def test_api_edit_version(client):
    b_res = client.get("/api/batches")
    target_id = b_res.json()["batches"][0]["id"]
    payload = {
        "batch_id": target_id,
        "stream": "MLP",
        "kg_node": 57.0,
        "operator_id": "OP-SUPERVISOR",
        "edit_reason": "Scale re-tare post calibration test"
    }
    res = client.post("/api/batches/edit-version", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["version"] > 1

def test_api_collection_and_routing(client):
    res = client.get("/api/collection")
    assert res.status_code == 200
    data = res.json()
    assert "sheds" in data
    assert "suggested_route" in data
    assert len(data["sheds"]) == 6

    # Test route recalculation
    route_res = client.post("/api/collection/plan-route", json={"vehicle_capacity_kg": 4500.0, "fill_threshold_pct": 70.0})
    assert route_res.status_code == 200
    r_data = route_res.json()
    assert "stops" in r_data

def test_api_reconciliation(client):
    res = client.get("/api/reconciliation")
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert "records" in data

def test_api_anomalies(client):
    res = client.get("/api/anomalies?top_k=10")
    assert res.status_code == 200
    data = res.json()
    assert "top_anomalies" in data
    assert "precision_at_k" in data
    assert len(data["top_anomalies"]) <= 10

def test_api_economics(client):
    res = client.get("/api/economics")
    assert res.status_code == 200
    data = res.json()
    assert "kpis" in data
    assert "village_summaries" in data
    assert "buyer_summaries" in data
    assert "shed_recommendations" in data

def test_api_integrity_verify_and_tamper(client):
    # Verify chain passes on seeded data
    verify_res = client.get("/api/integrity/verify")
    assert verify_res.status_code == 200
    assert verify_res.json()["valid"] is True

    # In-memory tamper simulation detects break
    tamper_res = client.post("/api/integrity/simulate-tamper")
    assert tamper_res.status_code == 200
    t_data = tamper_res.json()
    assert t_data["simulation"] is True
    assert t_data["verification_result"]["valid"] is False

    # Check that real chain is still valid
    verify_again = client.get("/api/integrity/verify")
    assert verify_again.status_code == 200
    assert verify_again.json()["valid"] is True

    # Calibrations
    cal_res = client.get("/api/integrity/calibrations")
    assert cal_res.status_code == 200
    assert len(cal_res.json()["calibrations"]) > 0

def test_api_settings(client):
    # Read settings
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "tolerance_pct" in data

    # Update tolerance to 5.0%
    update_res = client.post("/api/settings", json={"settings": {"tolerance_pct": "5.0"}})
    assert update_res.status_code == 200
    assert update_res.json()["current"]["tolerance_pct"]["value"] == 5.0

    # Reset back to 3.0%
    client.post("/api/settings", json={"settings": {"tolerance_pct": "3.0"}})
