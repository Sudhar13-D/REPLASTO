from fastapi import APIRouter, HTTPException
from app.config import get_settings, update_setting
from app.models import SettingsUpdateRequest

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("")
def read_settings():
    return get_settings()

@router.post("")
def modify_settings(req: SettingsUpdateRequest):
    for key, value in req.settings.items():
        try:
            # Validate float conversion for numeric settings
            float(value)
            update_setting(key, value)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid numeric value for setting '{key}': {value}")
    return {"status": "success", "updated": req.settings, "current": get_settings()}
