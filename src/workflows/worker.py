import asyncio
from datetime import date, timedelta
from typing import Any

from psycopg.rows import dict_row
from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker

from src.api.config import settings
from src.api.db import get_pool


@activity.defn
async def create_alert_activity(customer_id: str, scenario: str, severity: str, details: dict[str, Any]) -> None:
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO alerts (customer_id, type, severity, scenario, details)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (customer_id, "workflow", severity, scenario, details),
        )


@activity.defn
async def schedule_kyc_task_activity(customer_id: str, days_before: int = 30) -> None:
    pool = get_pool()
    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT id_document_expiry FROM customers WHERE id = %s", (customer_id,))
        row = await cur.fetchone()
        if not row or not row["id_document_expiry"]:
            return
        due = row["id_document_expiry"]
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


@workflow.defn
class KycRefreshWorkflow:
    @workflow.run
    async def run(self, customer_id: str, days_before: int = 30) -> None:
        await workflow.execute_activity(
            schedule_kyc_task_activity,
            customer_id,
            days_before,
            start_to_close_timeout=timedelta(seconds=20),
        )


@workflow.defn
class SanctionsScreeningWorkflow:
    @workflow.run
    async def run(self, customer_id: str, hit_detected: bool = False) -> None:
        # In a real setup, call a screening provider. Here we only raise alerts when instructed.
        if hit_detected:
            await workflow.execute_activity(
                create_alert_activity,
                customer_id,
                "sanctions_match",
                "high",
                {"source": "workflow"},
                start_to_close_timeout=timedelta(seconds=20),
            )


async def run_worker() -> None:
    client = await Client.connect(f"{settings.temporal_host}:{settings.temporal_port}")
    worker = Worker(
        client,
        task_queue="aml-tasks",
        workflows=[KycRefreshWorkflow, SanctionsScreeningWorkflow],
        activities=[create_alert_activity, schedule_kyc_task_activity],
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(run_worker())
