import random
from datetime import datetime, timedelta
from app.db import get_db_cursor
from app.hashing import compute_hash, GENESIS_HASH
from app.config import init_settings

def seed_database(force: bool = False):
    """
    Idempotent database seeder.
    Populates sheds, buyers, calibration logs, ~120 batches with cryptographic hash chain,
    deliveries, fill histories, and exactly 6 labelled injected anomalies.
    """
    init_settings()

    with get_db_cursor() as cur:
        # Check if already seeded
        cur.execute("SELECT COUNT(*) as count FROM batches")
        row = cur.fetchone()
        if row and row["count"] >= 100 and not force:
            return {
                "status": "already_seeded",
                "batch_count": row["count"],
                "message": "Database already populated with seed data."
            }

        if force:
            cur.execute("DELETE FROM deliveries")
            cur.execute("DELETE FROM batches")
            cur.execute("DELETE FROM fill_history")
            cur.execute("DELETE FROM sheds")
            cur.execute("DELETE FROM buyers")
            cur.execute("DELETE FROM calibration_log")
            cur.execute("DELETE FROM sqlite_sequence WHERE name IN ('batches', 'deliveries', 'fill_history', 'calibration_log')")

        # 1. Seed Buyers
        buyers = [
            ("BUY-01", "Shree Cement Kiln Unit-4", "Kiln (Co-processing)", "MLP, Mixed Plastic", 8.50, 42.0),
            ("BUY-02", "NHAI Road Works Subcontractor", "Road Contractor", "LDPE, Shredded Poly", 16.00, 28.0),
            ("BUY-03", "Deccan Polymer Aggregators", "Aggregator", "HDPE, PET, PP", 24.50, 18.5),
            ("BUY-04", "GreenField Circular Recyclers", "Aggregator", "PET, HDPE, LDPE", 22.00, 34.0),
        ]
        cur.executemany("""
            INSERT OR REPLACE INTO buyers (id, name, type, accepted_material, price_per_kg, distance_km)
            VALUES (?, ?, ?, ?, ?, ?)
        """, buyers)

        # 2. Seed Sheds
        # 6 Village Sheds + 1 Central PWMU
        sheds = [
            ("SHED-01", "Ramanagara South Shed", 2500.0, 1920.0, 12.7214, 77.2812),
            ("SHED-02", "Kanikere Gram Panchayat Shed", 2000.0, 1680.0, 12.8451, 77.3421),
            ("SHED-03", "Bidadi Rural Material Shed", 3000.0, 2350.0, 12.7984, 77.3872),
            ("SHED-04", "Harohalli Cluster Center", 2200.0, 950.0, 12.6512, 77.4520),
            ("SHED-05", "Kaggalipura Waste Depot", 2800.0, 2180.0, 12.8021, 77.5142),
            ("SHED-06", "Magadi North Transit Shed", 2400.0, 1100.0, 12.9561, 77.2289),
        ]
        cur.executemany("""
            INSERT OR REPLACE INTO sheds (id, name, capacity_kg, current_kg, lat, lon)
            VALUES (?, ?, ?, ?, ?, ?)
        """, sheds)

        # 3. Seed Fill History for each shed (last 30 days)
        now = datetime.now()
        fill_history_entries = []
        for shed_id, _, cap, current, _, _ in sheds:
            # Generate 30 daily accumulation points
            running_kg = max(200.0, current - (28 * 45.0))
            for day in range(30, 0, -1):
                ts = (now - timedelta(days=day)).strftime("%Y-%m-%d %H:%M:%S")
                # Gradual accumulation with realistic variance
                daily_add = random.uniform(35.0, 65.0)
                running_kg = min(current, running_kg + daily_add)
                fill_history_entries.append((shed_id, ts, round(running_kg, 1)))
        
        cur.executemany("""
            INSERT INTO fill_history (shed_id, ts, kg)
            VALUES (?, ?, ?)
        """, fill_history_entries)

        # 4. Seed Calibration Log
        calibration_events = [
            ("NODE-01", (now - timedelta(days=58)).strftime("%Y-%m-%d 08:30:00"), "Span Calibration", 50.0, 49.98, "OP-101", "PASS"),
            ("NODE-02", (now - timedelta(days=54)).strftime("%Y-%m-%d 09:15:00"), "Zero Tare Calibration", 0.0, 0.01, "OP-102", "PASS"),
            ("NODE-03", (now - timedelta(days=49)).strftime("%Y-%m-%d 10:00:00"), "Span Calibration", 50.0, 50.02, "OP-103", "PASS"),
            ("NODE-04", (now - timedelta(days=42)).strftime("%Y-%m-%d 08:45:00"), "Span Calibration", 20.0, 20.00, "OP-101", "PASS"),
            ("NODE-05", (now - timedelta(days=35)).strftime("%Y-%m-%d 11:20:00"), "Zero Tare Calibration", 0.0, 0.00, "OP-104", "PASS"),
            ("NODE-06", (now - timedelta(days=28)).strftime("%Y-%m-%d 09:00:00"), "Span Calibration", 50.0, 49.96, "OP-102", "PASS"),
            ("NODE-01", (now - timedelta(days=21)).strftime("%Y-%m-%d 08:15:00"), "Span Calibration", 50.0, 50.01, "OP-101", "PASS"),
            ("NODE-03", (now - timedelta(days=14)).strftime("%Y-%m-%d 09:40:00"), "Zero Tare Calibration", 0.0, 0.02, "OP-103", "PASS"),
            ("NODE-02", (now - timedelta(days=7)).strftime("%Y-%m-%d 10:10:00"), "Span Calibration", 50.0, 49.99, "OP-102", "PASS"),
            ("NODE-05", (now - timedelta(days=2)).strftime("%Y-%m-%d 08:50:00"), "Span Calibration", 50.0, 50.00, "OP-104", "PASS"),
        ]
        cur.executemany("""
            INSERT INTO calibration_log (node_id, ts, type, reference_kg, measured_kg, operator_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, calibration_events)

        # 5. Generate 120 Batches across 60 days
        streams = ["MLP", "HDPE", "LDPE", "PET", "Mixed"]
        stream_weights = [0.35, 0.20, 0.20, 0.15, 0.10]
        operators = ["OP-101 (Ramesh)", "OP-102 (Sunita)", "OP-103 (Manjunath)", "OP-104 (Lakshmi)"]
        vehicles = ["VEH-KA05-8821", "VEH-KA42-3104", "VEH-KA01-9942"]
        village_ids = ["SHED-01", "SHED-02", "SHED-03", "SHED-04", "SHED-05", "SHED-06"]

        # Injected anomaly indices (out of 120, 0-indexed)
        # Exactly 6 anomalous batches with distinct honest patterns
        injected_indices = {
            18: {"type": "high_weight", "kg": 168.5, "hour": 11, "note": "Unusually dense rock/moisture ballast"},
            34: {"type": "odd_timing", "kg": 54.0, "hour": 2, "note": "Midnight unauthorized node weighment"},
            52: {"type": "low_weight", "kg": 7.2, "hour": 14, "note": "Under-weight fragmented bale"},
            71: {"type": "buyer_variance_high", "kg": 62.0, "buyer_kg": 76.5, "hour": 10, "note": "23.4% weighbridge jump at buyer"},
            93: {"type": "buyer_variance_low", "kg": 58.0, "buyer_kg": 46.5, "hour": 15, "note": "-19.8% buyer weight shortage"},
            108: {"type": "timing_and_weight", "kg": 146.0, "hour": 3, "note": "3:15 AM weighment with 146kg heavy bale"}
        }

        prev_hash = GENESIS_HASH
        batch_rows = []
        delivery_rows = []

        # Deterministic generation
        rng = random.Random(42)

        start_date = now - timedelta(days=60)
        
        for i in range(120):
            bale_id = f"BAL-{start_date.year%100:02d}-{1001 + i}"
            village_id = rng.choice(village_ids)
            stream = rng.choices(streams, weights=stream_weights, k=1)[0]
            operator_id = rng.choice(operators)

            # Date calculation: uniformly spaced across 60 days
            day_offset = (i * 60) / 120.0
            batch_date = start_date + timedelta(days=day_offset)

            is_injected = 1 if i in injected_indices else 0

            if i in injected_indices:
                spec = injected_indices[i]
                kg_node = spec["kg"]
                hour = spec["hour"]
                minute = rng.randint(5, 55)
                dt = batch_date.replace(hour=hour, minute=minute, second=rng.randint(0, 59))
            else:
                # Normal weight: standard baler bale between 45.0 and 72.0 kg
                kg_node = round(rng.gauss(56.0, 7.5), 1)
                kg_node = max(38.0, min(80.0, kg_node))
                # Normal working hours: 08:00 to 18:30
                hour = rng.randint(8, 17)
                minute = rng.randint(0, 59)
                dt = batch_date.replace(hour=hour, minute=minute, second=rng.randint(0, 59))

            created_at = dt.strftime("%Y-%m-%d %H:%M:%S")
            photo_path = f"/static/assets/bales/bale_{1001 + i}.svg"

            # Compute tamper-evident hash
            curr_hash = compute_hash(
                bale_id=bale_id,
                village_id=village_id,
                stream=stream,
                kg_node=kg_node,
                created_at=created_at,
                operator_id=operator_id,
                prev_hash=prev_hash
            )

            # Determine delivery and reconciliation status
            # 0 to 85: Delivered with buyer slip
            # 86 to 109: Delivered but no buyer slip yet -> "Recorded (unverified)"
            # 110 to 119: Newly baled at shed/node -> "Recorded"
            if i <= 85:
                # Assign appropriate buyer
                if stream == "MLP":
                    buyer_id = "BUY-01" # Cement kiln
                elif stream == "LDPE":
                    buyer_id = "BUY-02" # Road contractor
                elif stream in ["HDPE", "PET"]:
                    buyer_id = rng.choice(["BUY-03", "BUY-04"])
                else:
                    buyer_id = rng.choice(["BUY-01", "BUY-02", "BUY-03", "BUY-04"])

                vehicle_id = rng.choice(vehicles)
                delivered_dt = dt + timedelta(days=rng.randint(1, 4), hours=rng.randint(2, 6))
                delivered_at = delivered_dt.strftime("%Y-%m-%d %H:%M:%S")
                slip_ref = f"WB-{delivered_dt.strftime('%y%m')}-{rng.randint(1000, 9999)}"

                if i in injected_indices and "buyer_kg" in injected_indices[i]:
                    kg_buyer = injected_indices[i]["buyer_kg"]
                else:
                    # Realistic minor load cell scale discrepancy between 0.2% and 1.8%
                    delta_pct = rng.gauss(0.0, 0.9)
                    kg_buyer = round(kg_node * (1.0 + delta_pct / 100.0), 1)

                variance_pct = abs(kg_node - kg_buyer) / kg_node * 100.0

                # HONESTY RULE:
                # "Verified" appears only when a buyer weight exists and variance is within tolerance (3.0%).
                # Otherwise "Flagged"
                if variance_pct <= 3.0:
                    status = "Verified"
                else:
                    status = "Flagged"

                # Cost assumptions:
                # Transport cost = distance (buyer) * transport rate (approx 18) / batches_per_load
                buyer_distance = 30.0
                transport_cost = round((buyer_distance * 18.0) / 40.0, 2)
                # Handling cost: 1.50 / kg
                handling_cost = round(kg_node * 1.50, 2)
                # Price per kg
                price_map = {"MLP": 8.50, "LDPE": 16.00, "HDPE": 24.50, "PET": 22.00, "Mixed": 7.00}
                sale_value = round(kg_buyer * price_map.get(stream, 10.0), 2)

                delivery_rows.append((
                    i + 1, # batch_id
                    buyer_id,
                    vehicle_id,
                    kg_buyer,
                    slip_ref,
                    delivered_at,
                    transport_cost,
                    sale_value
                ))
            elif i <= 109:
                # Delivered without buyer weighbridge slip -> Recorded (unverified)
                status = "Recorded (unverified)"
                buyer_id = rng.choice(["BUY-01", "BUY-02", "BUY-03", "BUY-04"])
                vehicle_id = rng.choice(vehicles)
                delivered_dt = dt + timedelta(days=1)
                delivered_at = delivered_dt.strftime("%Y-%m-%d %H:%M:%S")

                delivery_rows.append((
                    i + 1,
                    buyer_id,
                    vehicle_id,
                    None, # no buyer kg yet
                    None, # no slip ref yet
                    delivered_at,
                    12.50,
                    0.0
                ))
            else:
                # Freshly recorded at village shed
                status = "Recorded"

            batch_rows.append((
                i + 1,
                bale_id,
                village_id,
                stream,
                kg_node,
                created_at,
                operator_id,
                photo_path,
                prev_hash,
                curr_hash,
                status,
                1, # version
                is_injected,
                None, # parent_id
                None  # edit_reason
            ))

            prev_hash = curr_hash

        # Insert batches
        cur.executemany("""
            INSERT INTO batches (
                id, bale_id, village_id, stream, kg_node, created_at, operator_id,
                photo_path, prev_hash, hash, status, version, is_injected, parent_id, edit_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, batch_rows)

        # Insert deliveries
        cur.executemany("""
            INSERT INTO deliveries (
                batch_id, buyer_id, vehicle_id, kg_buyer, slip_ref, delivered_at, transport_cost, sale_value
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, delivery_rows)

        return {
            "status": "seeded_successfully",
            "batch_count": len(batch_rows),
            "delivery_count": len(delivery_rows),
            "injected_count": len(injected_indices),
            "chain_head": prev_hash
        }
