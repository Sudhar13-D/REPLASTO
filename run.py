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

    print("[2/2] Starting Replasto local server at http://127.0.0.1:8000")
    print("      Vendor libraries: Chart.js (offline local vendor)")
    print("      Press Ctrl+C to terminate.")
    print("==============================================================")

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False, log_level="info")

if __name__ == "__main__":
    main()
