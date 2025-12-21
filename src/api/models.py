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
TASK_STATUSES = ["pending", "in_progress", "completed"]
TASK_PRIORITIES = ["low", "medium", "high", "critical"]


class Task(BaseModel):
    id: int
    customer_id: Optional[UUID] = None
    alert_id: Optional[int] = None
    task_type: str
    priority: str
    status: str
    # Assignment fields
    assigned_to: Optional[UUID] = None
    assigned_by: Optional[UUID] = None
    assigned_at: Optional[datetime] = None
    # Workflow fields
    workflow_id: Optional[str] = None
    workflow_run_id: Optional[str] = None
    workflow_status: Optional[str] = None
    # Task content
    title: str
    description: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict)
    due_date: Optional[datetime] = None
    # Completion fields
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    resolution_notes: Optional[str] = None
    # Timestamps
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    # Joined fields from related tables
    customer_name: Optional[str] = None
    customer_risk_level: Optional[str] = None
    alert_scenario: Optional[str] = None
    alert_severity: Optional[str] = None
    # Joined user name
    assigned_to_name: Optional[str] = None


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
    details: Optional[dict[str, Any]] = None  # Allow editing task details
    changed_by: Optional[UUID] = None  # User who made the change (for history tracking)


class TaskClaim(BaseModel):
    assigned_to: UUID  # User ID claiming/assigning the task


class TaskComplete(BaseModel):
    completed_by_id: Optional[UUID] = None
    completed_by: Optional[str] = None  # Fallback for legacy
    resolution_notes: Optional[str] = None


class TaskAssign(BaseModel):
    assigned_to: UUID
    assigned_by: UUID


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


# =============================================================================
# USER MODELS
# =============================================================================

USER_ROLES = ["analyst", "senior_analyst", "manager", "admin"]


class User(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    email: str
    full_name: str
    role: str = "analyst"
    password: str  # Required for new users


class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class ResetPasswordRequest(BaseModel):
    new_password: str


# =============================================================================
# TASK NOTE MODELS
# =============================================================================

class TaskNote(BaseModel):
    id: int
    task_id: int
    user_id: Optional[UUID] = None
    content: str
    created_at: datetime
    updated_at: datetime
    # Joined field
    user_name: Optional[str] = None


class TaskNoteCreate(BaseModel):
    user_id: UUID
    content: str


# =============================================================================
# TASK ATTACHMENT MODELS
# =============================================================================

class TaskAttachment(BaseModel):
    id: int
    task_id: int
    user_id: Optional[UUID] = None
    filename: str
    original_filename: str
    file_path: str
    file_size: int
    content_type: str
    created_at: datetime
    # Joined field
    user_name: Optional[str] = None


# =============================================================================
# TASK STATUS HISTORY MODELS
# =============================================================================

class TaskStatusHistory(BaseModel):
    id: int
    task_id: int
    previous_status: Optional[str] = None
    new_status: str
    changed_by: Optional[UUID] = None
    changed_by_name: Optional[str] = None  # Joined field
    reason: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime


# =============================================================================
# ALERT LIFECYCLE MODELS
# =============================================================================

ALERT_STATUSES = ['open', 'assigned', 'in_progress', 'escalated', 'on_hold', 'resolved']
RESOLUTION_TYPES = ['confirmed_suspicious', 'false_positive', 'not_suspicious', 'duplicate', 'other']
ALERT_PRIORITIES = ['low', 'medium', 'high', 'critical']


class AlertFull(BaseModel):
    """Full alert model with lifecycle fields"""
    id: int
    customer_id: Optional[UUID] = None
    type: str
    status: str
    severity: str
    scenario: Optional[str] = None
    alert_definition_id: Optional[int] = None
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution_notes: Optional[str] = None
    # Lifecycle fields
    assigned_to: Optional[UUID] = None
    assigned_by: Optional[UUID] = None
    assigned_at: Optional[datetime] = None
    escalated_to: Optional[UUID] = None
    escalated_by: Optional[UUID] = None
    escalated_at: Optional[datetime] = None
    escalation_reason: Optional[str] = None
    resolution_type: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[datetime] = None
    # Joined fields
    customer_name: Optional[str] = None
    assigned_to_name: Optional[str] = None
    assigned_to_email: Optional[str] = None
    escalated_to_name: Optional[str] = None


class AlertActionRequest(BaseModel):
    """Base model for alert action requests with user context"""
    current_user_id: Optional[UUID] = None
    current_user_role: str = "analyst"


class AlertAssign(AlertActionRequest):
    """Request to assign an alert"""
    assigned_to: UUID
    assigned_by: Optional[UUID] = None  # None if self-assigning


class AlertEscalate(AlertActionRequest):
    """Request to escalate an alert"""
    escalated_to: UUID
    reason: str


class AlertResolve(AlertActionRequest):
    """Request to resolve an alert"""
    resolution_type: str = Field(..., description="One of: confirmed_suspicious, false_positive, not_suspicious, duplicate, other")
    resolution_notes: Optional[str] = None


class AlertHold(AlertActionRequest):
    """Request to put an alert on hold"""
    reason: Optional[str] = None


class AlertReopen(AlertActionRequest):
    """Request to reopen an alert (manager only)"""
    reason: Optional[str] = None


class AlertStart(AlertActionRequest):
    """Request to start work on an alert"""
    pass


class AlertUnassign(AlertActionRequest):
    """Request to unassign an alert"""
    pass


class AlertResume(AlertActionRequest):
    """Request to resume work on an alert"""
    pass


# =============================================================================
# ALERT NOTE MODELS
# =============================================================================

class AlertNote(BaseModel):
    id: int
    alert_id: int
    user_id: Optional[UUID] = None
    content: str
    note_type: str = "comment"
    created_at: datetime
    updated_at: datetime
    # Joined field
    user_name: Optional[str] = None


class AlertNoteCreate(AlertActionRequest):
    """Request to add a note to an alert"""
    content: str
    note_type: str = "comment"


# =============================================================================
# ALERT ATTACHMENT MODELS
# =============================================================================

class AlertAttachment(BaseModel):
    id: int
    alert_id: int
    user_id: Optional[UUID] = None
    filename: str
    original_filename: str
    file_path: str
    file_size: int
    content_type: str
    created_at: datetime
    # Joined field
    user_name: Optional[str] = None


# =============================================================================
# ALERT STATUS HISTORY MODELS
# =============================================================================

class AlertStatusHistory(BaseModel):
    id: int
    alert_id: int
    previous_status: Optional[str] = None
    new_status: str
    changed_by: Optional[UUID] = None
    changed_by_name: Optional[str] = None
    reason: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


# =============================================================================
# WORKFLOW DEFINITION MODELS
# =============================================================================

WORKFLOW_TYPES = ["kyc_refresh", "sanctions_screening", "investigation", "document_request", "escalation", "sar_filing"]
SCHEDULE_TYPES = ["cron", "event", "manual"]
SEVERITIES = ["low", "medium", "high", "critical"]


class WorkflowDefinition(BaseModel):
    """Workflow definition model"""
    id: int
    code: str
    name: str
    description: Optional[str] = None
    workflow_type: str
    schedule_type: str
    cron_expression: Optional[str] = None
    trigger_event: Optional[str] = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    create_alert: bool
    alert_severity: str
    create_task: bool
    task_type: Optional[str] = None
    task_priority: str
    timeout_seconds: int
    retry_max_attempts: int
    retry_backoff_seconds: int
    enabled: bool
    is_system_default: bool
    version: int
    created_at: datetime
    updated_at: datetime


class WorkflowDefinitionCreate(BaseModel):
    """Create workflow definition request"""
    code: str
    name: str
    description: Optional[str] = None
    workflow_type: str = Field(..., description="One of: kyc_refresh, sanctions_screening, investigation, document_request, escalation, sar_filing")
    schedule_type: str = Field("manual", description="One of: cron, event, manual")
    cron_expression: Optional[str] = Field(None, description="Cron expression for scheduled workflows, e.g., '0 2 * * *'")
    trigger_event: Optional[str] = Field(None, description="Event that triggers the workflow, e.g., 'customer.created'")
    parameters: dict[str, Any] = Field(default_factory=dict, description="Workflow-specific configuration parameters")
    create_alert: bool = False
    alert_severity: str = "medium"
    create_task: bool = False
    task_type: Optional[str] = None
    task_priority: str = "medium"
    timeout_seconds: int = 3600
    retry_max_attempts: int = 3
    retry_backoff_seconds: int = 60
    enabled: bool = True


class WorkflowDefinitionUpdate(BaseModel):
    """Update workflow definition request"""
    name: Optional[str] = None
    description: Optional[str] = None
    schedule_type: Optional[str] = None
    cron_expression: Optional[str] = None
    trigger_event: Optional[str] = None
    parameters: Optional[dict[str, Any]] = None
    create_alert: Optional[bool] = None
    alert_severity: Optional[str] = None
    create_task: Optional[bool] = None
    task_type: Optional[str] = None
    task_priority: Optional[str] = None
    timeout_seconds: Optional[int] = None
    retry_max_attempts: Optional[int] = None
    retry_backoff_seconds: Optional[int] = None
    enabled: Optional[bool] = None


class WorkflowExecution(BaseModel):
    """Workflow execution history model"""
    id: int
    workflow_definition_id: Optional[int] = None
    workflow_definition_code: Optional[str] = None
    temporal_workflow_id: Optional[str] = None
    temporal_run_id: Optional[str] = None
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    triggered_by: Optional[str] = None
    triggered_by_user_id: Optional[UUID] = None
    parameters_used: Optional[dict[str, Any]] = None
    # Joined fields
    workflow_name: Optional[str] = None
    triggered_by_user_name: Optional[str] = None


class WorkflowRunRequest(BaseModel):
    """Request to manually run a workflow"""
    parameters: Optional[dict[str, Any]] = None
    triggered_by_user_id: Optional[UUID] = None
