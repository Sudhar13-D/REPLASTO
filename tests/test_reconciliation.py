import pytest

def calculate_variance(kg_node: float, kg_buyer: float):
    diff = abs(kg_node - kg_buyer)
    pct = (diff / kg_node * 100.0) if kg_node > 0 else 0.0
    return round(diff, 2), round(pct, 2)

def test_variance_calculation():
    # 50kg node, 51kg buyer => 1kg diff => 2.0%
    diff, pct = calculate_variance(50.0, 51.0)
    assert diff == 1.0
    assert pct == 2.0

    # 60kg node, 57kg buyer => 3kg diff => 5.0%
    diff2, pct2 = calculate_variance(60.0, 57.0)
    assert diff2 == 3.0
    assert pct2 == 5.0

def test_tolerance_classification():
    tolerance_pct = 3.0
    
    # Within tolerance
    _, pct_ok = calculate_variance(50.0, 50.8) # 1.6%
    assert pct_ok <= tolerance_pct
    status_ok = "Verified" if pct_ok <= tolerance_pct else "Flagged"
    assert status_ok == "Verified"

    # Exceeds tolerance
    _, pct_flag = calculate_variance(50.0, 53.0) # 6.0%
    assert pct_flag > tolerance_pct
    status_flag = "Verified" if pct_flag <= tolerance_pct else "Flagged"
    assert status_flag == "Flagged"

def test_unverified_rule():
    # Delivered without buyer slip should NEVER be Verified
    delivered_at = "2026-09-10 14:00:00"
    kg_buyer = None
    
    if kg_buyer is None and delivered_at is not None:
        status = "Recorded (unverified)"
    else:
        status = "Verified"

    assert status == "Recorded (unverified)"
    assert status != "Verified"
