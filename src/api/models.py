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
    alert_definition_id: Optional[int] = None
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


class AlertDefinition(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    category: str
    enabled: bool
    severity: str
    threshold_amount: Optional[float] = None
    window_minutes: Optional[int] = None
    channels: Optional[list[str]] = None
    country_scope: Optional[list[str]] = None
    direction: Optional[str] = None
    is_system_default: bool = False
    created_at: datetime
    updated_at: datetime


class AlertDefinitionCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    category: str = "transaction_monitoring"
    enabled: bool = True
    severity: str = "medium"
    threshold_amount: Optional[float] = None
    window_minutes: Optional[int] = None
    channels: Optional[list[str]] = None
    country_scope: Optional[list[str]] = None
    direction: Optional[str] = None


class AlertDefinitionUpdate(BaseModel):
    enabled: Optional[bool] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    threshold_amount: Optional[float] = None
    window_minutes: Optional[int] = None
    channels: Optional[list[str]] = None
    country_scope: Optional[list[str]] = None
    direction: Optional[str] = None
