import pytest
from app.routing import haversine_distance, plan_pickup_route

def test_haversine_distance():
    # Ramanagara to Harohalli (~22-25 km)
    dist = haversine_distance(12.7214, 77.2812, 12.6512, 77.4520)
    assert 20.0 < dist < 26.0

def test_plan_pickup_route_threshold_filtering():
    sheds = [
        {"id": "S1", "name": "Shed 1", "capacity_kg": 2000.0, "current_kg": 1800.0, "lat": 12.72, "lon": 77.28}, # 90%
        {"id": "S2", "name": "Shed 2", "capacity_kg": 2000.0, "current_kg": 1600.0, "lat": 12.84, "lon": 77.34}, # 80%
        {"id": "S3", "name": "Shed 3", "capacity_kg": 2000.0, "current_kg": 800.0,  "lat": 12.79, "lon": 77.38}, # 40% (Below threshold!)
    ]

    # Threshold 70%
    route = plan_pickup_route(sheds, vehicle_capacity_kg=5000.0, fill_threshold_pct=70.0)
    
    assert route["candidate_count"] == 2 # S1 and S2
    assert route["stops_count"] == 2
    # Verify S3 was excluded
    stop_ids = [s["location_id"] for s in route["stops"]]
    assert "S3" not in stop_ids
    assert "S1" in stop_ids
    assert "S2" in stop_ids
    assert route["total_distance_km"] > 0
    assert route["total_cost_inr"] > 0
    assert route["stops"][0]["name"].startswith("Central PWMU") # Starts at Depot
    assert route["stops"][-1]["name"].startswith("Central PWMU") # Ends at Depot

def test_plan_pickup_route_no_eligible_sheds():
    sheds = [
        {"id": "S1", "name": "Shed 1", "capacity_kg": 2000.0, "current_kg": 500.0, "lat": 12.72, "lon": 77.28}, # 25%
    ]
    route = plan_pickup_route(sheds, vehicle_capacity_kg=3500.0, fill_threshold_pct=70.0)
    assert route["candidate_count"] == 0
    assert route["stops_count"] == 0
    assert "No sheds currently meet the fill threshold" in route["message"]
