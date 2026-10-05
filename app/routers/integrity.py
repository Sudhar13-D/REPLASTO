from fastapi import APIRouter
from app.db import get_db_cursor
from app.hashing import verify_chain, simulate_tamper_in_memory

router = APIRouter(prefix="/api/integrity", tags=["integrity"])

@router.get("/verify")
def verify_hash_chain():
    """
    Cryptographically checks the entire tamper-evident chain across all batches.
    Recomputes SHA-256 hashes and verifies every pointer link H_n = SHA256(data_n || H_{n-1}).
    """
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT id, bale_id, village_id, stream, kg_node, created_at, operator_id, prev_hash, hash
            FROM batches
            ORDER BY id ASC
        """)
        batches = [dict(r) for r in cur.fetchall()]

    result = verify_chain(batches)
    return result

@router.post("/simulate-tamper")
def simulate_tamper():
    """
    Demonstrates tamper-evidence by altering a test copy in memory.
    The real SQLite database is never touched.
    """
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT id, bale_id, village_id, stream, kg_node, created_at, operator_id, prev_hash, hash
            FROM batches
            ORDER BY id ASC
        """)
        batches = [dict(r) for r in cur.fetchall()]

    result = simulate_tamper_in_memory(batches)
    return result

@router.get("/calibrations")
def get_calibrations():
    """Returns the scale and load-cell calibration audit log."""
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT id, node_id, ts, type, reference_kg, measured_kg, operator_id, status
            FROM calibration_log
            ORDER BY id DESC
        """)
        rows = [dict(r) for r in cur.fetchall()]
    return {
        "total": len(rows),
        "calibrations": rows
    }
