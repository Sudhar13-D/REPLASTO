from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime, timedelta
from app.db import get_db_cursor
from app.config import get_setting_value

router = APIRouter(prefix="/api/overview", tags=["overview"])

@router.get("")
def get_overview_dashboard(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    tolerance_pct = get_setting_value("tolerance_pct", 3.0)
    fill_threshold_pct = get_setting_value("fill_threshold_pct", 70.0)
    handling_rate = get_setting_value("handling_cost_per_kg", 1.50)
    transport_rate = get_setting_value("transport_cost_per_km", 18.0)

    # 1. Fetch batches with delivery in period
    query = """
        SELECT 
            b.id, b.bale_id, b.village_id, b.stream, b.kg_node, b.created_at, b.operator_id,
            d.buyer_id, d.vehicle_id, d.kg_buyer, d.slip_ref, d.delivered_at,
            d.transport_cost, d.sale_value,
            s.name as shed_name,
            byr.name as buyer_name
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

    query += " ORDER BY b.created_at ASC"

    with get_db_cursor() as cur:
        cur.execute(query, params)
        batches = [dict(r) for r in cur.fetchall()]

        # Sheds fill metrics
        cur.execute("SELECT id, name, capacity_kg, current_kg FROM sheds")
        sheds = [dict(r) for r in cur.fetchall()]

    total_kg_period = sum(float(b["kg_node"]) for b in batches)
    
    total_delivered_batches = 0
    verified_batches_count = 0
    open_flags = []
    net_realization_sum = 0.0
    delivered_kg_sum = 0.0

    for b in batches:
        kg_node = float(b["kg_node"])
        kg_buyer = b["kg_buyer"]
        delivered_at = b["delivered_at"]

        if kg_buyer is not None:
            total_delivered_batches += 1
            kg_buyer_f = float(kg_buyer)
            diff_kg = abs(kg_node - kg_buyer_f)
            var_pct = (diff_kg / kg_node * 100.0) if kg_node > 0 else 0.0

            sale_val = float(b["sale_value"]) if b["sale_value"] else (kg_buyer_f * 15.0)
            trans_cost = float(b["transport_cost"]) if b["transport_cost"] else 12.0
            hand_cost = kg_node * handling_rate
            net_val = sale_val - hand_cost - trans_cost

            net_realization_sum += net_val
            delivered_kg_sum += kg_buyer_f

            if var_pct <= tolerance_pct:
                verified_batches_count += 1
            else:
                open_flags.append({
                    "batch_id": b["id"],
                    "bale_id": b["bale_id"],
                    "village_id": b["village_id"],
                    "shed_name": b["shed_name"],
                    "stream": b["stream"],
                    "kg_node": kg_node,
                    "kg_buyer": kg_buyer_f,
                    "variance_pct": round(var_pct, 1),
                    "delta_kg": round(kg_buyer_f - kg_node, 1),
                    "slip_ref": b["slip_ref"],
                    "buyer_name": b["buyer_name"],
                    "created_at": b["created_at"],
                    "reason": f"Weighbridge delta of {var_pct:.1f}% exceeds tolerance T={tolerance_pct}%"
                })

    verified_pct = round((verified_batches_count / total_delivered_batches * 100.0), 1) if total_delivered_batches > 0 else 0.0
    avg_net_realization = round(net_realization_sum / delivered_kg_sum, 2) if delivered_kg_sum > 0 else 0.0

    # Sheds near full
    sheds_near_full = 0
    for s in sheds:
        cap = float(s["capacity_kg"])
        curr = float(s["current_kg"])
        pct = (curr / cap * 100.0) if cap > 0 else 0.0
        if pct >= fill_threshold_pct:
            sheds_near_full += 1

    # Weekly chart aggregation (kg per week by stream)
    # Group batches into weekly buckets
    streams_list = ["MLP", "HDPE", "LDPE", "PET", "Mixed"]
    weekly_buckets = {}
    
    for b in batches:
        dt = datetime.fromisoformat(b["created_at"].replace("Z", ""))
        # ISO week label
        year, week_num, _ = dt.isocalendar()
        week_key = f"{year}-W{week_num:02d}"
        
        if week_key not in weekly_buckets:
            weekly_buckets[week_key] = {s: 0.0 for s in streams_list}
            weekly_buckets[week_key]["total"] = 0.0

        stream_name = b["stream"] if b["stream"] in streams_list else "Mixed"
        kg = float(b["kg_node"])
        weekly_buckets[week_key][stream_name] += kg
        weekly_buckets[week_key]["total"] += kg

    sorted_weeks = sorted(weekly_buckets.keys())
    chart_labels = sorted_weeks
    chart_datasets = []

    # Stream colors in non-blue palette (Pine, Emerald, Sage, Olive, Ochre)
    stream_colors = {
        "MLP": "#166534",     # Rich Forest Green
        "HDPE": "#D97706",    # Amber
        "LDPE": "#4D7C0F",    # Olive green
        "PET": "#0F766E",     # Deep Teal-Green
        "Mixed": "#78716C"    # Warm stone/neutral
    }

    for s in streams_list:
        chart_datasets.append({
            "label": s,
            "data": [round(weekly_buckets[w][s], 1) for w in sorted_weeks],
            "backgroundColor": stream_colors.get(s, "#166534"),
            "borderColor": stream_colors.get(s, "#166534"),
            "borderWidth": 1
        })

    return {
        "kpis": {
            "total_kg_period": round(total_kg_period, 1),
            "verified_batches_pct": verified_pct,
            "open_flags_count": len(open_flags),
            "avg_net_realization_inr_per_kg": avg_net_realization,
            "sheds_near_full_count": sheds_near_full,
            "total_sheds_monitored": len(sheds),
            "total_batches_period": len(batches)
        },
        "chart_data": {
            "labels": chart_labels,
            "datasets": chart_datasets
        },
        "flags_list": sorted(open_flags, key=lambda x: x["variance_pct"], reverse=True)[:10]
    }
