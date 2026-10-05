from fastapi import APIRouter, Query
from typing import Optional
from app.db import get_db_cursor
from app.config import get_setting_value

router = APIRouter(prefix="/api/reconciliation", tags=["reconciliation"])

@router.get("")
def get_reconciliation_table(
    status: Optional[str] = None,
    buyer_id: Optional[str] = None,
    stream: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    tolerance_pct = get_setting_value("tolerance_pct", 3.0)

    query = """
        SELECT 
            b.id as batch_id,
            b.bale_id,
            b.village_id,
            b.stream,
            b.kg_node,
            b.created_at,
            b.operator_id,
            d.buyer_id,
            d.vehicle_id,
            d.kg_buyer,
            d.slip_ref,
            d.delivered_at,
            s.name as shed_name,
            byr.name as buyer_name
        FROM batches b
        LEFT JOIN deliveries d ON b.id = d.batch_id
        LEFT JOIN sheds s ON b.village_id = s.id
        LEFT JOIN buyers byr ON d.buyer_id = byr.id
        WHERE 1=1
    """
    params = []

    if buyer_id and buyer_id != "ALL":
        query += " AND d.buyer_id = ?"
        params.append(buyer_id)

    if stream and stream != "ALL":
        query += " AND b.stream = ?"
        params.append(stream)

    if start_date:
        query += " AND b.created_at >= ?"
        params.append(start_date)

    if end_date:
        query += " AND b.created_at <= ?"
        params.append(end_date + " 23:59:59" if len(end_date) == 10 else end_date)

    query += " ORDER BY b.id DESC"

    with get_db_cursor() as cur:
        cur.execute(query, params)
        raw_rows = [dict(r) for r in cur.fetchall()]

    reconciled_items = []
    ok_count = 0
    flagged_count = 0
    unverified_count = 0

    for row in raw_rows:
        kg_node = float(row["kg_node"])
        kg_buyer = row["kg_buyer"]
        delivered_at = row["delivered_at"]

        if kg_buyer is not None:
            kg_buyer_f = float(kg_buyer)
            diff_kg = round(kg_buyer_f - kg_node, 2)
            abs_diff = abs(diff_kg)
            var_pct = round((abs_diff / kg_node * 100.0), 2) if kg_node > 0 else 0.0

            # Dynamic check with configurable tolerance T
            if var_pct <= tolerance_pct:
                status_chip = "OK"
                reconciliation_label = "Verified"
                ok_count += 1
            else:
                status_chip = "Flagged"
                reconciliation_label = "Flagged (Exceeds Tolerance)"
                flagged_count += 1

            row["kg_buyer"] = kg_buyer_f
            row["variance_kg"] = abs_diff
            row["delta_signed_kg"] = diff_kg
            row["variance_pct"] = var_pct
            row["status_chip"] = status_chip
            row["reconciliation_status"] = reconciliation_label
        elif delivered_at is not None:
            row["kg_buyer"] = None
            row["variance_kg"] = None
            row["delta_signed_kg"] = None
            row["variance_pct"] = None
            row["status_chip"] = "Unverified"
            row["reconciliation_status"] = "Recorded (unverified)"
            unverified_count += 1
        else:
            row["kg_buyer"] = None
            row["variance_kg"] = None
            row["delta_signed_kg"] = None
            row["variance_pct"] = None
            row["status_chip"] = "Pending"
            row["reconciliation_status"] = "Recorded"

        # Filter by status if requested
        if status and status != "ALL":
            if status == "OK" and row["status_chip"] != "OK":
                continue
            elif status == "Flagged" and row["status_chip"] != "Flagged":
                continue
            elif status in ["Recorded (unverified)", "Unverified"] and row["status_chip"] != "Unverified":
                continue

        reconciled_items.append(row)

    return {
        "tolerance_pct": tolerance_pct,
        "summary": {
            "total_records": len(reconciled_items),
            "ok_count": ok_count,
            "flagged_count": flagged_count,
            "unverified_count": unverified_count
        },
        "records": reconciled_items
    }
