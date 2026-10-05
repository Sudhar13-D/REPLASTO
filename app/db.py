import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager

DB_DIR = Path(__file__).resolve().parent.parent / "data"
DB_FILE = DB_DIR / "replasto.db"

def init_db():
    DB_DIR.mkdir(parents=True, exist_ok=True)
    with get_db_cursor() as cur:
        # Batches table with versioning support
        cur.execute("""
            CREATE TABLE IF NOT EXISTS batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bale_id TEXT NOT NULL,
                village_id TEXT NOT NULL,
                stream TEXT NOT NULL,
                kg_node REAL NOT NULL,
                created_at TEXT NOT NULL,
                operator_id TEXT NOT NULL,
                photo_path TEXT,
                prev_hash TEXT NOT NULL,
                hash TEXT NOT NULL,
                status TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                is_injected INTEGER NOT NULL DEFAULT 0,
                parent_id INTEGER,
                edit_reason TEXT
            )
        """)
        
        # Deliveries table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS deliveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id INTEGER NOT NULL UNIQUE,
                buyer_id TEXT NOT NULL,
                vehicle_id TEXT NOT NULL,
                kg_buyer REAL,
                slip_ref TEXT,
                delivered_at TEXT NOT NULL,
                transport_cost REAL NOT NULL DEFAULT 0.0,
                sale_value REAL NOT NULL DEFAULT 0.0,
                FOREIGN KEY(batch_id) REFERENCES batches(id)
            )
        """)

        # Sheds table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sheds (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                capacity_kg REAL NOT NULL,
                current_kg REAL NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL
            )
        """)

        # Fill history table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS fill_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shed_id TEXT NOT NULL,
                ts TEXT NOT NULL,
                kg REAL NOT NULL,
                FOREIGN KEY(shed_id) REFERENCES sheds(id)
            )
        """)

        # Buyers table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS buyers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                accepted_material TEXT NOT NULL,
                price_per_kg REAL NOT NULL,
                distance_km REAL NOT NULL
            )
        """)

        # Calibration log
        cur.execute("""
            CREATE TABLE IF NOT EXISTS calibration_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT NOT NULL,
                ts TEXT NOT NULL,
                type TEXT NOT NULL,
                reference_kg REAL NOT NULL,
                measured_kg REAL NOT NULL,
                operator_id TEXT NOT NULL,
                status TEXT NOT NULL
            )
        """)

        # App Settings (assumptions)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                label TEXT NOT NULL,
                category TEXT NOT NULL
            )
        """)

        # Create indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_batches_bale ON batches(bale_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_batches_created ON batches(created_at)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_batches_village ON batches(village_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_deliveries_batch ON deliveries(batch_id)")

@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

@contextmanager
def get_db_cursor():
    with get_db() as conn:
        cursor = conn.cursor()
        yield cursor
