from fastapi import APIRouter, HTTPException, Query, Response, Request
from typing import Optional, List
from datetime import datetime
import io
import qrcode

from app.db import get_db_cursor
from app.hashing import compute_hash, GENESIS_HASH
from app.config import get_setting_value
from app.models import BatchCreate, BatchUpdate, OfflineSyncBatch

router = APIRouter(prefix="/api/batches", tags=["batches"])

@router.get("")
def list_batches(
    search: Optional[str] = None,
    stream: Optional[str] = None,
    village_id: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc"
):
    tolerance_pct = get_setting_value("tolerance_pct", 3.0)

    query = """
        SELECT 
            b.id, b.bale_id, b.village_id, b.stream, b.kg_node, b.created_at,
            b.operator_id, b.photo_path, b.prev_hash, b.hash, b.status, b.version,
            b.is_injected, b.parent_id, b.edit_reason,
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

    if search:
        query += " AND (b.bale_id LIKE ? OR b.operator_id LIKE ? OR d.slip_ref LIKE ?)"
        term = f"%{search.strip()}%"
        params.extend([term, term, term])

    if stream and stream != "ALL":
        query += " AND b.stream = ?"
        params.append(stream)

    if village_id and village_id != "ALL":
        query += " AND b.village_id = ?"
        params.append(village_id)

    if start_date:
        query += " AND b.created_at >= ?"
        params.append(start_date)

    if end_date:
        query += " AND b.created_at <= ?"
        params.append(end_date + " 23:59:59" if len(end_date) == 10 else end_date)

    # Dynamic status reconciliation check based on current tolerance T setting!
    # "Delivered batches without a buyer slip show 'Recorded (unverified)', never 'Verified'."
    # "Verified appears only when a buyer weight exists and variance is within tolerance."

    # Sort order validation
    allowed_cols = {
        "id": "b.id",
        "bale_id": "b.bale_id",
        "created_at": "b.created_at",
        "kg_node": "b.kg_node",
        "stream": "b.stream",
        "village_id": "b.village_id",
        "status": "b.status"
    }
    col = allowed_cols.get(sort_by, "b.created_at")
    direction = "DESC" if sort_dir.lower() == "desc" else "ASC"
    query += f" ORDER BY {col} {direction}"

    with get_db_cursor() as cur:
        cur.execute(query, params)
        rows = [dict(r) for r in cur.fetchall()]

    # Apply live dynamic status based on tolerance setting
    for r in rows:
        kg_node = float(r["kg_node"])
        kg_buyer = r["kg_buyer"]
        
        if kg_buyer is not None:
            variance_kg = round(abs(kg_node - float(kg_buyer)), 2)
            variance_pct = round((variance_kg / kg_node * 100.0), 2) if kg_node > 0 else 0.0
            r["variance_kg"] = variance_kg
            r["variance_pct"] = variance_pct
            
            # Dynamic re-evaluation with current tolerance T
            if variance_pct <= tolerance_pct:
                r["status"] = "Verified"
            else:
                r["status"] = "Flagged"
        elif r.get("delivered_at") is not None:
            r["variance_kg"] = None
            r["variance_pct"] = None
            r["status"] = "Recorded (unverified)"
        else:
            r["variance_kg"] = None
            r["variance_pct"] = None
            r["status"] = "Recorded"

    # Status filter in Python after dynamic evaluation
    if status and status != "ALL":
        rows = [r for r in rows if r["status"] == status]

    return {
        "total": len(rows),
        "tolerance_pct_applied": tolerance_pct,
        "batches": rows
    }

def _format_batch_detail(data: dict, version_history: list, tolerance_pct: float) -> dict:
    kg_node = float(data["kg_node"])
    kg_buyer = data["kg_buyer"]
    if kg_buyer is not None:
        variance_kg = round(abs(kg_node - float(kg_buyer)), 2)
        variance_pct = round((variance_kg / kg_node * 100.0), 2) if kg_node > 0 else 0.0
        data["variance_kg"] = variance_kg
        data["variance_pct"] = variance_pct
        data["tolerance_pct"] = tolerance_pct
        data["is_within_tolerance"] = bool(variance_pct <= tolerance_pct)
        data["status"] = "Verified" if data["is_within_tolerance"] else "Flagged"
    elif data.get("delivered_at") is not None:
        data["variance_kg"] = None
        data["variance_pct"] = None
        data["is_within_tolerance"] = None
        data["status"] = "Recorded (unverified)"
    else:
        data["variance_kg"] = None
        data["variance_pct"] = None
        data["is_within_tolerance"] = None
        data["status"] = "Recorded"

    data["version_history"] = version_history
    return data

@router.get("/samples")
def get_sample_bales():
    """Returns sample representative bales for 1-click scanner testing and demonstration."""
    with get_db_cursor() as cur:
        # Fetch a diverse mix: 1 verified, 1 flagged, 1 recorded unverified, 1 recorded genesis
        cur.execute("""
            SELECT b.id, b.bale_id, b.stream, b.kg_node, b.status, b.created_at, b.hash,
                   s.name as shed_name
            FROM batches b
            LEFT JOIN sheds s ON b.village_id = s.id
            GROUP BY b.bale_id
            ORDER BY b.id ASC
            LIMIT 8
        """)
        rows = [dict(r) for r in cur.fetchall()]
        return {"samples": rows}

@router.get("/lookup")
def lookup_batch(query: str = Query(..., description="Bale ID, QR code payload text, URL, or hash")):
    """
    Looks up a bale batch record by scanned QR payload, Bale ID (e.g. BAL-26-1001),
    numeric ID, slip reference, or SHA-256 hash.
    """
    import re
    raw = query.strip()
    
    # 1. Extract bale ID if present in text
    cleaned = raw
    bale_match = re.search(r"Bale:\s*([A-Za-z0-9\-_]+)", raw, re.IGNORECASE)
    if bale_match:
        cleaned = bale_match.group(1).strip()
    else:
        url_bale = re.search(r"[?&]bale=([A-Za-z0-9\-_]+)", raw, re.IGNORECASE)
        if url_bale:
            cleaned = url_bale.group(1).strip()
        else:
            direct_bale = re.search(r"(BAL-\d+-\d+)", raw, re.IGNORECASE)
            if direct_bale:
                cleaned = direct_bale.group(1).strip()

    base_query = """
        SELECT 
            b.id, b.bale_id, b.village_id, b.stream, b.kg_node, b.created_at,
            b.operator_id, b.photo_path, b.prev_hash, b.hash, b.status, b.version,
            b.is_injected, b.parent_id, b.edit_reason,
            d.buyer_id, d.vehicle_id, d.kg_buyer, d.slip_ref, d.delivered_at,
            d.transport_cost, d.sale_value,
            s.name as shed_name,
            byr.name as buyer_name, byr.type as buyer_type
        FROM batches b
        LEFT JOIN deliveries d ON b.id = d.batch_id
        LEFT JOIN sheds s ON b.village_id = s.id
        LEFT JOIN buyers byr ON d.buyer_id = byr.id
    """
    
    with get_db_cursor() as cur:
        row = None
        # 1. Exact bale_id match
        cur.execute(base_query + " WHERE UPPER(b.bale_id) = UPPER(?) ORDER BY b.version DESC, b.id DESC LIMIT 1", (cleaned,))
        row = cur.fetchone()

        # 2. Check if numeric id
        if not row and cleaned.isdigit():
            cur.execute(base_query + " WHERE b.id = ? ORDER BY b.version DESC, b.id DESC LIMIT 1", (int(cleaned),))
            row = cur.fetchone()

        # 3. Check hash or slip ref
        if not row and len(cleaned) >= 6:
            cur.execute(base_query + " WHERE b.hash LIKE ? OR d.slip_ref LIKE ? ORDER BY b.version DESC, b.id DESC LIMIT 1", (f"{cleaned}%", f"%{cleaned}%"))
            row = cur.fetchone()

        # 4. Partial bale_id match
        if not row:
            cur.execute(base_query + " WHERE b.bale_id LIKE ? ORDER BY b.version DESC, b.id DESC LIMIT 1", (f"%{cleaned}%",))
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"No plastic bale matching '{cleaned}' was found.")

        data = dict(row)
        cur.execute("""
            SELECT id, version, kg_node, stream, created_at, operator_id, edit_reason, hash
            FROM batches
            WHERE bale_id = ?
            ORDER BY version ASC
        """, (data["bale_id"],))
        version_history = [dict(v) for v in cur.fetchall()]

    tolerance_pct = get_setting_value("tolerance_pct", 3.0)
    return _format_batch_detail(data, version_history, tolerance_pct)

@router.get("/by-bale/{bale_id}")
def get_batch_by_bale(bale_id: str):
    return lookup_batch(query=bale_id)

@router.get("/{batch_id}")
def get_batch_detail(batch_id: int):
    tolerance_pct = get_setting_value("tolerance_pct", 3.0)
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT 
                b.id, b.bale_id, b.village_id, b.stream, b.kg_node, b.created_at,
                b.operator_id, b.photo_path, b.prev_hash, b.hash, b.status, b.version,
                b.is_injected, b.parent_id, b.edit_reason,
                d.buyer_id, d.vehicle_id, d.kg_buyer, d.slip_ref, d.delivered_at,
                d.transport_cost, d.sale_value,
                s.name as shed_name,
                byr.name as buyer_name, byr.type as buyer_type
            FROM batches b
            LEFT JOIN deliveries d ON b.id = d.batch_id
            LEFT JOIN sheds s ON b.village_id = s.id
            LEFT JOIN buyers byr ON d.buyer_id = byr.id
            WHERE b.id = ?
        """, (batch_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Batch ID {batch_id} not found")
        data = dict(row)

        cur.execute("""
            SELECT id, version, kg_node, stream, created_at, operator_id, edit_reason, hash
            FROM batches
            WHERE bale_id = ?
            ORDER BY version ASC
        """, (data["bale_id"],))
        version_history = [dict(v) for v in cur.fetchall()]

    return _format_batch_detail(data, version_history, tolerance_pct)

@router.get("/{batch_id}/qr")
def get_batch_qr(batch_id: int, request: Request):
    with get_db_cursor() as cur:
        cur.execute("SELECT bale_id, village_id, stream, kg_node, created_at, hash FROM batches WHERE id = ?", (batch_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Batch not found")

    import os
    base_url = os.environ.get("RENDER_EXTERNAL_URL") or os.environ.get("PUBLIC_BASE_URL")
    if not base_url:
        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "127.0.0.1:8000"
        base_url = f"{scheme}://{host}"
    base_url = base_url.rstrip("/")
    bale_url = f"{base_url}/bale/{row['bale_id']}"

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(bale_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#14281D", back_color="#FFFFFF")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")

@router.post("")
def create_batch(b: BatchCreate):
    """Creates a new batch record at the village shed and extends the cryptographic chain."""
    with get_db_cursor() as cur:
        # Get latest chain head
        cur.execute("SELECT hash, id FROM batches ORDER BY id DESC LIMIT 1")
        last_batch = cur.fetchone()
        prev_hash = last_batch["hash"] if last_batch else GENESIS_HASH
        
        # Bale ID generation
        created_at = b.created_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute("SELECT COUNT(*) as total FROM batches")
        total_count = cur.fetchone()["total"]
        bale_id = f"BAL-26-{1001 + total_count}"

        curr_hash = compute_hash(
            bale_id=bale_id,
            village_id=b.village_id,
            stream=b.stream,
            kg_node=b.kg_node,
            created_at=created_at,
            operator_id=b.operator_id,
            prev_hash=prev_hash
        )

        photo_path = b.photo_path or "/static/assets/bales/default.svg"
        status = "Recorded"

        cur.execute("""
            INSERT INTO batches (
                bale_id, village_id, stream, kg_node, created_at, operator_id,
                photo_path, prev_hash, hash, status, version, is_injected, parent_id, edit_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, NULL)
        """, (bale_id, b.village_id, b.stream, b.kg_node, created_at, b.operator_id, photo_path, prev_hash, curr_hash, status))
        batch_id = cur.lastrowid

        # Update shed current_kg
        cur.execute("UPDATE sheds SET current_kg = current_kg + ? WHERE id = ?", (b.kg_node, b.village_id))

        return {
            "status": "success",
            "batch_id": batch_id,
            "bale_id": bale_id,
            "hash": curr_hash,
            "prev_hash": prev_hash,
            "created_at": created_at,
            "message": "Batch recorded with tamper-evident SHA-256 seal."
        }

@router.post("/sync-offline")
def sync_offline_batches(batches: List[OfflineSyncBatch]):
    """Syncs an array of locally queued offline batches, preserving order and extending chain."""
    if not batches:
        return {"status": "success", "synced_count": 0, "message": "No offline batches provided."}

    synced_records = []
    with get_db_cursor() as cur:
        # Get head of chain
        cur.execute("SELECT hash, id FROM batches ORDER BY id DESC LIMIT 1")
        last_batch = cur.fetchone()
        prev_hash = last_batch["hash"] if last_batch else GENESIS_HASH

        cur.execute("SELECT COUNT(*) as total FROM batches")
        total_count = cur.fetchone()["total"]

        for item in batches:
            total_count += 1
            bale_id = item.bale_id or f"BAL-26-{1001 + total_count}"
            curr_hash = compute_hash(
                bale_id=bale_id,
                village_id=item.village_id,
                stream=item.stream,
                kg_node=item.kg_node,
                created_at=item.created_at,
                operator_id=item.operator_id,
                prev_hash=prev_hash
            )
            photo_path = item.photo_path or "/static/assets/bales/default.svg"
            status = "Recorded"

            cur.execute("""
                INSERT INTO batches (
                    bale_id, village_id, stream, kg_node, created_at, operator_id,
                    photo_path, prev_hash, hash, status, version, is_injected, parent_id, edit_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, 'Synced from offline queue')
            """, (bale_id, item.village_id, item.stream, item.kg_node, item.created_at, item.operator_id, photo_path, prev_hash, curr_hash, status))
            
            # Update shed volume
            cur.execute("UPDATE sheds SET current_kg = current_kg + ? WHERE id = ?", (item.kg_node, item.village_id))

            synced_records.append({
                "bale_id": bale_id,
                "prev_hash": prev_hash,
                "hash": curr_hash
            })
            prev_hash = curr_hash

    return {
        "status": "success",
        "synced_count": len(synced_records),
        "chain_head": prev_hash,
        "records": synced_records,
        "message": f"Successfully committed {len(synced_records)} offline batches into the tamper-evident chain."
    }

@router.post("/edit-version")
def edit_batch_version(req: BatchUpdate):
    """Creates a new version row for an existing batch; never overwrites."""
    with get_db_cursor() as cur:
        cur.execute("SELECT * FROM batches WHERE id = ?", (req.batch_id,))
        orig = cur.fetchone()
        if not orig:
            raise HTTPException(status_code=404, detail="Batch not found")

        orig_dict = dict(orig)
        new_kg = req.kg_node if req.kg_node is not None else float(orig_dict["kg_node"])
        new_stream = req.stream if req.stream is not None else orig_dict["stream"]
        new_version = orig_dict["version"] + 1
        now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Get latest chain head
        cur.execute("SELECT hash FROM batches ORDER BY id DESC LIMIT 1")
        last_row = cur.fetchone()
        prev_hash = last_row["hash"] if last_row else GENESIS_HASH

        # Compute hash for new version
        new_hash = compute_hash(
            bale_id=orig_dict["bale_id"],
            village_id=orig_dict["village_id"],
            stream=new_stream,
            kg_node=new_kg,
            created_at=now_ts,
            operator_id=req.operator_id,
            prev_hash=prev_hash
        )

        cur.execute("""
            INSERT INTO batches (
                bale_id, village_id, stream, kg_node, created_at, operator_id,
                photo_path, prev_hash, hash, status, version, is_injected, parent_id, edit_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            orig_dict["bale_id"],
            orig_dict["village_id"],
            new_stream,
            new_kg,
            now_ts,
            req.operator_id,
            orig_dict["photo_path"],
            prev_hash,
            new_hash,
            orig_dict["status"],
            new_version,
            0,
            orig_dict["id"],
            req.edit_reason
        ))
        new_id = cur.lastrowid

        return {
            "status": "success",
            "new_batch_id": new_id,
            "bale_id": orig_dict["bale_id"],
            "version": new_version,
            "hash": new_hash,
            "message": f"Created version {new_version} for bale {orig_dict['bale_id']} with audit trail."
        }
