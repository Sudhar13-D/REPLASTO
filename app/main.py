from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import os

from app.db import init_db
from app.seed import seed_database
from app.routers import (
    batches,
    collection,
    reconciliation,
    anomalies,
    economics,
    integrity,
    settings,
    sheds_buyers,
    overview
)

app = FastAPI(
    title="Replasto",
    description="Offline-first Chain-of-Custody System for Rural Plastic Waste",
    version="1.0.0"
)

# Enable CORS for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB and Seed data on startup
@app.on_event("startup")
def on_startup():
    init_db()
    seed_database(force=False)

# Register Routers
app.include_router(overview.router)
app.include_router(batches.router)
app.include_router(collection.router)
app.include_router(reconciliation.router)
app.include_router(anomalies.router)
app.include_router(economics.router)
app.include_router(integrity.router)
app.include_router(settings.router)
app.include_router(sheds_buyers.router)

# Mount static files
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
def serve_index():
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.get("/health")
def health_check():
    return {"status": "ok", "app": "Replasto", "version": "1.0.0"}

# Global Exception Handler for predictable JSON responses
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "InternalServerError", "detail": str(exc)}
    )
