from fastapi import APIRouter
from app.db import get_db_cursor

router = APIRouter(prefix="/api/reference", tags=["reference"])

@router.get("")
def get_reference_data():
    with get_db_cursor() as cur:
        cur.execute("SELECT id, name, capacity_kg, current_kg, lat, lon FROM sheds ORDER BY id")
        sheds = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT id, name, type, accepted_material, price_per_kg, distance_km FROM buyers ORDER BY id")
        buyers = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT DISTINCT operator_id FROM batches ORDER BY operator_id")
        operators = [r["operator_id"] for r in cur.fetchall()]

        cur.execute("SELECT DISTINCT vehicle_id FROM deliveries WHERE vehicle_id IS NOT NULL ORDER BY vehicle_id")
        vehicles = [r["vehicle_id"] for r in cur.fetchall()]

        return {
            "sheds": sheds,
            "buyers": buyers,
            "operators": operators if operators else ["OP-101 (Ramesh)", "OP-102 (Sunita)"],
            "vehicles": vehicles if vehicles else ["VEH-KA05-8821", "VEH-KA42-3104", "VEH-KA01-9942"],
            "streams": ["MLP", "HDPE", "LDPE", "PET", "Mixed"]
        }
