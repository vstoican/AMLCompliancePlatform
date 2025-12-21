import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Any, Optional

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker

from src.api.config import settings
from src.api.db import get_pool

logger = logging.getLogger(__name__)

# System user UUID for automated operations (created in V19 migration)
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"


# =============================================================================
# USER VALIDATION HELPERS
# =============================================================================

async def _validate_user_exists(conn, user_id: str) -> bool:
    """Check if a user exists in the database"""
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        return await cur.fetchone() is not None


async def _get_valid_user_id(conn, user_id: str) -> str:
    """Get a valid user ID, falling back to system user if not found"""
    if await _validate_user_exists(conn, user_id):
        return user_id
    logger.warning(f"User {user_id} not found, falling back to system user")
    return SYSTEM_USER_ID


# =============================================================================
# EXISTING ACTIVITIES
# =============================================================================

@activity.defn
async def create_alert_activity(customer_id: str, scenario: str, severity: str, details: dict[str, Any]) -> None:
    """Create an alert in the database"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO alerts (customer_id, type, severity, scenario, details)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (customer_id, "workflow", severity, scenario, Jsonb(details)),
        )


@activity.defn
async def schedule_kyc_task_activity(customer_id: str, days_before: int = 365) -> dict[str, Any]:
    """
    Schedule KYC task based on document expiry.

    If customer_id is empty, runs in batch mode - finds all customers
    with documents expiring within days_before and creates KYC tasks.
    """
    pool = get_pool()
    tasks_created = 0
    customers_checked = 0

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        if customer_id:
            # Single customer mode
            await cur.execute(
                "SELECT id, document_date_of_expire FROM customers WHERE id = %s",
                (customer_id,)
            )
            rows = await cur.fetchall()
        else:
            # Batch mode - find all customers with expiring documents
            expiry_threshold = date.today() + timedelta(days=days_before)
            await cur.execute(
                """
                SELECT id, document_date_of_expire
                FROM customers
                WHERE document_date_of_expire IS NOT NULL
                  AND document_date_of_expire <= %s
                  AND status = 'active'
                  AND id NOT IN (
                      SELECT customer_id FROM kyc_tasks
                      WHERE status IN ('pending', 'in_progress')
                  )
                LIMIT 100
                """,
                (expiry_threshold,)
            )
            rows = await cur.fetchall()

        for row in rows:
            customers_checked += 1
            if not row.get("document_date_of_expire"):
                continue

            due = row["document_date_of_expire"]
            if isinstance(due, date):
                due_date = due
            else:
                due_date = due.date()

            # For batch mode, we already filtered by date; for single mode, check here
            if customer_id and due_date > date.today() + timedelta(days=days_before):
                continue

            await cur.execute(
                """
                INSERT INTO kyc_tasks (customer_id, due_date, reason)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (row["id"], due_date, "Workflow scheduled KYC update"),
            )
            tasks_created += 1

    logger.info(f"KYC refresh: checked {customers_checked} customers, created {tasks_created} tasks")
    return {"customers_checked": customers_checked, "tasks_created": tasks_created}


# =============================================================================
# TASK MANAGEMENT ACTIVITIES
# =============================================================================

@activity.defn
async def create_workflow_task_activity(
    workflow_definition_id: int,
    customer_id: Optional[str] = None,
    alert_id: Optional[int] = None,
    workflow_id: Optional[str] = None,
    workflow_run_id: Optional[str] = None,
    additional_details: Optional[dict] = None,
) -> dict[str, Any]:
    """
    Create a task based on workflow definition settings.
    Checks the workflow definition's create_task flag and creates task accordingly.
    """
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Get workflow definition
        await cur.execute(
            """
            SELECT id, code, name, workflow_type, create_task, task_type, task_priority
            FROM workflow_definitions WHERE id = %s
            """,
            (workflow_definition_id,),
        )
        definition = await cur.fetchone()

        if not definition:
            logger.warning(f"Workflow definition {workflow_definition_id} not found")
            return {"created": False, "reason": "definition_not_found"}

        if not definition["create_task"]:
            logger.info(f"Workflow {definition['code']} has create_task=False, skipping task creation")
            return {"created": False, "reason": "create_task_disabled"}

        # Determine task type and title
        task_type = definition["task_type"] or definition["workflow_type"]
        priority = definition["task_priority"] or "medium"
        title = f"{definition['name']}: Requires Review"
        description = f"Task created by workflow {definition['code']}"

        if additional_details:
            if additional_details.get("title"):
                title = additional_details["title"]
            if additional_details.get("description"):
                description = additional_details["description"]

        # Create the task
        await cur.execute(
            """
            INSERT INTO tasks (
                customer_id, alert_id, task_type, priority, status,
                workflow_id, workflow_run_id, workflow_status,
                title, description, details
            ) VALUES (
                %s, %s, %s, %s, 'pending',
                %s, %s, 'RUNNING',
                %s, %s, %s
            )
            RETURNING id
            """,
            (
                customer_id, alert_id, task_type, priority,
                workflow_id, workflow_run_id,
                title, description, Jsonb(additional_details or {}),
            ),
        )
        result = await cur.fetchone()
        await conn.commit()

        task_id = result["id"]
        logger.info(f"Created task {task_id} for workflow {definition['code']}")
        return {"created": True, "task_id": task_id}


@activity.defn
async def update_task_status_activity(
    task_id: int,
    status: str,
    notes: Optional[str] = None,
    workflow_status: Optional[str] = None
) -> None:
    """Update task status in database"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor() as cur:
        if status == "completed":
            await cur.execute(
                """
                UPDATE tasks
                SET status = %s,
                    workflow_status = COALESCE(%s, workflow_status),
                    completed_at = NOW(),
                    resolution_notes = COALESCE(%s, resolution_notes)
                WHERE id = %s
                """,
                (status, workflow_status or "COMPLETED", notes, task_id),
            )
        else:
            await cur.execute(
                """
                UPDATE tasks
                SET status = %s,
                    workflow_status = COALESCE(%s, workflow_status),
                    resolution_notes = COALESCE(%s, resolution_notes)
                WHERE id = %s
                """,
                (status, workflow_status, notes, task_id),
            )
    logger.info(f"Updated task {task_id} to status {status}")


@activity.defn
async def fetch_customer_data_activity(customer_id: str) -> dict[str, Any]:
    """Fetch comprehensive customer data for investigation"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Get customer details
        await cur.execute(
            """
            SELECT c.*,
                   (SELECT COUNT(*) FROM transactions WHERE customer_id = c.id) as transaction_count,
                   (SELECT COUNT(*) FROM alerts WHERE customer_id = c.id) as alert_count,
                   (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE customer_id = c.id) as total_volume,
                   (SELECT COUNT(*) FROM alerts WHERE customer_id = c.id AND status = 'open') as open_alerts
            FROM customers c
            WHERE c.id = %s
            """,
            (customer_id,),
        )
        row = await cur.fetchone()
        if not row:
            return {"error": "Customer not found"}

        # Convert to serializable dict
        result = dict(row)
        result["id"] = str(result["id"])
        for key, value in result.items():
            if isinstance(value, (date, datetime)):
                result[key] = value.isoformat()
            elif hasattr(value, "__float__"):
                result[key] = float(value)
        return result


@activity.defn
async def create_escalation_alert_activity(
    customer_id: str,
    task_id: int,
    reason: str,
    severity: str = "high"
) -> int:
    """Create an escalation alert linked to a task"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            INSERT INTO alerts (customer_id, type, severity, scenario, details)
            VALUES (%s, 'escalation', %s, 'task_escalation', %s)
            RETURNING id
            """,
            (
                customer_id,
                severity,
                Jsonb({
                    "task_id": task_id,
                    "escalation_reason": reason,
                    "source": "workflow",
                    "created_at": datetime.utcnow().isoformat()
                }),
            ),
        )
        row = await cur.fetchone()
        alert_id = row["id"]
        logger.info(f"Created escalation alert {alert_id} for task {task_id}")
        return alert_id


@activity.defn
async def request_document_activity(
    customer_id: str,
    document_type: str,
    task_id: int
) -> dict[str, Any]:
    """
    Request a document from customer.
    In production, this would integrate with document management/email system.
    """
    # This is a placeholder - in real implementation would:
    # 1. Send email/notification to customer
    # 2. Create document request record
    # 3. Set up reminder workflow
    logger.info(f"Document request: {document_type} for customer {customer_id}, task {task_id}")
    return {
        "status": "requested",
        "document_type": document_type,
        "customer_id": customer_id,
        "task_id": task_id,
        "requested_at": datetime.utcnow().isoformat(),
        "message": f"Document request initiated for {document_type}"
    }


@activity.defn
async def perform_sar_checks_activity(customer_id: str, task_id: int) -> dict[str, Any]:
    """Gather data needed for SAR filing"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Get customer data
        await cur.execute("SELECT * FROM customers WHERE id = %s", (customer_id,))
        customer = await cur.fetchone()

        # Get recent alerts
        await cur.execute(
            """
            SELECT id, type, severity, scenario, created_at
            FROM alerts
            WHERE customer_id = %s
            ORDER BY created_at DESC
            LIMIT 50
            """,
            (customer_id,),
        )
        alerts = await cur.fetchall()

        # Get recent transactions
        await cur.execute(
            """
            SELECT id, amount, created_at, transaction_financial_status
            FROM transactions
            WHERE customer_id = %s
            ORDER BY created_at DESC
            LIMIT 100
            """,
            (customer_id,),
        )
        transactions = await cur.fetchall()

        return {
            "customer_id": customer_id,
            "customer_name": customer.get("full_name") if customer else None,
            "risk_level": customer.get("risk_level") if customer else None,
            "risk_score": float(customer.get("risk_score", 0)) if customer else 0,
            "alerts_count": len(alerts),
            "transactions_count": len(transactions),
            "pep_flag": customer.get("pep_flag", False) if customer else False,
            "sanctions_hit": customer.get("sanctions_hit", False) if customer else False,
            "ready_for_filing": True,
            "gathered_at": datetime.utcnow().isoformat()
        }


@activity.defn
async def update_alert_status_activity(
    alert_id: int,
    status: str,
    notes: Optional[str] = None,
    resolved_by: Optional[str] = None
) -> None:
    """Update alert status/resolution fields in the database (legacy)"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            UPDATE alerts
            SET status = %s,
                resolution_notes = COALESCE(%s, resolution_notes),
                resolved_by = COALESCE(%s, resolved_by),
                resolved_at = CASE WHEN %s = 'resolved' THEN NOW() ELSE resolved_at END
            WHERE id = %s
            """,
            (status, notes, resolved_by, status, alert_id),
        )
    logger.info(f"Updated alert {alert_id} to status {status}")


# =============================================================================
# ALERT LIFECYCLE ACTIVITIES
# =============================================================================

# Valid status transitions
ALERT_STATUS_TRANSITIONS = {
    'open': ['assigned'],
    'assigned': ['in_progress', 'open'],
    'in_progress': ['escalated', 'on_hold', 'resolved'],
    'escalated': ['in_progress', 'resolved'],
    'on_hold': ['in_progress', 'resolved'],
    'resolved': ['open'],  # Reopen - manager only
}

ALERT_STATUSES = ['open', 'assigned', 'in_progress', 'escalated', 'on_hold', 'resolved']
RESOLUTION_TYPES = ['confirmed_suspicious', 'false_positive', 'not_suspicious', 'duplicate', 'other']


def _validate_transition(current_status: str, new_status: str) -> bool:
    """Check if status transition is valid"""
    allowed = ALERT_STATUS_TRANSITIONS.get(current_status, [])
    return new_status in allowed


async def _get_alert_current_status(conn, alert_id: int) -> Optional[str]:
    """Get current status of an alert"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT status FROM alerts WHERE id = %s", (alert_id,))
        row = await cur.fetchone()
        return row["status"] if row else None


async def _log_status_change(
    conn,
    alert_id: int,
    previous_status: str,
    new_status: str,
    changed_by: str,
    reason: Optional[str] = None,
    metadata: Optional[dict] = None
) -> None:
    """Log a status change to the history table"""
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO alert_status_history (alert_id, previous_status, new_status, changed_by, reason, metadata)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (alert_id, previous_status, new_status, changed_by, reason, Jsonb(metadata or {})),
        )


@activity.defn
async def init_alert_activity(
    alert_id: int,
    customer_id: str,
    scenario: str,
    severity: str,
    alert_type: str
) -> dict[str, Any]:
    """
    Initialize alert workflow - called when a new alert is created via pg_notify.
    This logs the workflow initialization and can be extended to perform
    initial enrichment or routing logic.
    """
    pool = get_pool()
    async with pool.connection() as conn:
        # Log the initialization to status history
        await _log_status_change(
            conn,
            alert_id,
            "new",  # Initial pseudo-status
            "open",
            SYSTEM_USER_ID,
            "Alert created and workflow initialized",
            {
                "scenario": scenario,
                "severity": severity,
                "type": alert_type,
                "customer_id": customer_id,
                "init_source": "pg_notify",
            }
        )

    logger.info(f"Initialized workflow for alert {alert_id}: {scenario} ({severity})")
    return {
        "success": True,
        "alert_id": alert_id,
        "status": "open",
        "message": "Alert workflow initialized"
    }


@activity.defn
async def assign_alert_activity(
    alert_id: int,
    assigned_to: str,
    assigned_by: Optional[str] = None
) -> dict[str, Any]:
    """Assign an alert to a user (self or by manager) with user validation"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'open':
            return {"success": False, "error": f"Cannot assign alert in status '{current_status}'"}

        # Validate assignee exists
        if not await _validate_user_exists(conn, assigned_to):
            return {"success": False, "error": f"User {assigned_to} not found"}

        # Validate assigner exists (use system user if not)
        valid_assigned_by = await _get_valid_user_id(conn, assigned_by or assigned_to)

        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                UPDATE alerts
                SET status = 'assigned',
                    assigned_to = %s,
                    assigned_by = %s,
                    assigned_at = NOW()
                WHERE id = %s
                RETURNING id, status, assigned_to, assigned_at
                """,
                (assigned_to, valid_assigned_by, alert_id),
            )
            result = await cur.fetchone()

        await _log_status_change(
            conn, alert_id, current_status, 'assigned',
            valid_assigned_by, None,
            {"assigned_to": assigned_to, "self_assigned": assigned_by is None or assigned_by == assigned_to}
        )

        logger.info(f"Alert {alert_id} assigned to {assigned_to}")
        return {"success": True, "alert_id": alert_id, "status": "assigned", "assigned_to": assigned_to}


@activity.defn
async def unassign_alert_activity(alert_id: int, user_id: str) -> dict[str, Any]:
    """Unassign an alert (back to open) with user validation"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'assigned':
            return {"success": False, "error": f"Cannot unassign alert in status '{current_status}'"}

        # Validate user exists (use system user if not)
        valid_user_id = await _get_valid_user_id(conn, user_id)

        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE alerts
                SET status = 'open',
                    assigned_to = NULL,
                    assigned_by = NULL,
                    assigned_at = NULL
                WHERE id = %s
                """,
                (alert_id,),
            )

        await _log_status_change(conn, alert_id, current_status, 'open', valid_user_id, "Unassigned")

        logger.info(f"Alert {alert_id} unassigned by {user_id}")
        return {"success": True, "alert_id": alert_id, "status": "open"}


@activity.defn
async def start_alert_work_activity(alert_id: int, user_id: str) -> dict[str, Any]:
    """Start work on an assigned alert (assigned -> in_progress) with user validation"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'assigned':
            return {"success": False, "error": f"Cannot start work on alert in status '{current_status}'"}

        # Validate user exists (use system user if not)
        valid_user_id = await _get_valid_user_id(conn, user_id)

        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE alerts SET status = 'in_progress' WHERE id = %s",
                (alert_id,),
            )

        await _log_status_change(conn, alert_id, current_status, 'in_progress', valid_user_id, "Started work")

        logger.info(f"Alert {alert_id} work started by {valid_user_id}")
        return {"success": True, "alert_id": alert_id, "status": "in_progress"}


@activity.defn
async def escalate_alert_lifecycle_activity(
    alert_id: int,
    escalated_by: str,
    escalated_to: str,
    reason: str
) -> dict[str, Any]:
    """Escalate an alert to a senior/manager with user validation"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'in_progress':
            return {"success": False, "error": f"Cannot escalate alert in status '{current_status}'"}

        # Validate escalated_to user exists
        if not await _validate_user_exists(conn, escalated_to):
            return {"success": False, "error": f"Escalation target user {escalated_to} not found"}

        # Validate escalated_by user exists (use system user if not)
        valid_escalated_by = await _get_valid_user_id(conn, escalated_by)

        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE alerts
                SET status = 'escalated',
                    escalated_to = %s,
                    escalated_by = %s,
                    escalated_at = NOW(),
                    escalation_reason = %s
                WHERE id = %s
                """,
                (escalated_to, valid_escalated_by, reason, alert_id),
            )

        await _log_status_change(
            conn, alert_id, current_status, 'escalated', valid_escalated_by, reason,
            {"escalated_to": escalated_to}
        )

        logger.info(f"Alert {alert_id} escalated to {escalated_to} by {valid_escalated_by}")
        return {"success": True, "alert_id": alert_id, "status": "escalated", "escalated_to": escalated_to}


@activity.defn
async def hold_alert_activity(alert_id: int, user_id: str, reason: Optional[str] = None) -> dict[str, Any]:
    """Put an alert on hold with user validation"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'in_progress':
            return {"success": False, "error": f"Cannot put alert on hold from status '{current_status}'"}

        # Validate user exists (use system user if not)
        valid_user_id = await _get_valid_user_id(conn, user_id)

        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE alerts SET status = 'on_hold' WHERE id = %s",
                (alert_id,),
            )

        await _log_status_change(conn, alert_id, current_status, 'on_hold', valid_user_id, reason or "Put on hold")

        logger.info(f"Alert {alert_id} put on hold by {valid_user_id}")
        return {"success": True, "alert_id": alert_id, "status": "on_hold"}


@activity.defn
async def resume_alert_activity(alert_id: int, user_id: str) -> dict[str, Any]:
    """Resume work on an alert (on_hold/escalated -> in_progress) with user validation"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status not in ('on_hold', 'escalated'):
            return {"success": False, "error": f"Cannot resume alert from status '{current_status}'"}

        # Validate user exists (use system user if not)
        valid_user_id = await _get_valid_user_id(conn, user_id)

        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE alerts SET status = 'in_progress' WHERE id = %s",
                (alert_id,),
            )

        await _log_status_change(conn, alert_id, current_status, 'in_progress', valid_user_id, "Resumed work")

        logger.info(f"Alert {alert_id} resumed by {valid_user_id}")
        return {"success": True, "alert_id": alert_id, "status": "in_progress"}


@activity.defn
async def resolve_alert_activity(
    alert_id: int,
    user_id: str,
    resolution_type: str,
    resolution_notes: Optional[str] = None
) -> dict[str, Any]:
    """Resolve an alert with a resolution type and user validation"""
    pool = get_pool()

    if resolution_type not in RESOLUTION_TYPES:
        return {"success": False, "error": f"Invalid resolution type: {resolution_type}"}

    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status not in ('in_progress', 'escalated', 'on_hold'):
            return {"success": False, "error": f"Cannot resolve alert from status '{current_status}'"}

        # Validate user exists (use system user for history log if not)
        valid_user_id = await _get_valid_user_id(conn, user_id)

        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE alerts
                SET status = 'resolved',
                    resolution_type = %s,
                    resolution_notes = %s,
                    resolved_by = %s,
                    resolved_at = NOW()
                WHERE id = %s
                """,
                (resolution_type, resolution_notes, user_id, alert_id),
            )

        await _log_status_change(
            conn, alert_id, current_status, 'resolved', valid_user_id, resolution_notes,
            {"resolution_type": resolution_type}
        )

        logger.info(f"Alert {alert_id} resolved as {resolution_type} by {user_id}")
        return {"success": True, "alert_id": alert_id, "status": "resolved", "resolution_type": resolution_type}


@activity.defn
async def reopen_alert_activity(alert_id: int, user_id: str, reason: Optional[str] = None) -> dict[str, Any]:
    """Reopen a resolved alert (manager only - enforced at API level) with user validation"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'resolved':
            return {"success": False, "error": f"Cannot reopen alert from status '{current_status}'"}

        # Validate user exists (use system user if not)
        valid_user_id = await _get_valid_user_id(conn, user_id)

        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE alerts
                SET status = 'open',
                    assigned_to = NULL,
                    assigned_by = NULL,
                    assigned_at = NULL,
                    resolution_type = NULL,
                    resolved_by = NULL,
                    resolved_at = NULL
                WHERE id = %s
                """,
                (alert_id,),
            )

        await _log_status_change(conn, alert_id, current_status, 'open', valid_user_id, reason or "Reopened")

        logger.info(f"Alert {alert_id} reopened by {valid_user_id}")
        return {"success": True, "alert_id": alert_id, "status": "open"}


@activity.defn
async def add_alert_note_activity(
    alert_id: int,
    user_id: str,
    content: str,
    note_type: str = "comment"
) -> dict[str, Any]:
    """Add a note to an alert with user validation"""
    pool = get_pool()
    async with pool.connection() as conn:
        # Validate user exists, fall back to system user if not
        valid_user_id = await _get_valid_user_id(conn, user_id)

        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO alert_notes (alert_id, user_id, content, note_type)
                VALUES (%s, %s, %s, %s)
                RETURNING id, alert_id, user_id, content, note_type, created_at
                """,
                (alert_id, valid_user_id, content, note_type),
            )
            result = await cur.fetchone()

            logger.info(f"Note added to alert {alert_id} by {valid_user_id}")
            return {
                "success": True,
                "note_id": result["id"],
                "alert_id": alert_id,
                "user_id": valid_user_id,
                "original_user_id": user_id if user_id != valid_user_id else None,
                "created_at": result["created_at"].isoformat()
            }


@activity.defn
async def get_alert_details_activity(alert_id: int) -> dict[str, Any]:
    """Get full alert details including assignment info"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT a.*,
                   u_assigned.full_name as assigned_to_name,
                   u_assigned.email as assigned_to_email,
                   u_escalated.full_name as escalated_to_name,
                   c.full_name as customer_name
            FROM alerts a
            LEFT JOIN users u_assigned ON a.assigned_to = u_assigned.id
            LEFT JOIN users u_escalated ON a.escalated_to = u_escalated.id
            LEFT JOIN customers c ON a.customer_id = c.id
            WHERE a.id = %s
            """,
            (alert_id,),
        )
        row = await cur.fetchone()

        if not row:
            return {"success": False, "error": "Alert not found"}

        # Convert to serializable dict
        result = dict(row)
        for key, value in result.items():
            if isinstance(value, (date, datetime)):
                result[key] = value.isoformat()
            elif hasattr(value, "__str__") and key.endswith("_id"):
                result[key] = str(value) if value else None

        return {"success": True, "alert": result}


# =============================================================================
# TASK LIFECYCLE ACTIVITIES
# =============================================================================

# Valid task status transitions
TASK_STATUS_TRANSITIONS = {
    'pending': ['in_progress'],
    'in_progress': ['pending', 'completed'],
    'completed': [],  # No transitions from completed (immutable)
}


async def _get_task_current_status(conn, task_id: int) -> Optional[str]:
    """Get current status of a task"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT status FROM tasks WHERE id = %s", (task_id,))
        row = await cur.fetchone()
        return row["status"] if row else None


async def _log_task_status_change(
    conn,
    task_id: int,
    previous_status: str,
    new_status: str,
    changed_by: str,
    reason: Optional[str] = None,
    metadata: Optional[dict] = None
) -> None:
    """Log a task status change to the history table"""
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO task_status_history (task_id, previous_status, new_status, changed_by, reason, metadata)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (task_id, previous_status, new_status, changed_by, reason, Jsonb(metadata or {})),
        )


@activity.defn
async def claim_task_activity(task_id: int, user_id: str) -> dict[str, Any]:
    """Claim a task from the queue"""
    pool = get_pool()
    async with pool.connection() as conn:
        # Validate user exists
        if not await _validate_user_exists(conn, user_id):
            return {"success": False, "error": f"User {user_id} not found"}

        async with conn.cursor(row_factory=dict_row) as cur:
            # Check task exists and is claimable
            await cur.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
            task = await cur.fetchone()

            if not task:
                return {"success": False, "error": "Task not found"}

            if task["assigned_to"] and str(task["assigned_to"]) != user_id:
                return {"success": False, "error": "Task already assigned to another user"}

            if task["status"] not in ("pending", "in_progress"):
                return {"success": False, "error": f"Cannot claim task in status '{task['status']}'"}

            previous_status = task["status"]

            # Claim the task
            await cur.execute("""
                UPDATE tasks
                SET assigned_to = %s,
                    assigned_at = NOW(),
                    status = 'in_progress'
                WHERE id = %s
                RETURNING *
            """, (user_id, task_id))
            result = await cur.fetchone()

        # Log status change
        await _log_task_status_change(
            conn, task_id, previous_status, 'in_progress', user_id,
            "Task claimed", {"self_claimed": True}
        )

        logger.info(f"Task {task_id} claimed by {user_id}")
        return {
            "success": True,
            "task_id": task_id,
            "status": "in_progress",
            "assigned_to": user_id
        }


@activity.defn
async def release_task_activity(task_id: int, user_id: str) -> dict[str, Any]:
    """Release a task back to the queue"""
    pool = get_pool()
    async with pool.connection() as conn:
        # Validate user exists (for audit)
        valid_user_id = await _get_valid_user_id(conn, user_id)

        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
            task = await cur.fetchone()

            if not task:
                return {"success": False, "error": "Task not found"}

            if task["status"] != "in_progress":
                return {"success": False, "error": f"Cannot release task in status '{task['status']}'"}

            previous_status = task["status"]

            # Release the task
            await cur.execute("""
                UPDATE tasks
                SET assigned_to = NULL,
                    assigned_by = NULL,
                    assigned_at = NULL,
                    status = 'pending'
                WHERE id = %s
                RETURNING *
            """, (task_id,))
            result = await cur.fetchone()

        # Log status change
        await _log_task_status_change(
            conn, task_id, previous_status, 'pending', valid_user_id,
            "Task released back to queue"
        )

        logger.info(f"Task {task_id} released by {valid_user_id}")
        return {"success": True, "task_id": task_id, "status": "pending"}


@activity.defn
async def complete_task_activity(
    task_id: int,
    user_id: str,
    resolution_notes: Optional[str] = None
) -> dict[str, Any]:
    """Complete a task"""
    pool = get_pool()
    async with pool.connection() as conn:
        # Validate user exists (for audit)
        valid_user_id = await _get_valid_user_id(conn, user_id)

        async with conn.cursor(row_factory=dict_row) as cur:
            # Get user email for completed_by field
            await cur.execute("SELECT email FROM users WHERE id = %s", (valid_user_id,))
            user_row = await cur.fetchone()
            completed_by_str = user_row["email"] if user_row else valid_user_id

            await cur.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
            task = await cur.fetchone()

            if not task:
                return {"success": False, "error": "Task not found"}

            if task["status"] == "completed":
                return {"success": False, "error": "Task is already completed"}

            previous_status = task["status"]

            # Complete the task
            await cur.execute("""
                UPDATE tasks
                SET status = 'completed',
                    completed_at = NOW(),
                    completed_by = %s,
                    resolution_notes = COALESCE(%s, resolution_notes)
                WHERE id = %s
                RETURNING *
            """, (completed_by_str, resolution_notes, task_id))
            result = await cur.fetchone()

        # Log status change
        await _log_task_status_change(
            conn, task_id, previous_status, 'completed', valid_user_id,
            resolution_notes or "Task completed"
        )

        logger.info(f"Task {task_id} completed by {valid_user_id}")
        return {
            "success": True,
            "task_id": task_id,
            "status": "completed",
            "completed_by": completed_by_str
        }


@activity.defn
async def assign_task_activity(
    task_id: int,
    assigned_to: str,
    assigned_by: str
) -> dict[str, Any]:
    """Assign a task to a user (manager action)"""
    pool = get_pool()
    async with pool.connection() as conn:
        # Validate assignee exists
        if not await _validate_user_exists(conn, assigned_to):
            return {"success": False, "error": f"Assignee {assigned_to} not found"}

        # Validate assigner exists
        valid_assigned_by = await _get_valid_user_id(conn, assigned_by)

        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
            task = await cur.fetchone()

            if not task:
                return {"success": False, "error": "Task not found"}

            if task["status"] == "completed":
                return {"success": False, "error": "Cannot assign completed task"}

            previous_status = task["status"]
            new_status = "in_progress" if previous_status == "pending" else previous_status

            # Assign the task
            await cur.execute("""
                UPDATE tasks
                SET assigned_to = %s,
                    assigned_by = %s,
                    assigned_at = NOW(),
                    status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END
                WHERE id = %s
                RETURNING *
            """, (assigned_to, valid_assigned_by, task_id))
            result = await cur.fetchone()

        # Log status change if status changed
        if previous_status != new_status:
            await _log_task_status_change(
                conn, task_id, previous_status, new_status, valid_assigned_by,
                f"Assigned to user", {"assigned_to": assigned_to}
            )

        logger.info(f"Task {task_id} assigned to {assigned_to} by {valid_assigned_by}")
        return {
            "success": True,
            "task_id": task_id,
            "status": new_status,
            "assigned_to": assigned_to
        }


@activity.defn
async def create_task_from_alert_activity(
    alert_id: int,
    action: str,  # "assign" or "escalate"
    user_id: str,
    params: dict[str, Any]
) -> dict[str, Any]:
    """
    Create or update a task when an alert is assigned or escalated.
    This ensures analysts have a task to track their work on an alert.
    """
    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            # Get alert details
            await cur.execute("""
                SELECT a.*, c.full_name as customer_name
                FROM alerts a
                LEFT JOIN customers c ON c.id = a.customer_id
                WHERE a.id = %s
            """, (alert_id,))
            alert = await cur.fetchone()

            if not alert:
                return {"success": False, "error": "Alert not found"}

            # Check if a task already exists for this alert
            await cur.execute("""
                SELECT id, status FROM tasks
                WHERE alert_id = %s AND status IN ('pending', 'in_progress')
                ORDER BY created_at DESC
                LIMIT 1
            """, (alert_id,))
            existing_task = await cur.fetchone()

            # Determine task type and priority based on action
            if action == "escalate":
                task_type = "escalation"
                priority = "critical" if alert.get("severity") == "critical" else "high"
                title = f"Escalation: {alert.get('scenario', 'Unknown')}"
                description = f"Escalated alert review: {params.get('reason', 'Escalated for senior review')}"
            else:  # assign
                task_type = "investigation"
                severity = (alert.get("severity") or "medium").lower()
                priority = {
                    "critical": "critical",
                    "high": "high",
                    "medium": "medium",
                    "low": "low",
                }.get(severity, "medium")
                title = f"Investigate: {alert.get('scenario', 'Unknown')}"
                description = f"Alert investigation for {alert.get('customer_name', 'Unknown customer')}"

            if existing_task:
                # Update existing task assignment
                assigned_to = params.get("assigned_to") or params.get("escalated_to") or user_id
                await cur.execute("""
                    UPDATE tasks
                    SET assigned_to = %s,
                        assigned_at = NOW(),
                        priority = %s,
                        status = 'in_progress'
                    WHERE id = %s
                    RETURNING id
                """, (assigned_to, priority, existing_task["id"]))
                task_row = await cur.fetchone()
                logger.info(f"Updated task {task_row['id']} for alert {alert_id} ({action})")
                return {
                    "success": True,
                    "task_id": task_row["id"],
                    "action": "updated",
                    "alert_id": alert_id
                }
            else:
                # Create new task
                assigned_to = params.get("assigned_to") or params.get("escalated_to") or user_id
                await cur.execute("""
                    INSERT INTO tasks (
                        customer_id, alert_id, task_type, priority,
                        title, description, assigned_to, assigned_at,
                        status, details, created_by
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), 'pending', %s, %s)
                    RETURNING id
                """, (
                    alert.get("customer_id"),
                    alert_id,
                    task_type,
                    priority,
                    title,
                    description,
                    assigned_to,
                    Jsonb({
                        "alert_scenario": alert.get("scenario"),
                        "alert_severity": alert.get("severity"),
                        "action": action,
                        "created_from": "alert_lifecycle",
                    }),
                    SYSTEM_USER_ID,
                ))
                task_row = await cur.fetchone()
                logger.info(f"Created task {task_row['id']} for alert {alert_id} ({action})")
                return {
                    "success": True,
                    "task_id": task_row["id"],
                    "action": "created",
                    "alert_id": alert_id
                }


# =============================================================================
# SANCTIONS SCREENING ACTIVITIES
# =============================================================================

@activity.defn
async def check_sanctions_api_activity(customer_name: str) -> dict[str, Any]:
    """
    Call the external sanctions API to check if a customer name matches any sanctions list.

    Args:
        customer_name: The customer name to check

    Returns:
        dict with keys:
        - hit: bool - whether a match was found
        - matches: list - list of matching entries (if any)
        - error: str - error message if the API call failed
    """
    import httpx  # Import inside activity to avoid Temporal sandbox restrictions

    if not customer_name or not customer_name.strip():
        return {"hit": False, "matches": [], "error": None}

    try:
        async with httpx.AsyncClient(timeout=settings.sanctions_api_timeout) as client:
            url = f"{settings.sanctions_api_url}/api/v1/sanctions/search"
            response = await client.get(url, params={"q": customer_name.strip()})
            response.raise_for_status()

            data = response.json()

            # Handle different API response formats
            # Expecting either: {"results": [...]} or {"matches": [...]} or a list directly
            matches = []
            if isinstance(data, list):
                matches = data
            elif isinstance(data, dict):
                matches = data.get("results", data.get("matches", data.get("data", [])))

            return {
                "hit": len(matches) > 0,
                "matches": matches[:10],  # Limit to 10 matches for storage
                "error": None
            }

    except httpx.TimeoutException:
        logger.warning(f"Sanctions API timeout for customer: {customer_name}")
        return {"hit": False, "matches": [], "error": "API timeout"}
    except httpx.HTTPStatusError as e:
        logger.error(f"Sanctions API error for customer {customer_name}: {e.response.status_code}")
        return {"hit": False, "matches": [], "error": f"API error: {e.response.status_code}"}
    except Exception as e:
        logger.error(f"Sanctions API exception for customer {customer_name}: {str(e)}")
        return {"hit": False, "matches": [], "error": str(e)}


@activity.defn
async def get_customers_for_screening_activity(batch_size: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """
    Fetch a batch of active customers for sanctions screening.

    Args:
        batch_size: Number of customers to fetch
        offset: Offset for pagination

    Returns:
        List of customer dicts with id, full_name, first_name, last_name
    """
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT id, full_name, first_name, last_name, sanctions_hit
            FROM customers
            WHERE status = 'active'
            ORDER BY id
            LIMIT %s OFFSET %s
            """,
            (batch_size, offset)
        )
        rows = await cur.fetchall()

        # Convert UUIDs to strings
        return [
            {
                "id": str(row["id"]),
                "full_name": row.get("full_name"),
                "first_name": row.get("first_name"),
                "last_name": row.get("last_name"),
                "sanctions_hit": row.get("sanctions_hit", False)
            }
            for row in rows
        ]


@activity.defn
async def update_customer_sanctions_status_activity(
    customer_id: str,
    sanctions_hit: bool,
    match_details: dict[str, Any]
) -> None:
    """
    Update a customer's sanctions_hit flag and create an alert if needed.

    Args:
        customer_id: The customer UUID
        sanctions_hit: Whether a sanctions hit was detected
        match_details: Details of the match (for the alert)
    """
    pool = get_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            # Update customer sanctions_hit flag
            await cur.execute(
                """
                UPDATE customers
                SET sanctions_hit = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (sanctions_hit, customer_id)
            )

            if sanctions_hit:
                # Create an alert for the sanctions match
                await cur.execute(
                    """
                    INSERT INTO alerts (customer_id, type, severity, scenario, details, status)
                    VALUES (%s, 'sanctions', 'critical', 'sanctions_match', %s, 'open')
                    RETURNING id
                    """,
                    (customer_id, Jsonb(match_details))
                )
                alert_id = (await cur.fetchone())[0]
                logger.info(f"Created sanctions alert {alert_id} for customer {customer_id}")


@activity.defn
async def record_screening_run_activity(
    total_customers: int,
    hits_found: int,
    errors: int,
    duration_seconds: float
) -> None:
    """
    Record a sanctions screening run in the database for audit purposes.
    """
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO workflow_executions (
                workflow_definition_id,
                temporal_workflow_id,
                status,
                started_at,
                completed_at,
                result,
                triggered_by
            )
            SELECT
                wd.id,
                %s,
                'completed',
                NOW() - interval '%s seconds',
                NOW(),
                %s,
                'schedule'
            FROM workflow_definitions wd
            WHERE wd.workflow_type = 'sanctions_screening'
            LIMIT 1
            """,
            (
                f"sanctions-screening-{datetime.now().isoformat()}",
                int(duration_seconds),
                Jsonb({
                    "total_customers": total_customers,
                    "hits_found": hits_found,
                    "errors": errors,
                    "duration_seconds": duration_seconds
                })
            )
        )


# =============================================================================
# EXISTING WORKFLOWS
# =============================================================================

@workflow.defn
class KycRefreshWorkflow:
    """Workflow for KYC document refresh"""

    @workflow.run
    async def run(self, customer_id: str, days_before: int = 365) -> None:
        await workflow.execute_activity(
            schedule_kyc_task_activity,
            args=[customer_id, days_before],
            start_to_close_timeout=timedelta(seconds=20),
        )


@workflow.defn
class SanctionsScreeningWorkflow:
    """
    Workflow for sanctions screening.

    Can run in two modes:
    1. Single customer mode: Check a specific customer (customer_id provided)
    2. Batch mode: Check all active customers (customer_id empty or "all")

    The workflow calls an external sanctions API and creates alerts for any matches.
    """

    @workflow.run
    async def run(
        self,
        customer_id: str = "",
        batch_size: int = 100
    ) -> dict[str, Any]:
        """
        Run sanctions screening.

        Args:
            customer_id: Specific customer to check, or empty/"all" for batch mode
            batch_size: Number of customers to process per batch (batch mode only)

        Returns:
            dict with screening results summary
        """
        start_time = datetime.now()
        total_checked = 0
        hits_found = 0
        errors = 0

        if customer_id and customer_id != "all":
            # Single customer mode
            customers = [{"id": customer_id, "full_name": None, "first_name": None, "last_name": None}]

            # We need to fetch the customer name
            customers = await workflow.execute_activity(
                get_customers_for_screening_activity,
                args=[1, 0],  # Just to get the pattern, we'll filter
                start_to_close_timeout=timedelta(seconds=30),
            )
            # Filter to just our customer - actually let's just check by ID
            # For single customer, fetch their info first
            pool_customers = await workflow.execute_activity(
                get_customers_for_screening_activity,
                args=[1000, 0],
                start_to_close_timeout=timedelta(seconds=60),
            )
            customers = [c for c in pool_customers if c["id"] == customer_id]

            if not customers:
                return {
                    "status": "error",
                    "message": f"Customer {customer_id} not found",
                    "total_checked": 0,
                    "hits_found": 0,
                    "errors": 0
                }
        else:
            # Batch mode - process all customers
            offset = 0
            customers = []

            while True:
                batch = await workflow.execute_activity(
                    get_customers_for_screening_activity,
                    args=[batch_size, offset],
                    start_to_close_timeout=timedelta(seconds=60),
                )

                if not batch:
                    break

                customers.extend(batch)
                offset += batch_size

                # Safety limit to prevent infinite loops
                if offset > 100000:
                    workflow.logger.warning("Reached safety limit of 100,000 customers")
                    break

        # Process each customer
        for customer in customers:
            customer_id_str = customer["id"]

            # Build the name to check
            name_to_check = customer.get("full_name")
            if not name_to_check:
                first = customer.get("first_name", "")
                last = customer.get("last_name", "")
                name_to_check = f"{first} {last}".strip()

            if not name_to_check:
                workflow.logger.info(f"Skipping customer {customer_id_str} - no name available")
                continue

            total_checked += 1

            # Check against sanctions API
            result = await workflow.execute_activity(
                check_sanctions_api_activity,
                args=[name_to_check],
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=workflow.RetryPolicy(
                    maximum_attempts=3,
                    initial_interval=timedelta(seconds=1),
                    maximum_interval=timedelta(seconds=10),
                ),
            )

            if result.get("error"):
                errors += 1
                workflow.logger.warning(
                    f"Error checking customer {customer_id_str}: {result['error']}"
                )
                continue

            if result.get("hit"):
                hits_found += 1
                workflow.logger.info(
                    f"Sanctions hit found for customer {customer_id_str} ({name_to_check})"
                )

                # Update customer and create alert
                await workflow.execute_activity(
                    update_customer_sanctions_status_activity,
                    args=[
                        customer_id_str,
                        True,
                        {
                            "source": "sanctions_screening_workflow",
                            "checked_name": name_to_check,
                            "matches": result.get("matches", []),
                            "screened_at": datetime.now().isoformat()
                        }
                    ],
                    start_to_close_timeout=timedelta(seconds=30),
                )

        # Calculate duration
        duration_seconds = (datetime.now() - start_time).total_seconds()

        # Record the screening run (only in batch mode)
        if not customer_id or customer_id == "all":
            try:
                await workflow.execute_activity(
                    record_screening_run_activity,
                    args=[total_checked, hits_found, errors, duration_seconds],
                    start_to_close_timeout=timedelta(seconds=30),
                )
            except Exception as e:
                workflow.logger.warning(f"Failed to record screening run: {e}")

        return {
            "status": "completed",
            "total_checked": total_checked,
            "hits_found": hits_found,
            "errors": errors,
            "duration_seconds": duration_seconds
        }


# =============================================================================
# TASK MANAGEMENT WORKFLOWS
# =============================================================================

@workflow.defn
class TaskLifecycleWorkflow:
    """
    Central workflow for all task lifecycle actions.
    Routes task operations through Temporal for audit trail and consistency.
    """

    @workflow.run
    async def run(
        self,
        task_id: int,
        action: str,
        user_id: str,
        params: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Execute a task lifecycle action.

        Args:
            task_id: The task ID
            action: One of: claim, release, complete, assign
            user_id: The user performing the action
            params: Action-specific parameters
        """
        result = {"task_id": task_id, "action": action, "user_id": user_id}

        try:
            if action == "claim":
                activity_result = await workflow.execute_activity(
                    claim_task_activity,
                    args=[task_id, user_id],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "release":
                activity_result = await workflow.execute_activity(
                    release_task_activity,
                    args=[task_id, user_id],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "complete":
                resolution_notes = params.get("resolution_notes")
                activity_result = await workflow.execute_activity(
                    complete_task_activity,
                    args=[task_id, user_id, resolution_notes],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "assign":
                assigned_to = params.get("assigned_to")
                if not assigned_to:
                    return {"success": False, "error": "assigned_to is required"}
                activity_result = await workflow.execute_activity(
                    assign_task_activity,
                    args=[task_id, assigned_to, user_id],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            else:
                return {"success": False, "error": f"Unknown action: {action}"}

            result.update(activity_result)
            return result

        except Exception as e:
            logger.error(f"Task lifecycle workflow error: {e}")
            return {"success": False, "error": str(e)}


@workflow.defn
class DocumentRequestWorkflow:
    """Workflow for document request tasks"""

    @workflow.run
    async def run(
        self,
        customer_id: Optional[str],
        task_id: int,
        details: dict[str, Any]
    ) -> dict[str, Any]:
        document_type = details.get("document_type", "identity_document")
        workflow_definition_id = details.get("workflow_definition_id")
        workflow_id = details.get("workflow_id")

        # Create task if triggered from workflow definition and no task exists
        if task_id == 0 and workflow_definition_id:
            task_result = await workflow.execute_activity(
                create_workflow_task_activity,
                args=[
                    workflow_definition_id,
                    customer_id,
                    None,  # alert_id
                    workflow_id,
                    workflow.info().run_id,
                    {"document_type": document_type, "triggered_from": "workflow_definition"},
                ],
                start_to_close_timeout=timedelta(seconds=30),
            )
            if task_result.get("created"):
                task_id = task_result["task_id"]

        if not customer_id:
            if task_id:
                await workflow.execute_activity(
                    update_task_status_activity,
                    args=[task_id, "cancelled", "No customer specified", "FAILED"],
                    start_to_close_timeout=timedelta(seconds=20),
                )
            return {"error": "No customer specified", "task_id": task_id}

        # Request document
        result = await workflow.execute_activity(
            request_document_activity,
            args=[customer_id, document_type, task_id],
            start_to_close_timeout=timedelta(seconds=30),
        )

        # Update task notes (keep as pending until user action)
        if task_id:
            await workflow.execute_activity(
                update_task_status_activity,
                args=[
                    task_id,
                    "pending",
                    f"Document requested: {document_type}. Awaiting submission.",
                    "WAITING"
                ],
                start_to_close_timeout=timedelta(seconds=20),
            )

        return {**result, "task_id": task_id}


@workflow.defn
class SarFilingWorkflow:
    """Workflow for SAR (Suspicious Activity Report) filing tasks"""

    @workflow.run
    async def run(
        self,
        customer_id: Optional[str],
        task_id: int,
        details: dict[str, Any]
    ) -> dict[str, Any]:
        workflow_definition_id = details.get("workflow_definition_id")
        workflow_id = details.get("workflow_id")

        # Create task if triggered from workflow definition and no task exists
        if task_id == 0 and workflow_definition_id:
            task_result = await workflow.execute_activity(
                create_workflow_task_activity,
                args=[
                    workflow_definition_id,
                    customer_id,
                    None,  # alert_id
                    workflow_id,
                    workflow.info().run_id,
                    {"triggered_from": "workflow_definition"},
                ],
                start_to_close_timeout=timedelta(seconds=30),
            )
            if task_result.get("created"):
                task_id = task_result["task_id"]

        if not customer_id:
            if task_id:
                await workflow.execute_activity(
                    update_task_status_activity,
                    args=[task_id, "cancelled", "No customer specified for SAR", "FAILED"],
                    start_to_close_timeout=timedelta(seconds=20),
                )
            return {"error": "No customer specified", "task_id": task_id}

        # Gather SAR data
        sar_data = await workflow.execute_activity(
            perform_sar_checks_activity,
            args=[customer_id, task_id],
            start_to_close_timeout=timedelta(seconds=60),
        )

        # Create high-priority alert for SAR review
        await workflow.execute_activity(
            create_escalation_alert_activity,
            args=[customer_id, task_id, "SAR filing initiated - requires compliance review", "critical"],
            start_to_close_timeout=timedelta(seconds=20),
        )

        # Update task status
        if task_id:
            await workflow.execute_activity(
                update_task_status_activity,
                args=[
                    task_id,
                    "pending",
                    f"SAR data gathered. Alerts: {sar_data['alerts_count']}, Transactions: {sar_data['transactions_count']}. Pending filing.",
                    "SAR_PENDING"
                ],
                start_to_close_timeout=timedelta(seconds=20),
            )

        return {
            "task_id": task_id,
            "customer_id": customer_id,
            "sar_data": sar_data,
            "status": "sar_pending"
        }


# =============================================================================
# ALERT LIFECYCLE WORKFLOW
# =============================================================================

@workflow.defn
class AlertLifecycleWorkflow:
    """
    Central workflow for all alert lifecycle actions.
    Validates transitions and executes appropriate activity.
    """

    @workflow.run
    async def run(
        self,
        alert_id: int,
        action: str,
        user_id: str,
        user_role: str,
        params: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Execute an alert lifecycle action.

        Args:
            alert_id: The alert ID
            action: One of: init, assign, unassign, start, escalate, hold, resume, resolve, reopen, add_note
            user_id: The user performing the action
            user_role: The user's role (analyst, senior_analyst, manager, admin, system)
            params: Action-specific parameters
        """
        result = {"alert_id": alert_id, "action": action, "user_id": user_id}

        try:
            if action == "init":
                # Initialize alert workflow (called when alert is created via pg_notify)
                customer_id = params.get("customer_id", "")
                scenario = params.get("scenario", "unknown")
                severity = params.get("severity", "medium")
                alert_type = params.get("type", "transaction")
                activity_result = await workflow.execute_activity(
                    init_alert_activity,
                    args=[alert_id, customer_id, scenario, severity, alert_type],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "assign":
                assigned_to = params.get("assigned_to", user_id)
                assigned_by = params.get("assigned_by")
                activity_result = await workflow.execute_activity(
                    assign_alert_activity,
                    args=[alert_id, assigned_to, assigned_by],
                    start_to_close_timeout=timedelta(seconds=30),
                )

                # Auto-create/update task for the assigned analyst
                if activity_result.get("success"):
                    task_result = await workflow.execute_activity(
                        create_task_from_alert_activity,
                        args=[alert_id, "assign", user_id, {"assigned_to": assigned_to}],
                        start_to_close_timeout=timedelta(seconds=30),
                    )
                    activity_result["task_id"] = task_result.get("task_id")
                    activity_result["task_action"] = task_result.get("action")

            elif action == "unassign":
                activity_result = await workflow.execute_activity(
                    unassign_alert_activity,
                    args=[alert_id, user_id],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "start":
                activity_result = await workflow.execute_activity(
                    start_alert_work_activity,
                    args=[alert_id, user_id],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "escalate":
                escalated_to = params.get("escalated_to")
                reason = params.get("reason", "Escalated")
                if not escalated_to:
                    return {"success": False, "error": "escalated_to is required"}
                activity_result = await workflow.execute_activity(
                    escalate_alert_lifecycle_activity,
                    args=[alert_id, user_id, escalated_to, reason],
                    start_to_close_timeout=timedelta(seconds=30),
                )

                # Auto-create/update escalation task for the senior/manager
                if activity_result.get("success"):
                    task_result = await workflow.execute_activity(
                        create_task_from_alert_activity,
                        args=[alert_id, "escalate", user_id, {"escalated_to": escalated_to, "reason": reason}],
                        start_to_close_timeout=timedelta(seconds=30),
                    )
                    activity_result["task_id"] = task_result.get("task_id")
                    activity_result["task_action"] = task_result.get("action")

            elif action == "hold":
                reason = params.get("reason")
                activity_result = await workflow.execute_activity(
                    hold_alert_activity,
                    args=[alert_id, user_id, reason],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "resume":
                activity_result = await workflow.execute_activity(
                    resume_alert_activity,
                    args=[alert_id, user_id],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "resolve":
                resolution_type = params.get("resolution_type")
                resolution_notes = params.get("resolution_notes")
                if not resolution_type:
                    return {"success": False, "error": "resolution_type is required"}
                activity_result = await workflow.execute_activity(
                    resolve_alert_activity,
                    args=[alert_id, user_id, resolution_type, resolution_notes],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "reopen":
                # Only managers/admins can reopen
                if user_role not in ('manager', 'admin'):
                    return {"success": False, "error": "Only managers can reopen alerts"}
                reason = params.get("reason")
                activity_result = await workflow.execute_activity(
                    reopen_alert_activity,
                    args=[alert_id, user_id, reason],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            elif action == "add_note":
                content = params.get("content")
                note_type = params.get("note_type", "comment")
                if not content:
                    return {"success": False, "error": "content is required"}
                activity_result = await workflow.execute_activity(
                    add_alert_note_activity,
                    args=[alert_id, user_id, content, note_type],
                    start_to_close_timeout=timedelta(seconds=30),
                )

            else:
                return {"success": False, "error": f"Unknown action: {action}"}

            result.update(activity_result)
            return result

        except Exception as e:
            logger.error(f"Alert lifecycle workflow error: {e}")
            return {"success": False, "error": str(e)}


# =============================================================================
# WORKER SETUP
# =============================================================================

# Namespace and queue constants
BUSINESS_NAMESPACE = "default"  # Default namespace - visible in Temporal UI
INTERNAL_NAMESPACE = "internal"  # Separate namespace - not shown in default UI view

BUSINESS_TASK_QUEUE = "aml-tasks"  # Business workflows
INTERNAL_TASK_QUEUE = "aml-internal"  # Internal lifecycle workflows


async def _ensure_namespace_exists(address: str, namespace: str, max_retries: int = 30) -> bool:
    """
    Wait for a Temporal namespace to be available.
    The namespace should be pre-created via docker-compose or tctl.
    Returns True if namespace is ready, False otherwise.
    """
    for attempt in range(max_retries):
        try:
            # Try to connect to the namespace
            client = await Client.connect(address, namespace=namespace)
            logger.info(f"Namespace '{namespace}' is ready")
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                logger.info(f"Waiting for namespace '{namespace}'... (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(2)
            else:
                logger.warning(f"Namespace '{namespace}' not available after {max_retries} attempts: {e}")
                return False
    return False


async def run_worker() -> None:
    """Run both business and internal Temporal workers"""
    # Initialize database pool
    from src.api.db import init_pool
    await init_pool()

    temporal_address = f"{settings.temporal_host}:{settings.temporal_port}"

    # Connect to business namespace (default - always exists)
    business_client = await Client.connect(temporal_address, namespace=BUSINESS_NAMESPACE)
    logger.info(f"Connected to business namespace '{BUSINESS_NAMESPACE}'")

    # Wait for internal namespace (created by temporal-admin-tools in docker-compose)
    internal_ready = await _ensure_namespace_exists(temporal_address, INTERNAL_NAMESPACE)
    if not internal_ready:
        logger.error(f"Internal namespace '{INTERNAL_NAMESPACE}' not available. "
                     f"Create it with: tctl --ns {INTERNAL_NAMESPACE} namespace register")
        raise RuntimeError(f"Namespace '{INTERNAL_NAMESPACE}' not available")

    internal_client = await Client.connect(temporal_address, namespace=INTERNAL_NAMESPACE)
    logger.info(f"Connected to internal namespace '{INTERNAL_NAMESPACE}'")

    # Business workflows worker - visible in Temporal UI (default namespace)
    # These are the workflows users want to see: KYC, Sanctions, Investigations, etc.
    business_worker = Worker(
        business_client,
        task_queue=BUSINESS_TASK_QUEUE,
        workflows=[
            KycRefreshWorkflow,
            SanctionsScreeningWorkflow,
            DocumentRequestWorkflow,
            SarFilingWorkflow,
        ],
        activities=[
            # Business activities
            create_alert_activity,
            schedule_kyc_task_activity,
            create_workflow_task_activity,
            update_task_status_activity,
            fetch_customer_data_activity,
            create_escalation_alert_activity,
            request_document_activity,
            perform_sar_checks_activity,
            update_alert_status_activity,
            # Sanctions screening activities
            check_sanctions_api_activity,
            get_customers_for_screening_activity,
            update_customer_sanctions_status_activity,
            record_screening_run_activity,
        ],
    )

    # Internal lifecycle worker - NOT visible in default Temporal UI
    # Uses separate 'internal' namespace for complete isolation
    internal_worker = Worker(
        internal_client,
        task_queue=INTERNAL_TASK_QUEUE,
        workflows=[
            AlertLifecycleWorkflow,
            TaskLifecycleWorkflow,
        ],
        activities=[
            # Alert lifecycle activities
            init_alert_activity,
            assign_alert_activity,
            unassign_alert_activity,
            start_alert_work_activity,
            escalate_alert_lifecycle_activity,
            hold_alert_activity,
            resume_alert_activity,
            resolve_alert_activity,
            reopen_alert_activity,
            add_alert_note_activity,
            get_alert_details_activity,
            # Task lifecycle activities
            claim_task_activity,
            release_task_activity,
            complete_task_activity,
            assign_task_activity,
            create_task_from_alert_activity,
        ],
    )

    logger.info(f"Starting Temporal workers:")
    logger.info(f"  - Business workflows: namespace='{BUSINESS_NAMESPACE}', queue='{BUSINESS_TASK_QUEUE}'")
    logger.info(f"  - Internal workflows: namespace='{INTERNAL_NAMESPACE}', queue='{INTERNAL_TASK_QUEUE}'")

    # Run both workers concurrently
    await asyncio.gather(
        business_worker.run(),
        internal_worker.run(),
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
