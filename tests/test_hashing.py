import pytest
from app.hashing import compute_hash, canonical_string, verify_chain, simulate_tamper_in_memory, GENESIS_HASH

def test_canonical_string_determinism():
    s1 = canonical_string("BAL-1001", "SHED-01", "MLP", 55.4, "2026-09-01 10:00:00", "OP-101", GENESIS_HASH)
    s2 = canonical_string("BAL-1001", "SHED-01", "MLP", 55.40, "2026-09-01 10:00:00", "OP-101", GENESIS_HASH)
    assert s1 == s2
    assert "55.40" in s1

def test_hash_chain_verification_pass():
    # Build 3 consecutive blocks
    h0 = GENESIS_HASH
    h1 = compute_hash("B1", "S1", "MLP", 50.0, "2026-09-01 10:00:00", "OP-1", h0)
    h2 = compute_hash("B2", "S1", "HDPE", 60.0, "2026-09-02 10:00:00", "OP-1", h1)
    h3 = compute_hash("B3", "S2", "PET", 45.0, "2026-09-03 10:00:00", "OP-2", h2)

    chain = [
        {"bale_id": "B1", "village_id": "S1", "stream": "MLP", "kg_node": 50.0, "created_at": "2026-09-01 10:00:00", "operator_id": "OP-1", "prev_hash": h0, "hash": h1},
        {"bale_id": "B2", "village_id": "S1", "stream": "HDPE", "kg_node": 60.0, "created_at": "2026-09-02 10:00:00", "operator_id": "OP-1", "prev_hash": h1, "hash": h2},
        {"bale_id": "B3", "village_id": "S2", "stream": "PET", "kg_node": 45.0, "created_at": "2026-09-03 10:00:00", "operator_id": "OP-2", "prev_hash": h2, "hash": h3},
    ]

    res = verify_chain(chain)
    assert res["valid"] is True
    assert res["total_batches"] == 3
    assert res["chain_head"] == h3

def test_hash_chain_tamper_detection():
    h0 = GENESIS_HASH
    h1 = compute_hash("B1", "S1", "MLP", 50.0, "2026-09-01 10:00:00", "OP-1", h0)
    h2 = compute_hash("B2", "S1", "HDPE", 60.0, "2026-09-02 10:00:00", "OP-1", h1)

    # Tampered weight in B2 without updating hash
    tampered_chain = [
        {"bale_id": "B1", "village_id": "S1", "stream": "MLP", "kg_node": 50.0, "created_at": "2026-09-01 10:00:00", "operator_id": "OP-1", "prev_hash": h0, "hash": h1},
        {"bale_id": "B2", "village_id": "S1", "stream": "HDPE", "kg_node": 99.9, "created_at": "2026-09-02 10:00:00", "operator_id": "OP-1", "prev_hash": h1, "hash": h2},
    ]

    res = verify_chain(tampered_chain)
    assert res["valid"] is False
    assert res["broken_index"] == 1
    assert "Payload tamper detected" in res["reason"]

def test_simulate_tamper_in_memory():
    h0 = GENESIS_HASH
    h1 = compute_hash("B1", "S1", "MLP", 50.0, "2026-09-01 10:00:00", "OP-1", h0)
    original_chain = [
        {"bale_id": "B1", "village_id": "S1", "stream": "MLP", "kg_node": 50.0, "created_at": "2026-09-01 10:00:00", "operator_id": "OP-1", "prev_hash": h0, "hash": h1}
    ]
    
    sim = simulate_tamper_in_memory(original_chain, target_index=0)
    assert sim["simulation"] is True
    assert sim["verification_result"]["valid"] is False
    # Ensure original list was NOT mutated
    assert original_chain[0]["kg_node"] == 50.0
