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
    """Update alert status/resolution fields in the database"""
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            UPDATE alerts
            SET status = %s,
                resolution_notes = COALESCE(%s, resolution_notes),
                resolved_by = COALESCE(%s, resolved_by),
                resolved_at = CASE WHEN %s IN ('resolved', 'dismissed', 'closed') THEN NOW() ELSE resolved_at END
            WHERE id = %s
            """,
            (status, notes, resolved_by, status, alert_id),
        )
    logger.info(f"Updated alert {alert_id} to status {status}")


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
    """Workflow to triage and close alerts"""

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
            args=[alert_id, "investigating", f"Workflow started: {action}", resolved_by],
            start_to_close_timeout=timedelta(seconds=20),
        )

        # Simulate triage window
        await workflow.sleep(2)

        # Close the alert
        await workflow.execute_activity(
            update_alert_status_activity,
            args=[alert_id, "resolved", f"Workflow completed via action '{action}'", resolved_by],
            start_to_close_timeout=timedelta(seconds=20),
        )

        result["status"] = "resolved"
        return result


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
        ],
    )
    logger.info("Starting Temporal worker on queue 'aml-tasks'")
    await worker.run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
