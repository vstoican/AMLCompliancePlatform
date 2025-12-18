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
async def schedule_kyc_task_activity(customer_id: str, days_before: int = 365) -> None:
    """Schedule KYC task based on document expiry"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT document_date_of_expire FROM customers WHERE id = %s",
            (customer_id,)
        )
        row = await cur.fetchone()
        if not row or not row["document_date_of_expire"]:
            return
        due = row["document_date_of_expire"]
        if isinstance(due, date):
            due_date = due
        else:
            due_date = due.date()
        if due_date > date.today() + timedelta(days=days_before):
            return
        await cur.execute(
            """
            INSERT INTO kyc_tasks (customer_id, due_date, reason)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (customer_id, due_date, "Workflow scheduled KYC update"),
        )


# =============================================================================
# TASK MANAGEMENT ACTIVITIES
# =============================================================================

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
async def assign_alert_activity(
    alert_id: int,
    assigned_to: str,
    assigned_by: Optional[str] = None
) -> dict[str, Any]:
    """Assign an alert to a user (self or by manager)"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'open':
            return {"success": False, "error": f"Cannot assign alert in status '{current_status}'"}

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
                (assigned_to, assigned_by or assigned_to, alert_id),
            )
            result = await cur.fetchone()

        await _log_status_change(
            conn, alert_id, current_status, 'assigned',
            assigned_by or assigned_to, None,
            {"assigned_to": assigned_to, "self_assigned": assigned_by is None or assigned_by == assigned_to}
        )

        logger.info(f"Alert {alert_id} assigned to {assigned_to}")
        return {"success": True, "alert_id": alert_id, "status": "assigned", "assigned_to": assigned_to}


@activity.defn
async def unassign_alert_activity(alert_id: int, user_id: str) -> dict[str, Any]:
    """Unassign an alert (back to open)"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'assigned':
            return {"success": False, "error": f"Cannot unassign alert in status '{current_status}'"}

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

        await _log_status_change(conn, alert_id, current_status, 'open', user_id, "Unassigned")

        logger.info(f"Alert {alert_id} unassigned by {user_id}")
        return {"success": True, "alert_id": alert_id, "status": "open"}


@activity.defn
async def start_alert_work_activity(alert_id: int, user_id: str) -> dict[str, Any]:
    """Start work on an assigned alert (assigned -> in_progress)"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'assigned':
            return {"success": False, "error": f"Cannot start work on alert in status '{current_status}'"}

        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE alerts SET status = 'in_progress' WHERE id = %s",
                (alert_id,),
            )

        await _log_status_change(conn, alert_id, current_status, 'in_progress', user_id, "Started work")

        logger.info(f"Alert {alert_id} work started by {user_id}")
        return {"success": True, "alert_id": alert_id, "status": "in_progress"}


@activity.defn
async def escalate_alert_lifecycle_activity(
    alert_id: int,
    escalated_by: str,
    escalated_to: str,
    reason: str
) -> dict[str, Any]:
    """Escalate an alert to a senior/manager"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'in_progress':
            return {"success": False, "error": f"Cannot escalate alert in status '{current_status}'"}

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
                (escalated_to, escalated_by, reason, alert_id),
            )

        await _log_status_change(
            conn, alert_id, current_status, 'escalated', escalated_by, reason,
            {"escalated_to": escalated_to}
        )

        logger.info(f"Alert {alert_id} escalated to {escalated_to} by {escalated_by}")
        return {"success": True, "alert_id": alert_id, "status": "escalated", "escalated_to": escalated_to}


@activity.defn
async def hold_alert_activity(alert_id: int, user_id: str, reason: Optional[str] = None) -> dict[str, Any]:
    """Put an alert on hold"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'in_progress':
            return {"success": False, "error": f"Cannot put alert on hold from status '{current_status}'"}

        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE alerts SET status = 'on_hold' WHERE id = %s",
                (alert_id,),
            )

        await _log_status_change(conn, alert_id, current_status, 'on_hold', user_id, reason or "Put on hold")

        logger.info(f"Alert {alert_id} put on hold by {user_id}")
        return {"success": True, "alert_id": alert_id, "status": "on_hold"}


@activity.defn
async def resume_alert_activity(alert_id: int, user_id: str) -> dict[str, Any]:
    """Resume work on an alert (on_hold/escalated -> in_progress)"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status not in ('on_hold', 'escalated'):
            return {"success": False, "error": f"Cannot resume alert from status '{current_status}'"}

        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE alerts SET status = 'in_progress' WHERE id = %s",
                (alert_id,),
            )

        await _log_status_change(conn, alert_id, current_status, 'in_progress', user_id, "Resumed work")

        logger.info(f"Alert {alert_id} resumed by {user_id}")
        return {"success": True, "alert_id": alert_id, "status": "in_progress"}


@activity.defn
async def resolve_alert_activity(
    alert_id: int,
    user_id: str,
    resolution_type: str,
    resolution_notes: Optional[str] = None
) -> dict[str, Any]:
    """Resolve an alert with a resolution type"""
    pool = get_pool()

    if resolution_type not in RESOLUTION_TYPES:
        return {"success": False, "error": f"Invalid resolution type: {resolution_type}"}

    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status not in ('in_progress', 'escalated', 'on_hold'):
            return {"success": False, "error": f"Cannot resolve alert from status '{current_status}'"}

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
            conn, alert_id, current_status, 'resolved', user_id, resolution_notes,
            {"resolution_type": resolution_type}
        )

        logger.info(f"Alert {alert_id} resolved as {resolution_type} by {user_id}")
        return {"success": True, "alert_id": alert_id, "status": "resolved", "resolution_type": resolution_type}


@activity.defn
async def reopen_alert_activity(alert_id: int, user_id: str, reason: Optional[str] = None) -> dict[str, Any]:
    """Reopen a resolved alert (manager only - enforced at API level)"""
    pool = get_pool()
    async with pool.connection() as conn:
        current_status = await _get_alert_current_status(conn, alert_id)

        if current_status is None:
            return {"success": False, "error": "Alert not found"}

        if current_status != 'resolved':
            return {"success": False, "error": f"Cannot reopen alert from status '{current_status}'"}

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

        await _log_status_change(conn, alert_id, current_status, 'open', user_id, reason or "Reopened")

        logger.info(f"Alert {alert_id} reopened by {user_id}")
        return {"success": True, "alert_id": alert_id, "status": "open"}


@activity.defn
async def add_alert_note_activity(
    alert_id: int,
    user_id: str,
    content: str,
    note_type: str = "comment"
) -> dict[str, Any]:
    """Add a note to an alert"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            INSERT INTO alert_notes (alert_id, user_id, content, note_type)
            VALUES (%s, %s, %s, %s)
            RETURNING id, alert_id, user_id, content, note_type, created_at
            """,
            (alert_id, user_id, content, note_type),
        )
        result = await cur.fetchone()

        logger.info(f"Note added to alert {alert_id} by {user_id}")
        return {
            "success": True,
            "note_id": result["id"],
            "alert_id": alert_id,
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
    """Workflow for sanctions screening"""

    @workflow.run
    async def run(self, customer_id: str, hit_detected: bool = False) -> None:
        if hit_detected:
            await workflow.execute_activity(
                create_alert_activity,
                args=[customer_id, "sanctions_match", "high", {"source": "workflow"}],
                start_to_close_timeout=timedelta(seconds=20),
            )


# =============================================================================
# TASK MANAGEMENT WORKFLOWS
# =============================================================================

@workflow.defn
class InvestigationWorkflow:
    """Workflow for investigation tasks"""

    @workflow.run
    async def run(
        self,
        customer_id: Optional[str],
        task_id: int,
        details: dict[str, Any]
    ) -> dict[str, Any]:
        result = {"task_id": task_id, "customer_id": customer_id}

        # Step 1: Fetch customer data if customer_id provided
        if customer_id:
            customer_data = await workflow.execute_activity(
                fetch_customer_data_activity,
                args=[customer_id],
                start_to_close_timeout=timedelta(seconds=30),
            )
            result["customer_data"] = customer_data

            # Step 2: Analyze risk indicators
            risk_indicators = {
                "high_volume": customer_data.get("total_volume", 0) > 100000,
                "many_alerts": customer_data.get("alert_count", 0) > 5,
                "open_alerts": customer_data.get("open_alerts", 0) > 0,
                "pep_flag": customer_data.get("pep_flag", False),
                "sanctions_hit": customer_data.get("sanctions_hit", False),
                "high_risk": customer_data.get("risk_level") == "high",
            }
            result["risk_indicators"] = risk_indicators

            # Step 3: Auto-escalate if high risk
            needs_escalation = (
                risk_indicators["pep_flag"] or
                risk_indicators["sanctions_hit"] or
                (risk_indicators["high_risk"] and risk_indicators["many_alerts"])
            )

            if needs_escalation:
                await workflow.execute_activity(
                    create_escalation_alert_activity,
                    args=[customer_id, task_id, "High-risk indicators detected during investigation"],
                    start_to_close_timeout=timedelta(seconds=20),
                )
                result["escalated"] = True
            else:
                result["escalated"] = False

        # Step 4: Update task status
        await workflow.execute_activity(
            update_task_status_activity,
            args=[
                task_id,
                "completed",
                f"Investigation completed. Escalation: {result.get('escalated', False)}",
                "COMPLETED"
            ],
            start_to_close_timeout=timedelta(seconds=20),
        )

        return result


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

        if not customer_id:
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

        # Update task to in_progress (waiting for document)
        await workflow.execute_activity(
            update_task_status_activity,
            args=[
                task_id,
                "in_progress",
                f"Document requested: {document_type}. Awaiting submission.",
                "WAITING"
            ],
            start_to_close_timeout=timedelta(seconds=20),
        )

        return result


@workflow.defn
class EscalationWorkflow:
    """Workflow for escalation tasks"""

    @workflow.run
    async def run(
        self,
        customer_id: Optional[str],
        task_id: int,
        details: dict[str, Any]
    ) -> dict[str, Any]:
        reason = details.get("escalation_reason", "Automated escalation from task")
        result = {"task_id": task_id, "customer_id": customer_id}

        if customer_id:
            # Create escalation alert
            alert_id = await workflow.execute_activity(
                create_escalation_alert_activity,
                args=[customer_id, task_id, reason, "critical"],
                start_to_close_timeout=timedelta(seconds=20),
            )
            result["alert_id"] = alert_id

            # Fetch customer data for context
            customer_data = await workflow.execute_activity(
                fetch_customer_data_activity,
                args=[customer_id],
                start_to_close_timeout=timedelta(seconds=30),
            )
            result["customer_risk_level"] = customer_data.get("risk_level", "unknown")

        # Update task - escalation tasks stay in_progress until manually resolved
        await workflow.execute_activity(
            update_task_status_activity,
            args=[
                task_id,
                "in_progress",
                "Escalation alert created - pending senior review",
                "ESCALATED"
            ],
            start_to_close_timeout=timedelta(seconds=20),
        )

        result["status"] = "escalated"
        return result


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
        if not customer_id:
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
        await workflow.execute_activity(
            update_task_status_activity,
            args=[
                task_id,
                "in_progress",
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


@workflow.defn
class AlertHandlingWorkflow:
    """Workflow to triage and close alerts (legacy)"""

    @workflow.run
    async def run(
        self,
        alert_id: int,
        action: str = "triage",
        resolved_by: Optional[str] = None
    ) -> dict[str, Any]:
        result = {"alert_id": alert_id, "action": action}

        # Mark as in progress
        await workflow.execute_activity(
            update_alert_status_activity,
            args=[alert_id, "in_progress", f"Started: {action}", resolved_by],
            start_to_close_timeout=timedelta(seconds=20),
        )

        # Simulate triage window
        await workflow.sleep(2)

        # Close the alert
        await workflow.execute_activity(
            update_alert_status_activity,
            args=[alert_id, "resolved", f"Completed via action '{action}'", resolved_by],
            start_to_close_timeout=timedelta(seconds=20),
        )

        result["status"] = "resolved"
        return result


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
            action: One of: assign, unassign, start, escalate, hold, resume, resolve, reopen, add_note
            user_id: The user performing the action
            user_role: The user's role (analyst, senior_analyst, manager, admin)
            params: Action-specific parameters
        """
        result = {"alert_id": alert_id, "action": action, "user_id": user_id}

        try:
            if action == "assign":
                assigned_to = params.get("assigned_to", user_id)
                assigned_by = params.get("assigned_by")
                activity_result = await workflow.execute_activity(
                    assign_alert_activity,
                    args=[alert_id, assigned_to, assigned_by],
                    start_to_close_timeout=timedelta(seconds=30),
                )

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

async def run_worker() -> None:
    """Run the Temporal worker"""
    client = await Client.connect(f"{settings.temporal_host}:{settings.temporal_port}")
    worker = Worker(
        client,
        task_queue="aml-tasks",
        workflows=[
            KycRefreshWorkflow,
            SanctionsScreeningWorkflow,
            InvestigationWorkflow,
            DocumentRequestWorkflow,
            EscalationWorkflow,
            SarFilingWorkflow,
            AlertHandlingWorkflow,
            AlertLifecycleWorkflow,
        ],
        activities=[
            # Existing activities
            create_alert_activity,
            schedule_kyc_task_activity,
            # Task management activities
            update_task_status_activity,
            fetch_customer_data_activity,
            create_escalation_alert_activity,
            request_document_activity,
            perform_sar_checks_activity,
            update_alert_status_activity,
            # Alert lifecycle activities
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
        ],
    )
    logger.info("Starting Temporal worker on queue 'aml-tasks'")
    await worker.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
