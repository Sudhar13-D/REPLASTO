from app.db import get_db, get_db_cursor
from typing import Dict, Any

DEFAULT_SETTINGS = {
    "tolerance_pct": ("3.0", "Reconciliation Weight Variance Tolerance (%)", "reconciliation"),
    "fill_threshold_pct": ("70.0", "Shed Collection Fill Threshold (%)", "collection"),
    "vehicle_capacity_kg": ("3500.0", "Default Vehicle Payload Capacity (kg)", "collection"),
    "handling_cost_per_kg": ("1.50", "Bale Handling Cost (₹/kg)", "economics"),
    "transport_cost_per_km": ("18.0", "Vehicle Transport Rate (₹/km)", "economics"),
    "price_mlp": ("8.0", "Assumption: Multi-Layer Plastic Bale Value (₹/kg)", "pricing"),
    "price_hdpe": ("24.0", "Assumption: Rigid HDPE Bale Value (₹/kg)", "pricing"),
    "price_ldpe": ("18.0", "Assumption: LDPE Film Bale Value (₹/kg)", "pricing"),
    "price_pet": ("22.0", "Assumption: PET Bottles Bale Value (₹/kg)", "pricing"),
    "price_mixed": ("6.0", "Assumption: Mixed Plastics Value (₹/kg)", "pricing"),
}

def init_settings():
    """Initializes settings table with defaults if not present."""
    with get_db_cursor() as cur:
        for key, (val, label, cat) in DEFAULT_SETTINGS.items():
            cur.execute("""
                INSERT OR IGNORE INTO settings (key, value, label, category)
                VALUES (?, ?, ?, ?)
            """, (key, val, label, cat))

def get_settings() -> Dict[str, Any]:
    """Retrieves all settings as typed dictionary with metadata."""
    init_settings()
    with get_db_cursor() as cur:
        cur.execute("SELECT key, value, label, category FROM settings")
        rows = cur.fetchall()
        result = {}
        for row in rows:
            key = row["key"]
            raw_val = row["value"]
            try:
                numeric_val = float(raw_val)
            except ValueError:
                numeric_val = raw_val
            result[key] = {
                "value": numeric_val,
                "raw": raw_val,
                "label": row["label"],
                "category": row["category"]
            }
        return result

def get_setting_value(key: str, default: float = 0.0) -> float:
    """Helper to get a single float setting value."""
    with get_db_cursor() as cur:
        cur.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cur.fetchone()
        if row:
            try:
                return float(row["value"])
            except ValueError:
                return default
        # Check default dictionary
        if key in DEFAULT_SETTINGS:
            return float(DEFAULT_SETTINGS[key][0])
        return default

def update_setting(key: str, value: str):
    """Updates a single setting value."""
    with get_db_cursor() as cur:
        cur.execute("UPDATE settings SET value = ? WHERE key = ?", (str(value), key))
