import pytest
from app.ml import run_isolation_forest, forecast_shed_fill

def test_isolation_forest_execution():
    batches = []
    for i in range(40):
        batches.append({
            "id": i + 1,
            "bale_id": f"B-{i+1}",
            "village_id": "SHED-01",
            "stream": "MLP",
            "kg_node": 55.0 + (i % 5),
            "kg_buyer": 55.0 + (i % 5) + 0.2,
            "created_at": f"2026-09-01 {10 + (i % 8):02d}:00:00",
            "operator_id": "OP-1",
            "status": "Verified",
            "is_injected": 1 if i == 5 else 0
        })
    # Add obvious outlier
    batches.append({
        "id": 99,
        "bale_id": "B-OUTLIER",
        "village_id": "SHED-02",
        "stream": "MLP",
        "kg_node": 175.0,
        "kg_buyer": 210.0,
        "created_at": "2026-09-01 02:30:00",
        "operator_id": "OP-1",
        "status": "Flagged",
        "is_injected": 1
    })

    res = run_isolation_forest(batches, top_k=5)
    assert res["model_name"] == "IsolationForest (Scikit-Learn)"
    assert len(res["top_anomalies"]) == 5
    assert "precision_at_k" in res
    assert "features_evaluated" in res["top_anomalies"][0]
    # Outlier should have high score
    top_bale = res["top_anomalies"][0]
    assert top_bale["bale_id"] == "B-OUTLIER"
    assert top_bale["anomaly_score"] > 50

def test_holt_winters_forecast():
    history = [
        {"ts": f"2026-09-{i:02d} 08:00:00", "kg": 500.0 + (i * 45.0)}
        for i in range(1, 25)
    ]
    res = forecast_shed_fill(
        shed_id="SHED-01",
        capacity_kg=2500.0,
        current_kg=1500.0,
        history=history
    )
    assert res["days_to_full"] > 0
    assert res["burn_rate_kg_per_day"] > 0
    assert "Full in ~" in res["forecast_status"]
