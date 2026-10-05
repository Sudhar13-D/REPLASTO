from fastapi import APIRouter
from app.db import get_db_cursor
from app.ml import forecast_shed_fill
from app.routing import plan_pickup_route
from app.config import get_setting_value
from app.models import RoutePlanRequest

router = APIRouter(prefix="/api/collection", tags=["collection"])

@router.get("")
def get_collection_overview():
    fill_threshold_pct = get_setting_value("fill_threshold_pct", 70.0)
    vehicle_capacity_kg = get_setting_value("vehicle_capacity_kg", 3500.0)

    with get_db_cursor() as cur:
        cur.execute("SELECT id, name, capacity_kg, current_kg, lat, lon FROM sheds ORDER BY id")
        sheds_raw = [dict(r) for r in cur.fetchall()]

        sheds = []
        for s in sheds_raw:
            shed_id = s["id"]
            cap = float(s["capacity_kg"])
            curr = float(s["current_kg"])
            fill_pct = min(100.0, round((curr / cap * 100.0), 1)) if cap > 0 else 0.0

            # Get fill history
            cur.execute("""
                SELECT ts, kg FROM fill_history 
                WHERE shed_id = ? 
                ORDER BY ts ASC 
                LIMIT 30
            """, (shed_id,))
            history = [dict(h) for h in cur.fetchall()]

            # ML Holt-Winters forecast
            forecast = forecast_shed_fill(shed_id, cap, curr, history)

            sheds.append({
                "id": shed_id,
                "name": s["name"],
                "capacity_kg": cap,
                "current_kg": curr,
                "fill_pct": fill_pct,
                "lat": float(s["lat"]),
                "lon": float(s["lon"]),
                "is_above_threshold": bool(fill_pct >= fill_threshold_pct),
                "forecast": forecast,
                "history": history
            })

    # Plan suggested pickup route for sheds above fill threshold
    route_plan = plan_pickup_route(sheds, vehicle_capacity_kg, fill_threshold_pct)

    return {
        "fill_threshold_pct": fill_threshold_pct,
        "vehicle_capacity_kg": vehicle_capacity_kg,
        "sheds": sheds,
        "suggested_route": route_plan
    }

@router.post("/plan-route")
def recalculate_route(req: RoutePlanRequest):
    fill_threshold_pct = req.fill_threshold_pct if req.fill_threshold_pct is not None else get_setting_value("fill_threshold_pct", 70.0)
    vehicle_capacity_kg = req.vehicle_capacity_kg if req.vehicle_capacity_kg is not None else get_setting_value("vehicle_capacity_kg", 3500.0)

    with get_db_cursor() as cur:
        cur.execute("SELECT id, name, capacity_kg, current_kg, lat, lon FROM sheds")
        sheds = [dict(r) for r in cur.fetchall()]

    route_plan = plan_pickup_route(sheds, vehicle_capacity_kg, fill_threshold_pct)
    return route_plan
