from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class RiskIndicators(BaseModel):
    geography_risk: float = Field(0, ge=0, le=10)
    product_risk: float = Field(0, ge=0, le=10)
    behavior_risk: float = Field(0, ge=0, le=10)
    adverse_media: bool = False
    pep_flag: bool = False
    sanctions_hit: bool = False


class CustomerCreate(BaseModel):
    full_name: str
    email: Optional[str] = None
    country: Optional[str] = None
    id_document_expiry: Optional[date] = None
    indicators: RiskIndicators = Field(default_factory=RiskIndicators)
    risk_override: Optional[str] = None


class Customer(BaseModel):
    id: UUID
    full_name: str
    email: Optional[str] = None
    country: Optional[str] = None
    risk_score: float
    risk_level: str
    risk_override: Optional[str] = None
    id_document_expiry: Optional[date] = None
    pep_flag: bool
    sanctions_hit: bool
    created_at: datetime


class TransactionCreate(BaseModel):
    customer_id: UUID
    amount: float
    currency: str = "EUR"
    channel: Optional[str] = None
    country: Optional[str] = None
    merchant_category: Optional[str] = None
    occurred_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Alert(BaseModel):
    id: int
    customer_id: Optional[UUID]
    type: str
    status: str
    severity: str
    scenario: Optional[str]
    details: dict[str, Any]
    created_at: datetime
    resolved_at: Optional[datetime]
    resolution_notes: Optional[str]


class AlertUpdate(BaseModel):
    status: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolved_by: Optional[str] = None


class ReportFilters(BaseModel):
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    risk_level: Optional[str] = None
    scenario: Optional[str] = None
