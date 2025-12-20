"""
Alert Lifecycle API Router

All status changes go through Temporal workflows for full audit/orchestration.
"""
import logging
from io import BytesIO
from typing import Any, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from temporalio.client import Client

from src.api.config import settings
from src.api.db import get_pool
from src.api.models import (
    ALERT_STATUSES,
    RESOLUTION_TYPES,
    AlertAssign,
    AlertEscalate,
    AlertHold,
    AlertNoteCreate,
    AlertReopen,
    AlertResolve,
    AlertStart,
    AlertUnassign,
    AlertResume,
)
from src.api.s3 import delete_file, download_file, upload_file
from src.workflows.worker import AlertLifecycleWorkflow, INTERNAL_TASK_QUEUE, INTERNAL_NAMESPACE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["alerts"])

# Temporal client singleton
_temporal_client: Optional[Client] = None


# =============================================================================
# LEGACY FUNCTION (kept for backward compatibility)
# =============================================================================

async def create_alert(
    conn: AsyncConnection,
    customer_id: Optional[UUID],
    alert_type: str,
    severity: str,
    scenario: str,
    details: dict[str, Any],
) -> int:
    query = """
        INSERT INTO alerts (customer_id, type, severity, scenario, details)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
    """
    async with conn.cursor() as cur:
        await cur.execute(query, (customer_id, alert_type, severity, scenario, details))
        row = await cur.fetchone()
        return int(row[0])


# =============================================================================
# TEMPORAL CLIENT
# =============================================================================

async def get_temporal_client() -> Client:
    """Get or create Temporal client singleton for internal namespace"""
    global _temporal_client
    if _temporal_client is None:
        _temporal_client = await Client.connect(
            f"{settings.temporal_host}:{settings.temporal_port}",
            namespace=INTERNAL_NAMESPACE,
        )
    return _temporal_client


async def _execute_alert_action(
    alert_id: int,
    action: str,
    user_id: str,
    user_role: str,
    params: dict
) -> dict:
    """Execute an alert lifecycle action through Temporal"""
    client = await get_temporal_client()

    workflow_id = f"alert-{alert_id}-{action}-{uuid4().hex[:8]}"

    result = await client.execute_workflow(
        AlertLifecycleWorkflow.run,
        args=[alert_id, action, user_id, user_role, params],
        id=workflow_id,
        task_queue=INTERNAL_TASK_QUEUE,
    )

    if not result.get("success", False):
        raise HTTPException(status_code=400, detail=result.get("error", "Action failed"))

    return result


# =============================================================================
# LIST & GET ALERTS
# =============================================================================

@router.get("")
async def list_alerts(
    status: Optional[str] = Query(None, description="Filter by status"),
    assigned_to: Optional[str] = Query(None, description="Filter by assigned user UUID, 'unassigned', or 'me'"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    customer_id: Optional[UUID] = Query(None, description="Filter by customer"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    current_user_id: Optional[UUID] = Query(None, description="Current user ID for 'me' filter"),
):
    """List alerts with filters"""
    pool = get_pool()

    conditions = []
    params = []

    if status:
        if status not in ALERT_STATUSES:
            raise HTTPException(400, f"Invalid status. Must be one of: {ALERT_STATUSES}")
        conditions.append("a.status = %s")
        params.append(status)

    if assigned_to:
        if assigned_to == "unassigned":
            conditions.append("a.assigned_to IS NULL")
        elif assigned_to == "me":
            if not current_user_id:
                raise HTTPException(400, "current_user_id required for 'me' filter")
            conditions.append("a.assigned_to = %s")
            params.append(str(current_user_id))
        else:
            conditions.append("a.assigned_to = %s")
            params.append(assigned_to)

    if severity:
        conditions.append("a.severity = %s")
        params.append(severity)

    if customer_id:
        conditions.append("a.customer_id = %s")
        params.append(str(customer_id))

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            f"""
            SELECT a.*,
                   c.full_name as customer_name,
                   u_assigned.full_name as assigned_to_name,
                   u_assigned.email as assigned_to_email,
                   u_escalated.full_name as escalated_to_name
            FROM alerts a
            LEFT JOIN customers c ON a.customer_id = c.id
            LEFT JOIN users u_assigned ON a.assigned_to = u_assigned.id
            LEFT JOIN users u_escalated ON a.escalated_to = u_escalated.id
            WHERE {where_clause}
            ORDER BY a.created_at DESC
            LIMIT %s OFFSET %s
            """,
            (*params, limit, offset),
        )
        rows = await cur.fetchall()

        # Get total count
        await cur.execute(
            f"SELECT COUNT(*) as total FROM alerts a WHERE {where_clause}",
            params,
        )
        count_row = await cur.fetchone()
        total = count_row["total"] if count_row else 0

    return {"alerts": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/{alert_id}")
async def get_alert(alert_id: int):
    """Get a single alert with full details"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT a.*,
                   c.full_name as customer_name,
                   u_assigned.full_name as assigned_to_name,
                   u_assigned.email as assigned_to_email,
                   u_escalated.full_name as escalated_to_name
            FROM alerts a
            LEFT JOIN customers c ON a.customer_id = c.id
            LEFT JOIN users u_assigned ON a.assigned_to = u_assigned.id
            LEFT JOIN users u_escalated ON a.escalated_to = u_escalated.id
            WHERE a.id = %s
            """,
            (alert_id,),
        )
        row = await cur.fetchone()

        if not row:
            raise HTTPException(404, "Alert not found")

        return row


# =============================================================================
# LIFECYCLE ACTIONS (via Temporal)
# =============================================================================

def _get_user_context(body, query_user_id: Optional[UUID], query_role: str) -> tuple[str, str]:
    """Get user ID and role from body or fall back to query params"""
    user_id = str(body.current_user_id) if body.current_user_id else (str(query_user_id) if query_user_id else None)
    if not user_id:
        raise HTTPException(400, "current_user_id is required (in body or query params)")
    role = body.current_user_role if body.current_user_role != "analyst" else query_role
    return user_id, role


@router.post("/{alert_id}/assign")
async def assign_alert(
    alert_id: int,
    body: AlertAssign,
    current_user_id: Optional[UUID] = Query(None, description="Current user ID (deprecated, use body)"),
    current_user_role: str = Query("analyst", description="Current user role (deprecated, use body)"),
):
    """Assign an alert to a user (self or by manager)"""
    user_id, role = _get_user_context(body, current_user_id, current_user_role)
    params = {
        "assigned_to": str(body.assigned_to),
        "assigned_by": str(body.assigned_by) if body.assigned_by else None,
    }
    return await _execute_alert_action(alert_id, "assign", user_id, role, params)


@router.post("/{alert_id}/unassign")
async def unassign_alert(
    alert_id: int,
    body: AlertUnassign = AlertUnassign(),
    current_user_id: Optional[UUID] = Query(None, description="Current user ID (deprecated, use body)"),
    current_user_role: str = Query("analyst", description="Current user role (deprecated, use body)"),
):
    """Unassign an alert (back to open)"""
    user_id, role = _get_user_context(body, current_user_id, current_user_role)
    return await _execute_alert_action(alert_id, "unassign", user_id, role, {})


@router.post("/{alert_id}/start")
async def start_alert_work(
    alert_id: int,
    body: AlertStart = AlertStart(),
    current_user_id: Optional[UUID] = Query(None, description="Current user ID (deprecated, use body)"),
    current_user_role: str = Query("analyst", description="Current user role (deprecated, use body)"),
):
    """Start work on an assigned alert (assigned -> in_progress)"""
    user_id, role = _get_user_context(body, current_user_id, current_user_role)
    return await _execute_alert_action(alert_id, "start", user_id, role, {})


@router.post("/{alert_id}/escalate")
async def escalate_alert(
    alert_id: int,
    body: AlertEscalate,
    current_user_id: Optional[UUID] = Query(None, description="Current user ID (deprecated, use body)"),
    current_user_role: str = Query("analyst", description="Current user role (deprecated, use body)"),
):
    """Escalate an alert to a senior/manager"""
    user_id, role = _get_user_context(body, current_user_id, current_user_role)
    params = {
        "escalated_to": str(body.escalated_to),
        "reason": body.reason,
    }
    return await _execute_alert_action(alert_id, "escalate", user_id, role, params)


@router.post("/{alert_id}/hold")
async def hold_alert(
    alert_id: int,
    body: AlertHold = AlertHold(),
    current_user_id: Optional[UUID] = Query(None, description="Current user ID (deprecated, use body)"),
    current_user_role: str = Query("analyst", description="Current user role (deprecated, use body)"),
):
    """Put an alert on hold"""
    user_id, role = _get_user_context(body, current_user_id, current_user_role)
    params = {"reason": body.reason}
    return await _execute_alert_action(alert_id, "hold", user_id, role, params)


@router.post("/{alert_id}/resume")
async def resume_alert(
    alert_id: int,
    body: AlertResume = AlertResume(),
    current_user_id: Optional[UUID] = Query(None, description="Current user ID (deprecated, use body)"),
    current_user_role: str = Query("analyst", description="Current user role (deprecated, use body)"),
):
    """Resume work on an alert (on_hold/escalated -> in_progress)"""
    user_id, role = _get_user_context(body, current_user_id, current_user_role)
    return await _execute_alert_action(alert_id, "resume", user_id, role, {})


@router.post("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    body: AlertResolve,
    current_user_id: Optional[UUID] = Query(None, description="Current user ID (deprecated, use body)"),
    current_user_role: str = Query("analyst", description="Current user role (deprecated, use body)"),
):
    """Resolve an alert with a resolution type"""
    user_id, role = _get_user_context(body, current_user_id, current_user_role)
    if body.resolution_type not in RESOLUTION_TYPES:
        raise HTTPException(400, f"Invalid resolution_type. Must be one of: {RESOLUTION_TYPES}")

    params = {
        "resolution_type": body.resolution_type,
        "resolution_notes": body.resolution_notes,
    }
    return await _execute_alert_action(alert_id, "resolve", user_id, role, params)


@router.post("/{alert_id}/reopen")
async def reopen_alert(
    alert_id: int,
    body: AlertReopen = AlertReopen(),
    current_user_id: Optional[UUID] = Query(None, description="Current user ID (deprecated, use body)"),
    current_user_role: str = Query("manager", description="Current user role (deprecated, use body)"),
):
    """Reopen a resolved alert (manager only)"""
    user_id, role = _get_user_context(body, current_user_id, current_user_role)
    if role not in ("manager", "admin"):
        raise HTTPException(403, "Only managers can reopen alerts")

    params = {"reason": body.reason}
    return await _execute_alert_action(alert_id, "reopen", user_id, role, params)


# =============================================================================
# UPDATE ALERT METADATA
# =============================================================================

@router.patch("/{alert_id}")
async def update_alert(
    alert_id: int,
    priority: Optional[str] = None,
    due_date: Optional[str] = None,
    current_user_id: UUID = Query(..., description="Current user ID"),
):
    """Update alert metadata (priority, due_date)"""
    updates = []
    params = []

    if priority is not None:
        if priority not in ("low", "medium", "high", "critical"):
            raise HTTPException(400, "Invalid priority. Must be low, medium, high, or critical")
        updates.append("priority = %s")
        params.append(priority)

    if due_date is not None:
        if due_date == "":
            updates.append("due_date = NULL")
        else:
            updates.append("due_date = %s")
            params.append(due_date)

    if not updates:
        raise HTTPException(400, "No fields to update")

    params.append(alert_id)

    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            f"UPDATE alerts SET {', '.join(updates)} WHERE id = %s RETURNING *",
            params,
        )
        row = await cur.fetchone()

        if not row:
            raise HTTPException(404, "Alert not found")

    return {"success": True, "alert": row}


# =============================================================================
# NOTES
# =============================================================================

@router.get("/{alert_id}/notes")
async def list_alert_notes(alert_id: int):
    """List notes for an alert"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT n.*, u.full_name as user_name
            FROM alert_notes n
            LEFT JOIN users u ON n.user_id = u.id
            WHERE n.alert_id = %s
            ORDER BY n.created_at DESC
            """,
            (alert_id,),
        )
        rows = await cur.fetchall()
    return {"notes": rows}


@router.post("/{alert_id}/notes")
async def add_alert_note(
    alert_id: int,
    body: AlertNoteCreate,
    current_user_id: Optional[UUID] = Query(None, description="Current user ID (deprecated, use body)"),
    current_user_role: str = Query("analyst", description="Current user role (deprecated, use body)"),
):
    """Add a note to an alert (via Temporal for audit)"""
    user_id, role = _get_user_context(body, current_user_id, current_user_role)
    params = {
        "content": body.content,
        "note_type": body.note_type,
    }
    return await _execute_alert_action(alert_id, "add_note", user_id, role, params)


@router.delete("/{alert_id}/notes/{note_id}")
async def delete_alert_note(alert_id: int, note_id: int):
    """Delete a note (direct DB - not audited)"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "DELETE FROM alert_notes WHERE id = %s AND alert_id = %s",
            (note_id, alert_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Note not found")
    return {"success": True, "deleted_note_id": note_id}


# =============================================================================
# ATTACHMENTS
# =============================================================================

@router.get("/{alert_id}/attachments")
async def list_alert_attachments(alert_id: int):
    """List attachments for an alert"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT att.*, u.full_name as user_name
            FROM alert_attachments att
            LEFT JOIN users u ON att.user_id = u.id
            WHERE att.alert_id = %s
            ORDER BY att.created_at DESC
            """,
            (alert_id,),
        )
        rows = await cur.fetchall()
    return {"attachments": rows}


@router.post("/{alert_id}/attachments")
async def upload_alert_attachment(
    alert_id: int,
    file: UploadFile = File(...),
    current_user_id: UUID = Query(..., description="Current user ID"),
):
    """Upload an attachment to an alert"""
    # Validate file size (10MB max)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large. Maximum size is 10MB.")

    # Generate unique filename
    file_ext = file.filename.split(".")[-1] if "." in file.filename else ""
    unique_filename = f"{uuid4().hex}.{file_ext}" if file_ext else uuid4().hex
    s3_key = f"alerts/{alert_id}/{unique_filename}"

    # Upload to S3
    upload_file(
        content=content,
        key=s3_key,
        content_type=file.content_type or "application/octet-stream",
        metadata={"original_filename": file.filename, "alert_id": str(alert_id)},
    )

    # Save to database
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            INSERT INTO alert_attachments (alert_id, user_id, filename, original_filename, file_path, file_size, content_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (alert_id, str(current_user_id), unique_filename, file.filename, s3_key, len(content), file.content_type),
        )
        result = await cur.fetchone()

    return {
        "success": True,
        "attachment_id": result["id"],
        "filename": file.filename,
        "file_size": len(content),
        "created_at": result["created_at"].isoformat(),
    }


@router.get("/{alert_id}/attachments/{attachment_id}/download")
async def download_alert_attachment(alert_id: int, attachment_id: int):
    """Download an attachment"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM alert_attachments WHERE id = %s AND alert_id = %s",
            (attachment_id, alert_id),
        )
        row = await cur.fetchone()

        if not row:
            raise HTTPException(404, "Attachment not found")

    # Download from S3
    content, content_type, _ = download_file(row["file_path"])

    return StreamingResponse(
        BytesIO(content),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{row["original_filename"]}"'},
    )


@router.delete("/{alert_id}/attachments/{attachment_id}")
async def delete_alert_attachment(alert_id: int, attachment_id: int):
    """Delete an attachment"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT file_path FROM alert_attachments WHERE id = %s AND alert_id = %s",
            (attachment_id, alert_id),
        )
        row = await cur.fetchone()

        if not row:
            raise HTTPException(404, "Attachment not found")

        # Delete from S3
        delete_file(row["file_path"])

        # Delete from database
        await cur.execute(
            "DELETE FROM alert_attachments WHERE id = %s",
            (attachment_id,),
        )

    return {"success": True, "deleted_attachment_id": attachment_id}


# =============================================================================
# HISTORY
# =============================================================================

@router.get("/{alert_id}/history")
async def get_alert_history(alert_id: int):
    """Get status change history for an alert"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT h.*, u.full_name as changed_by_name
            FROM alert_status_history h
            LEFT JOIN users u ON h.changed_by = u.id
            WHERE h.alert_id = %s
            ORDER BY h.created_at DESC
            """,
            (alert_id,),
        )
        rows = await cur.fetchall()
    return {"history": rows}
