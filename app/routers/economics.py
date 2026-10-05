from fastapi import APIRouter, Query
from typing import Optional, List, Dict, Any
from app.db import get_db_cursor
from app.config import get_setting_value

router = APIRouter(prefix="/api/economics", tags=["economics"])

@router.get("")
def get_economics_data(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    handling_rate = get_setting_value("handling_cost_per_kg", 1.50)
    transport_rate = get_setting_value("transport_cost_per_km", 18.0)
    
    price_mlp = get_setting_value("price_mlp", 8.0)
    price_hdpe = get_setting_value("price_hdpe", 24.0)
    price_ldpe = get_setting_value("price_ldpe", 18.0)
    price_pet = get_setting_value("price_pet", 22.0)
    price_mixed = get_setting_value("price_mixed", 6.0)

    price_map = {
        "MLP": price_mlp,
        "HDPE": price_hdpe,
        "LDPE": price_ldpe,
        "PET": price_pet,
        "Mixed": price_mixed
    }

    query = """
        SELECT 
            b.id as batch_id,
            b.bale_id,
            b.village_id,
            b.stream,
            b.kg_node,
            b.created_at,
            b.status,
            d.buyer_id,
            d.vehicle_id,
            d.kg_buyer,
            d.delivered_at,
            d.transport_cost,
            d.sale_value,
            s.name as shed_name,
            byr.name as buyer_name,
            byr.type as buyer_type,
            byr.distance_km as buyer_distance_km
        FROM batches b
        LEFT JOIN deliveries d ON b.id = d.batch_id
        LEFT JOIN sheds s ON b.village_id = s.id
        LEFT JOIN buyers byr ON d.buyer_id = byr.id
        WHERE 1=1
    """
    params = []
    if start_date:
        query += " AND b.created_at >= ?"
        params.append(start_date)
    if end_date:
        query += " AND b.created_at <= ?"
        params.append(end_date + " 23:59:59" if len(end_date) == 10 else end_date)

    query += " ORDER BY b.id DESC"

    with get_db_cursor() as cur:
        cur.execute(query, params)
        raw_batches = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT id, name, capacity_kg, current_kg, lat, lon FROM sheds ORDER BY id")
        sheds = [dict(r) for r in cur.fetchall()]

        cur.execute("SELECT id, name, type, accepted_material, price_per_kg, distance_km FROM buyers ORDER BY id")
        buyers = [dict(r) for r in cur.fetchall()]

    batch_economics = []
    total_gross_sale = 0.0
    total_handling_cost = 0.0
    total_transport_cost = 0.0
    total_net_realization = 0.0
    total_delivered_kg = 0.0

    village_agg = {}
    buyer_agg = {}

    for row in raw_batches:
        kg = float(row["kg_node"])
        stream = row["stream"]
        v_id = row["village_id"]
        b_id = row["buyer_id"]
        delivered_at = row["delivered_at"]

        # Only batches with actual delivery have realized commercial economics
        if delivered_at is not None:
            effective_kg = float(row["kg_buyer"]) if row["kg_buyer"] else kg
            
            # Sale value
            if row["sale_value"] and float(row["sale_value"]) > 0:
                sale_val = float(row["sale_value"])
            else:
                unit_price = price_map.get(stream, 10.0)
                sale_val = round(effective_kg * unit_price, 2)

            # Handling cost
            handling_val = round(kg * handling_rate, 2)

            # Transport cost
            if row["transport_cost"] and float(row["transport_cost"]) > 0:
                transport_val = float(row["transport_cost"])
            else:
                dist = float(row["buyer_distance_km"]) if row.get("buyer_distance_km") else 25.0
                transport_val = round((dist * transport_rate) / 40.0, 2)

            net_val = round(sale_val - handling_val - transport_val, 2)
            net_per_kg = round(net_val / effective_kg, 2) if effective_kg > 0 else 0.0

            total_gross_sale += sale_val
            total_handling_cost += handling_val
            total_transport_cost += transport_val
            total_net_realization += net_val
            total_delivered_kg += effective_kg

            # Village aggregation
            if v_id not in village_agg:
                village_agg[v_id] = {
                    "village_id": v_id,
                    "shed_name": row["shed_name"] or v_id,
                    "delivered_batches": 0,
                    "total_kg": 0.0,
                    "gross_sale": 0.0,
                    "handling_cost": 0.0,
                    "transport_cost": 0.0,
                    "net_realization": 0.0
                }
            va = village_agg[v_id]
            va["delivered_batches"] += 1
            va["total_kg"] += effective_kg
            va["gross_sale"] += sale_val
            va["handling_cost"] += handling_val
            va["transport_cost"] += transport_val
            va["net_realization"] += net_val

            # Buyer aggregation
            if b_id:
                if b_id not in buyer_agg:
                    buyer_agg[b_id] = {
                        "buyer_id": b_id,
                        "buyer_name": row["buyer_name"] or b_id,
                        "buyer_type": row["buyer_type"] or "Buyer",
                        "batches_count": 0,
                        "total_kg": 0.0,
                        "gross_sale": 0.0,
                        "transport_paid": 0.0
                    }
                ba = buyer_agg[b_id]
                ba["batches_count"] += 1
                ba["total_kg"] += effective_kg
                ba["gross_sale"] += sale_val
                ba["transport_paid"] += transport_val

            batch_economics.append({
                "batch_id": row["batch_id"],
                "bale_id": row["bale_id"],
                "village_id": v_id,
                "shed_name": row["shed_name"],
                "stream": stream,
                "kg_node": kg,
                "kg_buyer": row["kg_buyer"],
                "buyer_name": row["buyer_name"],
                "delivered_at": delivered_at,
                "sale_value": sale_val,
                "handling_cost": handling_val,
                "transport_cost": transport_val,
                "net_realization": net_val,
                "net_per_kg": net_per_kg
            })

    # Format summaries
    village_summaries = []
    for va in village_agg.values():
        va["avg_realization_per_kg"] = round(va["net_realization"] / va["total_kg"], 2) if va["total_kg"] > 0 else 0.0
        va["gross_sale"] = round(va["gross_sale"], 2)
        va["handling_cost"] = round(va["handling_cost"], 2)
        va["transport_cost"] = round(va["transport_cost"], 2)
        va["net_realization"] = round(va["net_realization"], 2)
        va["total_kg"] = round(va["total_kg"], 1)
        village_summaries.append(va)

    buyer_summaries = []
    for ba in buyer_agg.values():
        ba["gross_sale"] = round(ba["gross_sale"], 2)
        ba["transport_paid"] = round(ba["transport_paid"], 2)
        ba["total_kg"] = round(ba["total_kg"], 1)
        buyer_summaries.append(ba)

    # Shed Actions & Recommendations: "Sell now / Hold / Pool with neighbour"
    shed_recommendations = []
    for s in sheds:
        cap = float(s["capacity_kg"])
        curr = float(s["current_kg"])
        pct = (curr / cap * 100.0) if cap > 0 else 0.0

        if pct >= 75.0 or curr >= 2000.0:
            action = "Sell now"
            badge_class = "action-sell"
            rule_fired = "RULE_TRUCKLOAD_THRESHOLD: Inventory reached commercial haulage capacity (>75% fill). Transport freight rate amortized at optimum margin."
            detail = f"Current inventory ({curr} kg, {pct:.1f}% capacity) is ready for direct buyer dispatch."
        elif pct < 45.0:
            action = "Hold"
            badge_class = "action-hold"
            rule_fired = "RULE_FREIGHT_DILUTION: Stock is below 45% capacity. Dispatching partial truckload would erode net realization by up to ₹4.50/kg."
            detail = f"Current volume ({curr} kg, {pct:.1f}% capacity) has not reached minimal economic transport volume."
        else:
            action = "Pool with neighbour"
            badge_class = "action-pool"
            rule_fired = "RULE_MULTI_STOP_CONSOLIDATION: Volume is intermediate (45%-75%). Consolidate collection with neighbouring cluster to share vehicle dispatch cost."
            detail = f"Current volume ({curr} kg, {pct:.1f}% capacity) should be batched on a shared collection loop."

        shed_recommendations.append({
            "shed_id": s["id"],
            "shed_name": s["name"],
            "current_kg": curr,
            "capacity_kg": cap,
            "fill_pct": round(pct, 1),
            "action": action,
            "badge_class": badge_class,
            "rule_fired": rule_fired,
            "detail": detail
        })

    avg_realization_all = round(total_net_realization / total_delivered_kg, 2) if total_delivered_kg > 0 else 0.0

    return {
        "assumptions": {
            "handling_cost_per_kg": handling_rate,
            "transport_cost_per_km": transport_rate,
            "stream_prices": price_map
        },
        "kpis": {
            "total_gross_sale": round(total_gross_sale, 2),
            "total_handling_cost": round(total_handling_cost, 2),
            "total_transport_cost": round(total_transport_cost, 2),
            "total_net_realization": round(total_net_realization, 2),
            "total_delivered_kg": round(total_delivered_kg, 1),
            "avg_net_realization_per_kg": avg_realization_all
        },
        "shed_recommendations": shed_recommendations,
        "village_summaries": sorted(village_summaries, key=lambda x: x["net_realization"], reverse=True),
        "buyer_summaries": sorted(buyer_summaries, key=lambda x: x["gross_sale"], reverse=True),
        "batch_economics": batch_economics[:30] # Top recent batches
    }
