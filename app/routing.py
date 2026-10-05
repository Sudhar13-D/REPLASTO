import math
from typing import List, Dict, Any, Optional
from app.config import get_setting_value

# Central PWMU Hub coordinates
PWMU_HUB = {
    "id": "PWMU-CENTRAL",
    "name": "Central PWMU Hub & Storage",
    "lat": 12.9352,
    "lon": 77.6245
}

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates haversine distance in kilometers between two geo coordinates."""
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)

def plan_pickup_route(
    sheds: List[Dict[str, Any]],
    vehicle_capacity_kg: Optional[float] = None,
    fill_threshold_pct: Optional[float] = None
) -> Dict[str, Any]:
    """
    Plans an optimal pickup sequence starting and ending at the Central PWMU hub.
    Rules:
    - ONLY sheds with fill_percentage >= fill_threshold_pct are candidates.
    - Route obeys vehicle_capacity_kg (collects up to capacity).
    - Sequences stops using greedy nearest-neighbour traveling salesman heuristic.
    - Computes leg distances, cumulative kg, and transport cost based on settings.
    """
    if vehicle_capacity_kg is None:
        vehicle_capacity_kg = get_setting_value("vehicle_capacity_kg", 3500.0)
    if fill_threshold_pct is None:
        fill_threshold_pct = get_setting_value("fill_threshold_pct", 70.0)

    transport_rate_per_km = get_setting_value("transport_cost_per_km", 18.0)

    # Filter candidate sheds strictly above or equal to threshold
    candidates = []
    for s in sheds:
        cap = float(s["capacity_kg"])
        curr = float(s["current_kg"])
        pct = (curr / cap * 100.0) if cap > 0 else 0.0
        if pct >= fill_threshold_pct:
            candidates.append({
                "id": s["id"],
                "name": s["name"],
                "lat": float(s["lat"]),
                "lon": float(s["lon"]),
                "current_kg": curr,
                "capacity_kg": cap,
                "fill_pct": round(pct, 1)
            })

    if not candidates:
        return {
            "solver": "Nearest-Neighbour Greedy Routing",
            "threshold_pct": fill_threshold_pct,
            "vehicle_capacity_kg": vehicle_capacity_kg,
            "transport_rate_per_km": transport_rate_per_km,
            "candidate_count": 0,
            "stops_count": 0,
            "stops": [],
            "total_distance_km": 0.0,
            "total_cost_inr": 0.0,
            "total_kg_collected": 0.0,
            "capacity_utilization_pct": 0.0,
            "message": f"No sheds currently meet the fill threshold of {fill_threshold_pct}%. No pickup needed."
        }

    # Sort candidates by urgency (highest fill % first)
    candidates.sort(key=lambda x: x["fill_pct"], reverse=True)

    # Greedily select stops that fit within vehicle capacity
    selected = []
    current_payload = 0.0
    for cand in candidates:
        if current_payload + cand["current_kg"] <= vehicle_capacity_kg or not selected:
            # If even the first shed exceeds capacity, pick up partial or take it
            kg_to_take = min(cand["current_kg"], vehicle_capacity_kg - current_payload)
            if kg_to_take <= 0 and selected:
                break
            cand_copy = dict(cand)
            cand_copy["pickup_kg"] = round(cand["current_kg"], 1)
            selected.append(cand_copy)
            current_payload += cand["current_kg"]
            if current_payload >= vehicle_capacity_kg:
                break

    # Sequence using Nearest-Neighbour starting from PWMU hub
    unvisited = list(selected)
    route = []
    curr_lat, curr_lon = PWMU_HUB["lat"], PWMU_HUB["lon"]
    total_distance = 0.0
    cum_kg = 0.0

    # Stop 0: Hub departure
    route.append({
        "stop_number": 0,
        "location_id": PWMU_HUB["id"],
        "name": PWMU_HUB["name"] + " (Depot Start)",
        "lat": curr_lat,
        "lon": curr_lon,
        "leg_distance_km": 0.0,
        "cumulative_distance_km": 0.0,
        "pickup_kg": 0.0,
        "cumulative_kg": 0.0,
        "action": "Vehicle dispatch with empty payload"
    })

    stop_num = 1
    while unvisited:
        # Find nearest unvisited stop
        nearest_idx = 0
        min_dist = 999999.0
        for i, stop in enumerate(unvisited):
            dist = haversine_distance(curr_lat, curr_lon, stop["lat"], stop["lon"])
            if dist < min_dist:
                min_dist = dist
                nearest_idx = i

        chosen = unvisited.pop(nearest_idx)
        total_distance += min_dist
        cum_kg += chosen["pickup_kg"]
        
        route.append({
            "stop_number": stop_num,
            "location_id": chosen["id"],
            "name": chosen["name"],
            "lat": chosen["lat"],
            "lon": chosen["lon"],
            "leg_distance_km": round(min_dist, 2),
            "cumulative_distance_km": round(total_distance, 2),
            "pickup_kg": chosen["pickup_kg"],
            "cumulative_kg": round(cum_kg, 1),
            "fill_pct": chosen["fill_pct"],
            "action": f"Collect {chosen['pickup_kg']} kg ({chosen['fill_pct']}% full)"
        })
        curr_lat, curr_lon = chosen["lat"], chosen["lon"]
        stop_num += 1

    # Return leg back to PWMU hub
    return_dist = haversine_distance(curr_lat, curr_lon, PWMU_HUB["lat"], PWMU_HUB["lon"])
    total_distance += return_dist
    route.append({
        "stop_number": stop_num,
        "location_id": PWMU_HUB["id"],
        "name": PWMU_HUB["name"] + " (Depot Return)",
        "lat": PWMU_HUB["lat"],
        "lon": PWMU_HUB["lon"],
        "leg_distance_km": round(return_dist, 2),
        "cumulative_distance_km": round(total_distance, 2),
        "pickup_kg": 0.0,
        "cumulative_kg": round(cum_kg, 1),
        "action": "Unload at PWMU sorting & baling line"
    })

    total_distance = round(total_distance, 1)
    total_cost = round(total_distance * transport_rate_per_km, 2)
    utilization = round((cum_kg / vehicle_capacity_kg * 100.0), 1) if vehicle_capacity_kg > 0 else 0.0

    return {
        "solver": "Nearest-Neighbour + Capacity Routing",
        "threshold_pct": fill_threshold_pct,
        "vehicle_capacity_kg": vehicle_capacity_kg,
        "transport_rate_per_km": transport_rate_per_km,
        "candidate_count": len(candidates),
        "stops_count": len(selected),
        "total_distance_km": total_distance,
        "total_cost_inr": total_cost,
        "total_kg_collected": round(cum_kg, 1),
        "capacity_utilization_pct": utilization,
        "stops": route,
        "message": f"Route sequenced for {len(selected)} shed(s) above {fill_threshold_pct}% fill threshold."
    }
