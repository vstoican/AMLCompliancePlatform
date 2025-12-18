"""
Server-Sent Events (SSE) streaming endpoints for real-time updates
"""
import asyncio
import json
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from .db import connection

router = APIRouter()


async def generate_transaction_stream(conn: AsyncConnection) -> AsyncGenerator[str, None]:
    """
    Generate SSE stream for new transactions
    Polls database every 500ms for new transactions
    Only streams transactions created AFTER the connection is established
    """
    # Start from current max id - only stream NEW transactions
    async with conn.cursor() as cur:
        await cur.execute("SELECT COALESCE(MAX(id), 0) FROM transactions")
        result = await cur.fetchone()
        last_id = result[0] if result else 0

    try:
        while True:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """
                    SELECT
                        t.id,
                        t.surrogate_id,
                        t.person_first_name,
                        t.person_last_name,
                        t.vendor_name,
                        t.amount,
                        t.original_transaction_amount,
                        t.transaction_financial_status,
                        t.client_settlement_status,
                        t.vendor_settlement_status,
                        t.transaction_delivery_status,
                        t.created_at,
                        t.customer_id,
                        c.full_name as customer_name,
                        c.risk_level
                    FROM transactions t
                    LEFT JOIN customers c ON c.id = t.customer_id
                    WHERE t.id > %s
                    ORDER BY t.id ASC
                    LIMIT 50
                    """,
                    (last_id,),
                )

                rows = await cur.fetchall()

                if rows:
                    for row in rows:
                        # Convert to dict and handle types
                        data = dict(row)
                        if data.get("customer_id"):
                            data["customer_id"] = str(data["customer_id"])
                        data["amount"] = float(data["amount"])
                        data["original_transaction_amount"] = float(data["original_transaction_amount"])
                        data["created_at"] = data["created_at"].isoformat()

                        # SSE format: "data: {json}\n\n"
                        yield f"data: {json.dumps(data)}\n\n"
                        last_id = data["id"]

            # Check for new transactions every 500ms
            await asyncio.sleep(0.5)

    except asyncio.CancelledError:
        # Client disconnected
        pass


async def generate_alert_stream(conn: AsyncConnection) -> AsyncGenerator[str, None]:
    """
    Generate SSE stream for new alerts
    Polls database every 500ms for new alerts
    Only streams alerts created AFTER the connection is established
    """
    # Start from current max id - only stream NEW alerts
    async with conn.cursor() as cur:
        await cur.execute("SELECT COALESCE(MAX(id), 0) FROM alerts")
        result = await cur.fetchone()
        last_id = result[0] if result else 0

    try:
        while True:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """
                    SELECT
                        id,
                        customer_id,
                        type,
                        status,
                        severity,
                        scenario,
                        details,
                        alert_definition_id,
                        created_at
                    FROM alerts
                    WHERE id > %s
                    ORDER BY id ASC
                    LIMIT 20
                    """,
                    (last_id,),
                )

                rows = await cur.fetchall()

                if rows:
                    for row in rows:
                        data = dict(row)
                        if data["customer_id"]:
                            data["customer_id"] = str(data["customer_id"])
                        data["created_at"] = data["created_at"].isoformat()

                        yield f"data: {json.dumps(data)}\n\n"
                        last_id = data["id"]

            await asyncio.sleep(0.5)

    except asyncio.CancelledError:
        pass


@router.get("/stream/transactions")
async def stream_transactions(conn: AsyncConnection = Depends(connection)):
    """
    Server-Sent Events endpoint for real-time transaction updates

    Usage:
        const eventSource = new EventSource('http://localhost:8000/stream/transactions');
        eventSource.onmessage = (event) => {
            const transaction = JSON.parse(event.data);
            console.log(transaction);
        };
    """
    return StreamingResponse(
        generate_transaction_stream(conn),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering if behind proxy
        },
    )


@router.get("/stream/alerts")
async def stream_alerts(conn: AsyncConnection = Depends(connection)):
    """
    Server-Sent Events endpoint for real-time alert updates

    Usage:
        const eventSource = new EventSource('http://localhost:8000/stream/alerts');
        eventSource.onmessage = (event) => {
            const alert = JSON.parse(event.data);
            console.log(alert);
        };
    """
    return StreamingResponse(
        generate_alert_stream(conn),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def generate_task_stream(conn: AsyncConnection) -> AsyncGenerator[str, None]:
    """
    Generate SSE stream for task updates
    Polls database every 1 second for updated tasks
    """
    last_updated = datetime.utcnow()

    try:
        while True:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """
                    SELECT t.*,
                           COALESCE(c.first_name || ' ' || c.last_name, c.full_name) as customer_name,
                           c.risk_level as customer_risk_level,
                           a.scenario as alert_scenario,
                           a.severity as alert_severity
                    FROM tasks t
                    LEFT JOIN customers c ON c.id = t.customer_id
                    LEFT JOIN alerts a ON a.id = t.alert_id
                    WHERE t.updated_at > %s
                    ORDER BY t.updated_at ASC
                    LIMIT 20
                    """,
                    (last_updated,),
                )

                rows = await cur.fetchall()

                if rows:
                    for row in rows:
                        data = dict(row)
                        # Convert types for JSON serialization
                        if data.get("customer_id"):
                            data["customer_id"] = str(data["customer_id"])
                        if data.get("created_at"):
                            data["created_at"] = data["created_at"].isoformat()
                        if data.get("updated_at"):
                            data["updated_at"] = data["updated_at"].isoformat()
                        if data.get("due_date"):
                            data["due_date"] = data["due_date"].isoformat()
                        if data.get("claimed_at"):
                            data["claimed_at"] = data["claimed_at"].isoformat()
                        if data.get("completed_at"):
                            data["completed_at"] = data["completed_at"].isoformat()
                        if data.get("details") is None:
                            data["details"] = {}

                        yield f"data: {json.dumps(data)}\n\n"
                        last_updated = row["updated_at"]

            # Check for task updates every second
            await asyncio.sleep(1)

    except asyncio.CancelledError:
        pass


@router.get("/stream/tasks")
async def stream_tasks(conn: AsyncConnection = Depends(connection)):
    """
    Server-Sent Events endpoint for real-time task updates

    Usage:
        const eventSource = new EventSource('http://localhost:8000/stream/tasks');
        eventSource.onmessage = (event) => {
            const task = JSON.parse(event.data);
            console.log(task);
        };
    """
    return StreamingResponse(
        generate_task_stream(conn),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
