import hashlib
from typing import List, Dict, Any, Optional

GENESIS_HASH = "0" * 64

def canonical_string(bale_id: str, village_id: str, stream: str, kg_node: float, created_at: str, operator_id: str, prev_hash: str) -> str:
    """Produces the exact canonical string format for tamper-evident hashing."""
    # Format float to 2 decimal places to guarantee determinism across platforms
    formatted_kg = f"{float(kg_node):.2f}"
    return f"{bale_id.strip()}|{village_id.strip()}|{stream.strip()}|{formatted_kg}|{created_at.strip()}|{operator_id.strip()}|{prev_hash.strip()}"

def compute_hash(bale_id: str, village_id: str, stream: str, kg_node: float, created_at: str, operator_id: str, prev_hash: str) -> str:
    """Computes SHA-256 hash for a batch record."""
    c_str = canonical_string(bale_id, village_id, stream, kg_node, created_at, operator_id, prev_hash)
    return hashlib.sha256(c_str.encode('utf-8')).hexdigest()

def verify_chain(batches: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Verifies the cryptographic tamper-evident hash chain across all batches in sequence.
    Returns status, broken_index if invalid, and diagnostic details.
    """
    if not batches:
        return {
            "valid": True,
            "total_batches": 0,
            "broken_index": None,
            "message": "Empty chain is valid by definition.",
            "chain_head": None
        }

    expected_prev = GENESIS_HASH

    for idx, batch in enumerate(batches):
        bale_id = batch["bale_id"]
        stored_prev = batch["prev_hash"]
        stored_hash = batch["hash"]
        
        # Verify previous hash link
        if stored_prev != expected_prev:
            return {
                "valid": False,
                "broken_index": idx,
                "bale_id": bale_id,
                "reason": f"Chain link broken at record #{idx} ({bale_id}). Expected prev_hash {expected_prev[:12]}... but found {stored_prev[:12]}...",
                "stored_hash": stored_hash,
                "expected_prev": expected_prev,
                "stored_prev": stored_prev
            }

        # Verify hash computation for the current record
        recomputed = compute_hash(
            bale_id=batch["bale_id"],
            village_id=batch["village_id"],
            stream=batch["stream"],
            kg_node=batch["kg_node"],
            created_at=batch["created_at"],
            operator_id=batch["operator_id"],
            prev_hash=batch["prev_hash"]
        )

        if recomputed != stored_hash:
            return {
                "valid": False,
                "broken_index": idx,
                "bale_id": bale_id,
                "reason": f"Payload tamper detected at record #{idx} ({bale_id}). Computed SHA-256 {recomputed[:12]}... does not match recorded hash {stored_hash[:12]}...",
                "stored_hash": stored_hash,
                "recomputed_hash": recomputed
            }

        expected_prev = stored_hash

    return {
        "valid": True,
        "total_batches": len(batches),
        "broken_index": None,
        "message": f"Tamper-evident chain fully intact. Verified {len(batches)} consecutive records.",
        "chain_head": batches[-1]["hash"]
    }

def simulate_tamper_in_memory(batches: List[Dict[str, Any]], target_index: Optional[int] = None) -> Dict[str, Any]:
    """
    Simulates a tamper event on an IN-MEMORY copy of the batches list.
    Guarantees no modifications to SQLite database.
    """
    if not batches:
        return {"error": "No batches to simulate tampering on."}

    import copy
    tampered_list = copy.deepcopy(batches)

    if target_index is None or target_index < 0 or target_index >= len(tampered_list):
        # Pick index 12 or midway
        target_index = min(12, len(tampered_list) - 1)

    victim = tampered_list[target_index]
    original_kg = victim["kg_node"]
    # Tamper payload: increase weight by 15.5 kg
    tampered_kg = round(original_kg + 15.5, 2)
    victim["kg_node"] = tampered_kg

    verification_result = verify_chain(tampered_list)

    return {
        "simulation": True,
        "tampered_index": target_index,
        "bale_id": victim["bale_id"],
        "original_payload": {"kg_node": original_kg, "hash": victim["hash"]},
        "tampered_payload": {"kg_node": tampered_kg, "hash": victim["hash"]},
        "verification_result": verification_result,
        "note": "This simulation ran entirely on an isolated in-memory copy. Real database records remain 100% unaltered."
    }
