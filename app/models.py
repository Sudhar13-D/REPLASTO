from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class BatchCreate(BaseModel):
    village_id: str = Field(..., description="Village shed ID (e.g. SHED-01)")
    stream: str = Field(..., description="Plastic stream (e.g. MLP, HDPE, LDPE, PET, Mixed)")
    kg_node: float = Field(..., gt=0, description="Node scale measured weight in kg")
    operator_id: str = Field(..., description="Operator identifier")
    photo_path: Optional[str] = Field(None, description="Optional relative photo path")
    created_at: Optional[str] = Field(None, description="Optional ISO timestamp; defaults to now")

class BatchUpdate(BaseModel):
    batch_id: int = Field(..., description="ID of the batch to create a new version for")
    stream: Optional[str] = None
    kg_node: Optional[float] = Field(None, gt=0)
    operator_id: str = Field(..., description="Operator requesting the edit")
    edit_reason: str = Field(..., min_length=3, description="Audit reason for version update")

class DeliveryRecord(BaseModel):
    batch_id: int
    buyer_id: str
    vehicle_id: str
    kg_buyer: Optional[float] = Field(None, gt=0, description="Weighbridge weight at buyer premises")
    slip_ref: Optional[str] = Field(None, description="Buyer weighbridge slip receipt reference")
    delivered_at: Optional[str] = None

class SettingItemUpdate(BaseModel):
    key: str
    value: str

class SettingsUpdateRequest(BaseModel):
    settings: Dict[str, str]

class RoutePlanRequest(BaseModel):
    vehicle_capacity_kg: Optional[float] = None
    fill_threshold_pct: Optional[float] = None

class OfflineSyncBatch(BaseModel):
    bale_id: Optional[str] = None
    village_id: str
    stream: str
    kg_node: float
    created_at: str
    operator_id: str
    photo_path: Optional[str] = None
