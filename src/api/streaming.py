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
    """
    last_id = 0

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
    """
    last_id = 0

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
