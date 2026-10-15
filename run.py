import os
import uvicorn
import sys
from app.db import init_db
from app.seed import seed_database

def main():
    print("==============================================================")
    print("  REPLASTO: Rural Plastic Waste Chain-of-Custody Dashboard")
    print("  Tamper-Evident • Offline-First • Multi-Layer Plastic Trace")
    print("==============================================================")
    
    print("[1/2] Initializing SQLite database and verifying seed data...")
    init_db()
    result = seed_database(force=False)
    print(f"      Status: {result.get('status')} | Batches: {result.get('batch_count', '~120')}")

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")

    print(f"[2/2] Starting Replasto server at http://{host}:{port}")
    print("      Vendor libraries: Chart.js (offline local vendor)")
    print("      Press Ctrl+C to terminate.")
    print("==============================================================")

    uvicorn.run("app.main:app", host=host, port=port, reload=False, log_level="info")

if __name__ == "__main__":
    main()
