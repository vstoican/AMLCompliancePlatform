"""Data export endpoints for compliance reporting."""

import csv
import io
import logging
from datetime import date, datetime
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from .config import settings
from .db import connection
from .security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/exports", tags=["exports"])

# S3/MinIO client
ARCHIVE_FOLDER = "compliance-exports"


def get_s3_client():
    """Get S3/MinIO client."""
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )


class ArchiveResponse(BaseModel):
    """Response for archive operation."""
    success: bool
    path: str
    filename: str
    size_bytes: int
    message: str


def format_value(value) -> str:
    """Format a value for CSV export."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (list, dict)):
        import json
        return json.dumps(value)
    return str(value)


def rows_to_csv_bytes(rows: list[dict]) -> bytes:
    """Convert rows to CSV bytes."""
    if not rows:
        return b""

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()

    for row in rows:
        writer.writerow({k: format_value(v) for k, v in row.items()})

    return output.getvalue().encode('utf-8')


async def upload_to_s3(content: bytes, filename: str, export_type: str) -> ArchiveResponse:
    """Upload content to S3/MinIO."""
    s3 = get_s3_client()
    bucket = settings.s3_archive_bucket

    # Create path with date folder structure
    now = datetime.now()
    path = f"{ARCHIVE_FOLDER}/{export_type}/{now.strftime('%Y/%m/%d')}/{filename}"

    try:
        s3.put_object(
            Bucket=bucket,
            Key=path,
            Body=content,
            ContentType='text/csv',
        )

        return ArchiveResponse(
            success=True,
            path=path,
            filename=filename,
            size_bytes=len(content),
            message=f"Successfully archived to {bucket}/{path}",
        )
    except ClientError as e:
        logger.error(f"Failed to upload to S3: {e}")
        return ArchiveResponse(
            success=False,
            path="",
            filename=filename,
            size_bytes=0,
            message=f"Failed to archive: {str(e)}",
        )


def create_csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    """Create a streaming CSV response from a list of dicts."""
    if not rows:
        # Return empty CSV with headers
        output = io.StringIO()
        output.write("")
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()

    for row in rows:
        writer.writerow({k: format_value(v) for k, v in row.items()})

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/customers")
async def export_customers(
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    status: Optional[str] = Query(None, description="Filter by status"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Export all customers to CSV."""
    clauses = []
    params = []

    if risk_level:
        clauses.append("risk_level = %s")
        params.append(risk_level)
    if status:
        clauses.append("status = %s")
        params.append(status)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            id, member_id, first_name, last_name, full_name, email, phone_number,
            status, birth_date, identity_number, place_of_birth, country_of_birth,
            address_county, address_city, address_street, address_house_number,
            employer_name, document_type, document_id, document_issuer,
            document_date_of_expire, document_date_of_issue,
            risk_score, risk_level, risk_override, pep_flag, sanctions_hit,
            geography_risk, product_risk, behavior_risk,
            created_at
        FROM customers
        {where}
        ORDER BY created_at DESC
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return create_csv_response(rows, f"customers_export_{timestamp}.csv")


@router.get("/alerts")
async def export_alerts(
    from_date: Optional[date] = Query(None, description="Start date"),
    to_date: Optional[date] = Query(None, description="End date"),
    status: Optional[str] = Query(None, description="Filter by status"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Export alerts to CSV with optional date range filter."""
    clauses = []
    params = []

    if from_date:
        clauses.append("a.created_at >= %s")
        params.append(datetime.combine(from_date, datetime.min.time()))
    if to_date:
        clauses.append("a.created_at <= %s")
        params.append(datetime.combine(to_date, datetime.max.time()))
    if status:
        clauses.append("a.status = %s")
        params.append(status)
    if severity:
        clauses.append("a.severity = %s")
        params.append(severity)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            a.id, a.type, a.scenario, a.severity, a.status, a.priority,
            a.customer_id, c.full_name as customer_name,
            a.details, a.resolution_notes, a.resolution_type,
            a.assigned_to, u.full_name as assigned_to_name, a.assigned_at,
            a.escalated_to, a.escalation_reason, a.escalated_at,
            a.resolved_by, a.resolved_at, a.due_date,
            a.created_at
        FROM alerts a
        LEFT JOIN customers c ON c.id = a.customer_id
        LEFT JOIN users u ON u.id = a.assigned_to
        {where}
        ORDER BY a.created_at DESC
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return create_csv_response(rows, f"alerts_export_{timestamp}.csv")


@router.get("/transactions")
async def export_transactions(
    from_date: Optional[date] = Query(None, description="Start date"),
    to_date: Optional[date] = Query(None, description="End date"),
    customer_id: Optional[str] = Query(None, description="Filter by customer ID"),
    financial_status: Optional[str] = Query(None, description="Filter by financial status"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Export transactions to CSV with optional filters."""
    clauses = []
    params = []

    if from_date:
        clauses.append("t.created_at >= %s")
        params.append(datetime.combine(from_date, datetime.min.time()))
    if to_date:
        clauses.append("t.created_at <= %s")
        params.append(datetime.combine(to_date, datetime.max.time()))
    if customer_id:
        clauses.append("t.customer_id = %s")
        params.append(customer_id)
    if financial_status:
        clauses.append("t.transaction_financial_status = %s")
        params.append(financial_status)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            t.id, t.surrogate_id, t.customer_id, c.full_name as customer_name,
            t.person_first_name, t.person_last_name, t.vendor_name,
            t.amount, t.original_transaction_amount,
            t.price_number_of_months, t.grace_number_of_months,
            t.vendor_transaction_id,
            t.client_settlement_status, t.vendor_settlement_status,
            t.transaction_delivery_status, t.partial_delivery,
            t.transaction_last_activity, t.transaction_financial_status,
            t.created_at
        FROM transactions t
        LEFT JOIN customers c ON c.id = t.customer_id
        {where}
        ORDER BY t.created_at DESC
        LIMIT 100000
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return create_csv_response(rows, f"transactions_export_{timestamp}.csv")


@router.get("/tasks")
async def export_tasks(
    from_date: Optional[date] = Query(None, description="Start date"),
    to_date: Optional[date] = Query(None, description="End date"),
    status: Optional[str] = Query(None, description="Filter by status"),
    task_type: Optional[str] = Query(None, description="Filter by task type"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Export tasks to CSV with optional filters."""
    clauses = []
    params = []

    if from_date:
        clauses.append("t.created_at >= %s")
        params.append(datetime.combine(from_date, datetime.min.time()))
    if to_date:
        clauses.append("t.created_at <= %s")
        params.append(datetime.combine(to_date, datetime.max.time()))
    if status:
        clauses.append("t.status = %s")
        params.append(status)
    if task_type:
        clauses.append("t.task_type = %s")
        params.append(task_type)
    if priority:
        clauses.append("t.priority = %s")
        params.append(priority)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            t.id, t.title, t.description, t.task_type, t.priority, t.status,
            t.customer_id, c.full_name as customer_name,
            t.alert_id,
            t.assigned_to, u.full_name as assigned_to_name,
            t.due_date, t.completed_at,
            t.workflow_id, t.workflow_status,
            t.created_by, t.created_at, t.updated_at
        FROM tasks t
        LEFT JOIN customers c ON c.id = t.customer_id
        LEFT JOIN users u ON u.id = t.assigned_to
        {where}
        ORDER BY t.created_at DESC
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return create_csv_response(rows, f"tasks_export_{timestamp}.csv")


@router.get("/risk-assessments")
async def export_risk_assessments(
    from_date: Optional[date] = Query(None, description="Start date"),
    to_date: Optional[date] = Query(None, description="End date"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Export risk assessments to CSV."""
    clauses = []
    params = []

    if from_date:
        clauses.append("ra.assessed_at >= %s")
        params.append(datetime.combine(from_date, datetime.min.time()))
    if to_date:
        clauses.append("ra.assessed_at <= %s")
        params.append(datetime.combine(to_date, datetime.max.time()))
    if risk_level:
        clauses.append("ra.risk_level = %s")
        params.append(risk_level)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            ra.id, ra.customer_id, c.full_name as customer_name,
            ra.base_score, ra.adjusted_score, ra.risk_level,
            ra.reason, ra.assessed_at
        FROM risk_assessments ra
        LEFT JOIN customers c ON c.id = ra.customer_id
        {where}
        ORDER BY ra.assessed_at DESC
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return create_csv_response(rows, f"risk_assessments_export_{timestamp}.csv")


# ==========================================
# Archive to MinIO endpoints
# ==========================================

@router.post("/archive/customers", response_model=ArchiveResponse)
async def archive_customers(
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    status: Optional[str] = Query(None, description="Filter by status"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Archive customers export to MinIO."""
    clauses = []
    params = []

    if risk_level:
        clauses.append("risk_level = %s")
        params.append(risk_level)
    if status:
        clauses.append("status = %s")
        params.append(status)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            id, member_id, first_name, last_name, full_name, email, phone_number,
            status, birth_date, identity_number, place_of_birth, country_of_birth,
            address_county, address_city, address_street, address_house_number,
            employer_name, document_type, document_id, document_issuer,
            document_date_of_expire, document_date_of_issue,
            risk_score, risk_level, risk_override, pep_flag, sanctions_hit,
            geography_risk, product_risk, behavior_risk,
            created_at
        FROM customers
        {where}
        ORDER BY created_at DESC
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"customers_archive_{timestamp}.csv"
    content = rows_to_csv_bytes(rows)

    return await upload_to_s3(content, filename, "customers")


@router.post("/archive/alerts", response_model=ArchiveResponse)
async def archive_alerts(
    from_date: Optional[date] = Query(None, description="Start date"),
    to_date: Optional[date] = Query(None, description="End date"),
    status: Optional[str] = Query(None, description="Filter by status"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Archive alerts export to MinIO."""
    clauses = []
    params = []

    if from_date:
        clauses.append("a.created_at >= %s")
        params.append(datetime.combine(from_date, datetime.min.time()))
    if to_date:
        clauses.append("a.created_at <= %s")
        params.append(datetime.combine(to_date, datetime.max.time()))
    if status:
        clauses.append("a.status = %s")
        params.append(status)
    if severity:
        clauses.append("a.severity = %s")
        params.append(severity)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            a.id, a.type, a.scenario, a.severity, a.status, a.priority,
            a.customer_id, c.full_name as customer_name,
            a.details, a.resolution_notes, a.resolution_type,
            a.assigned_to, u.full_name as assigned_to_name, a.assigned_at,
            a.escalated_to, a.escalation_reason, a.escalated_at,
            a.resolved_by, a.resolved_at, a.due_date,
            a.created_at
        FROM alerts a
        LEFT JOIN customers c ON c.id = a.customer_id
        LEFT JOIN users u ON u.id = a.assigned_to
        {where}
        ORDER BY a.created_at DESC
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"alerts_archive_{timestamp}.csv"
    content = rows_to_csv_bytes(rows)

    return await upload_to_s3(content, filename, "alerts")


@router.post("/archive/transactions", response_model=ArchiveResponse)
async def archive_transactions(
    from_date: Optional[date] = Query(None, description="Start date"),
    to_date: Optional[date] = Query(None, description="End date"),
    customer_id: Optional[str] = Query(None, description="Filter by customer ID"),
    financial_status: Optional[str] = Query(None, description="Filter by financial status"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Archive transactions export to MinIO."""
    clauses = []
    params = []

    if from_date:
        clauses.append("t.created_at >= %s")
        params.append(datetime.combine(from_date, datetime.min.time()))
    if to_date:
        clauses.append("t.created_at <= %s")
        params.append(datetime.combine(to_date, datetime.max.time()))
    if customer_id:
        clauses.append("t.customer_id = %s")
        params.append(customer_id)
    if financial_status:
        clauses.append("t.transaction_financial_status = %s")
        params.append(financial_status)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            t.id, t.surrogate_id, t.customer_id, c.full_name as customer_name,
            t.person_first_name, t.person_last_name, t.vendor_name,
            t.amount, t.original_transaction_amount,
            t.price_number_of_months, t.grace_number_of_months,
            t.vendor_transaction_id,
            t.client_settlement_status, t.vendor_settlement_status,
            t.transaction_delivery_status, t.partial_delivery,
            t.transaction_last_activity, t.transaction_financial_status,
            t.created_at
        FROM transactions t
        LEFT JOIN customers c ON c.id = t.customer_id
        {where}
        ORDER BY t.created_at DESC
        LIMIT 100000
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"transactions_archive_{timestamp}.csv"
    content = rows_to_csv_bytes(rows)

    return await upload_to_s3(content, filename, "transactions")


@router.post("/archive/tasks", response_model=ArchiveResponse)
async def archive_tasks(
    from_date: Optional[date] = Query(None, description="Start date"),
    to_date: Optional[date] = Query(None, description="End date"),
    status: Optional[str] = Query(None, description="Filter by status"),
    task_type: Optional[str] = Query(None, description="Filter by task type"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Archive tasks export to MinIO."""
    clauses = []
    params = []

    if from_date:
        clauses.append("t.created_at >= %s")
        params.append(datetime.combine(from_date, datetime.min.time()))
    if to_date:
        clauses.append("t.created_at <= %s")
        params.append(datetime.combine(to_date, datetime.max.time()))
    if status:
        clauses.append("t.status = %s")
        params.append(status)
    if task_type:
        clauses.append("t.task_type = %s")
        params.append(task_type)
    if priority:
        clauses.append("t.priority = %s")
        params.append(priority)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            t.id, t.title, t.description, t.task_type, t.priority, t.status,
            t.customer_id, c.full_name as customer_name,
            t.alert_id,
            t.assigned_to, u.full_name as assigned_to_name,
            t.due_date, t.completed_at,
            t.workflow_id, t.workflow_status,
            t.created_by, t.created_at, t.updated_at
        FROM tasks t
        LEFT JOIN customers c ON c.id = t.customer_id
        LEFT JOIN users u ON u.id = t.assigned_to
        {where}
        ORDER BY t.created_at DESC
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"tasks_archive_{timestamp}.csv"
    content = rows_to_csv_bytes(rows)

    return await upload_to_s3(content, filename, "tasks")


@router.post("/archive/risk-assessments", response_model=ArchiveResponse)
async def archive_risk_assessments(
    from_date: Optional[date] = Query(None, description="Start date"),
    to_date: Optional[date] = Query(None, description="End date"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    conn: AsyncConnection = Depends(connection),
    current_user: dict = Depends(get_current_user),
):
    """Archive risk assessments export to MinIO."""
    clauses = []
    params = []

    if from_date:
        clauses.append("ra.assessed_at >= %s")
        params.append(datetime.combine(from_date, datetime.min.time()))
    if to_date:
        clauses.append("ra.assessed_at <= %s")
        params.append(datetime.combine(to_date, datetime.max.time()))
    if risk_level:
        clauses.append("ra.risk_level = %s")
        params.append(risk_level)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT
            ra.id, ra.customer_id, c.full_name as customer_name,
            ra.base_score, ra.adjusted_score, ra.risk_level,
            ra.reason, ra.assessed_at
        FROM risk_assessments ra
        LEFT JOIN customers c ON c.id = ra.customer_id
        {where}
        ORDER BY ra.assessed_at DESC
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"risk_assessments_archive_{timestamp}.csv"
    content = rows_to_csv_bytes(rows)

    return await upload_to_s3(content, filename, "risk-assessments")
