from fastapi import APIRouter, Query
from app.db import get_db_cursor
from app.ml import run_isolation_forest

router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])

@router.get("")
def get_anomalies(top_k: int = Query(10, ge=3, le=50)):
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT 
                b.id, b.bale_id, b.village_id, b.stream, b.kg_node, b.created_at,
                b.operator_id, b.status, b.is_injected,
                d.kg_buyer, d.slip_ref, d.delivered_at
            FROM batches b
            LEFT JOIN deliveries d ON b.id = d.batch_id
            ORDER BY b.id ASC
        """)
        batches = [dict(r) for r in cur.fetchall()]

    result = run_isolation_forest(batches, top_k=top_k)
    return result
