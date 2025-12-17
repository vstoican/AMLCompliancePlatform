from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class RiskIndicators(BaseModel):
    geography_risk: float = Field(1, ge=1, le=10)
    product_risk: float = Field(1, ge=1, le=10)
    behavior_risk: float = Field(1, ge=1, le=10)
    adverse_media: bool = False
    pep_flag: bool = False
    sanctions_hit: bool = False


class CustomerCreate(BaseModel):
    # Basic Info
    member_id: Optional[str] = None
    first_name: str
    last_name: str
    phone_number: Optional[str] = None
    status: str = "PENDING"
    email: Optional[str] = None

    # Personal Details
    birth_date: Optional[date] = None
    identity_number: Optional[str] = None
    place_of_birth: Optional[str] = None
    country_of_birth: Optional[str] = None

    # Address
    address_county: Optional[str] = None
    address_city: Optional[str] = None
    address_street: Optional[str] = None
    address_house_number: Optional[str] = None
    address_block_number: Optional[str] = None
    address_entrance: Optional[str] = None
    address_apartment: Optional[str] = None

    # Employment
    employer_name: Optional[str] = None

    # Document Info
    document_type: Optional[str] = None
    document_id: Optional[str] = None
    document_issuer: Optional[str] = None
    document_date_of_expire: Optional[date] = None
    document_date_of_issue: Optional[date] = None

    # Financial/Credit Limits
    leanpay_monthly_repayment: float = 0
    available_monthly_credit_limit: float = 0
    available_exposure: float = 0

    # Validation & Consent
    data_validated: str = "NOT VALIDATED"
    marketing_consent: str = "NOT SET"
    kyc_motion_consent_given: bool = False

    # Risk Indicators
    indicators: RiskIndicators = Field(default_factory=RiskIndicators)
    risk_override: Optional[str] = None


class Customer(BaseModel):
    id: UUID

    # Basic Info
    member_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None  # Legacy field, computed
    phone_number: Optional[str] = None
    status: str = "PENDING"
    application_time: Optional[datetime] = None
    email: Optional[str] = None

    # Personal Details
    birth_date: Optional[date] = None
    identity_number: Optional[str] = None
    place_of_birth: Optional[str] = None
    country_of_birth: Optional[str] = None

    # Address
    address_county: Optional[str] = None
    address_city: Optional[str] = None
    address_street: Optional[str] = None
    address_house_number: Optional[str] = None
    address_block_number: Optional[str] = None
    address_entrance: Optional[str] = None
    address_apartment: Optional[str] = None

    # Employment
    employer_name: Optional[str] = None

    # Document Info
    document_type: Optional[str] = None
    document_id: Optional[str] = None
    document_issuer: Optional[str] = None
    document_date_of_expire: Optional[date] = None
    document_date_of_issue: Optional[date] = None

    # Financial/Credit Limits
    leanpay_monthly_repayment: float = 0
    available_monthly_credit_limit: float = 0
    available_exposure: float = 0
    limit_exposure_last_update: Optional[datetime] = None

    # Validation & Consent
    data_validated: str = "NOT VALIDATED"
    marketing_consent: str = "NOT SET"
    marketing_consent_last_modified: Optional[datetime] = None
    kyc_motion_consent_given: bool = False
    kyc_motion_consent_date: Optional[datetime] = None

    # Risk Management
    risk_score: float = 0
    risk_level: str = "low"
    risk_override: Optional[str] = None
    pep_flag: bool = False
    sanctions_hit: bool = False
    geography_risk: float = 1
    product_risk: float = 1
    behavior_risk: float = 1

    created_at: datetime


class TransactionCreate(BaseModel):
    surrogate_id: str
    person_first_name: str
    person_last_name: str
    vendor_name: Optional[str] = None
    price_number_of_months: int = 1
    grace_number_of_months: int = 0
    original_transaction_amount: float
    amount: float
    vendor_transaction_id: Optional[str] = None
    client_settlement_status: str = "unpaid"
    vendor_settlement_status: str = "unpaid"
    transaction_delivery_status: str = "PENDING"
    partial_delivery: bool = False
    transaction_last_activity: str = "REGULAR"
    transaction_financial_status: str = "PENDING"
    customer_id: Optional[UUID] = None


class Transaction(BaseModel):
    id: int
    surrogate_id: str
    person_first_name: str
    person_last_name: str
    vendor_name: Optional[str] = None
    price_number_of_months: int = 1
    grace_number_of_months: int = 0
    original_transaction_amount: float
    amount: float
    created_at: datetime
    vendor_transaction_id: Optional[str] = None
    client_settlement_status: str = "unpaid"
    vendor_settlement_status: str = "unpaid"
    transaction_delivery_status: str = "PENDING"
    partial_delivery: bool = False
    transaction_last_activity: str = "REGULAR"
    transaction_financial_status: str = "PENDING"
    customer_id: Optional[UUID] = None


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


# =============================================================================
# TASK MODELS
# =============================================================================

TASK_TYPES = ["investigation", "kyc_refresh", "document_request", "escalation", "sar_filing"]
TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"]
TASK_PRIORITIES = ["low", "medium", "high", "critical"]


class Task(BaseModel):
    id: int
    customer_id: Optional[UUID] = None
    alert_id: Optional[int] = None
    task_type: str
    priority: str
    status: str
    claimed_by: Optional[str] = None
    claimed_at: Optional[datetime] = None
    workflow_id: Optional[str] = None
    workflow_run_id: Optional[str] = None
    workflow_status: Optional[str] = None
    title: str
    description: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict)
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    # Joined fields from related tables
    customer_name: Optional[str] = None
    customer_risk_level: Optional[str] = None
    alert_scenario: Optional[str] = None
    alert_severity: Optional[str] = None


class TaskCreate(BaseModel):
    customer_id: Optional[UUID] = None
    alert_id: Optional[int] = None
    task_type: str = Field(..., description="One of: investigation, kyc_refresh, document_request, escalation, sar_filing")
    priority: str = Field("medium", description="One of: low, medium, high, critical")
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    details: Optional[dict[str, Any]] = None


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    resolution_notes: Optional[str] = None


class TaskClaim(BaseModel):
    claimed_by: str


class TaskComplete(BaseModel):
    completed_by: str
    resolution_notes: Optional[str] = None


# =============================================================================
# TASK DEFINITION MODELS
# =============================================================================

class TaskDefinition(BaseModel):
    id: int
    alert_scenario: str
    alert_severity: Optional[list[str]] = None
    task_type: str
    default_priority: str
    due_date_offset_hours: int
    title_template: str
    description_template: Optional[str] = None
    enabled: bool
    auto_start_workflow: bool
    created_at: datetime
    updated_at: datetime


class TaskDefinitionCreate(BaseModel):
    alert_scenario: str
    alert_severity: Optional[list[str]] = None
    task_type: str = Field(..., description="One of: investigation, kyc_refresh, document_request, escalation, sar_filing")
    default_priority: str = Field("medium", description="One of: low, medium, high, critical")
    due_date_offset_hours: int = 48
    title_template: str = Field(..., description="Supports {scenario}, {customer_name}, {amount} placeholders")
    description_template: Optional[str] = None
    enabled: bool = True
    auto_start_workflow: bool = False


class TaskDefinitionUpdate(BaseModel):
    alert_severity: Optional[list[str]] = None
    task_type: Optional[str] = None
    default_priority: Optional[str] = None
    due_date_offset_hours: Optional[int] = None
    title_template: Optional[str] = None
    description_template: Optional[str] = None
    enabled: Optional[bool] = None
    auto_start_workflow: Optional[bool] = None
