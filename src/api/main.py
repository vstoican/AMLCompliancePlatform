from datetime import date, datetime, timedelta
from typing import List, Optional
from uuid import UUID

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from .alerts import create_alert
from .config import settings
from .db import connection, get_pool
from .events import publish_event
from .models import (
    Alert,
    AlertUpdate,
    Customer,
    CustomerCreate,
    ReportFilters,
    RiskIndicators,
    TransactionCreate,
)
from .risk import calculate_risk

app = FastAPI(title="AML Compliance MVP", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    get_pool()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    if get_pool():
        await get_pool().close()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow()}


@app.post("/customers", response_model=Customer, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate, conn: AsyncConnection = Depends(connection)
) -> Customer:
    score, level, reasons = calculate_risk(payload.indicators, payload.risk_override)
    query = """
        INSERT INTO customers (full_name, email, country, risk_score, risk_level, risk_override, id_document_expiry, pep_flag, sanctions_hit)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            query,
            (
                payload.full_name,
                payload.email,
                payload.country,
                score,
                level,
                payload.risk_override,
                payload.id_document_expiry,
                payload.indicators.pep_flag,
                payload.indicators.sanctions_hit,
            ),
        )
        customer_row = await cur.fetchone()

    await log_assessment(conn, customer_row["id"], score, level, reasons)
    await publish_event("aml.customer.created", {"customer_id": str(customer_row["id"]), "risk_level": level})

    return Customer(**customer_row)


@app.get("/customers", response_model=List[Customer])
async def list_customers(
    risk_level: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    conn: AsyncConnection = Depends(connection),
) -> List[Customer]:
    clauses = []
    params: list = []
    if risk_level:
        clauses.append("risk_level = %s")
        params.append(risk_level)
    if country:
        clauses.append("country = %s")
        params.append(country)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"SELECT * FROM customers {where} ORDER BY created_at DESC LIMIT %s"
    params.append(limit)

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()
    return [Customer(**row) for row in rows]


@app.get("/customers/{customer_id}", response_model=Customer)
async def get_customer(customer_id: UUID, conn: AsyncConnection = Depends(connection)) -> Customer:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT * FROM customers WHERE id = %s", (customer_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
    return Customer(**row)


@app.post("/customers/{customer_id}/risk/recalculate", response_model=Customer)
async def recalculate_risk(
    customer_id: UUID,
    indicators: RiskIndicators,
    risk_override: Optional[str] = None,
    conn: AsyncConnection = Depends(connection),
) -> Customer:
    score, level, reasons = calculate_risk(indicators, risk_override)
    query = """
        UPDATE customers
        SET risk_score = %s,
            risk_level = %s,
            risk_override = %s,
            pep_flag = %s,
            sanctions_hit = %s
        WHERE id = %s
        RETURNING *
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            query,
            (score, level, risk_override, indicators.pep_flag, indicators.sanctions_hit, customer_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")

    await log_assessment(conn, customer_id, score, level, reasons)
    await publish_event("aml.customer.risk", {"customer_id": str(customer_id), "risk_level": level})
    return Customer(**row)


@app.post("/transactions")
async def ingest_transaction(
    payload: TransactionCreate, conn: AsyncConnection = Depends(connection)
) -> dict:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT id, country, risk_level FROM customers WHERE id = %s", (payload.customer_id,))
        customer = await cur.fetchone()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")

        query = """
            INSERT INTO transactions (customer_id, amount, currency, channel, country, merchant_category, occurred_at, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, occurred_at
        """
        await cur.execute(
            query,
            (
                payload.customer_id,
                payload.amount,
                payload.currency,
                payload.channel,
                payload.country,
                payload.merchant_category,
                payload.occurred_at or datetime.utcnow(),
                payload.metadata,
            ),
        )
        tx = await cur.fetchone()

    await evaluate_transaction(conn, payload, customer)
    await publish_event(
        "aml.transaction.ingested",
        {"transaction_id": tx["id"], "customer_id": str(payload.customer_id), "amount": payload.amount},
    )
    return {"id": tx["id"], "occurred_at": tx["occurred_at"]}


@app.get("/transactions")
async def list_transactions(
    customer_id: Optional[UUID] = Query(None),
    limit: int = Query(100, le=500),
    conn: AsyncConnection = Depends(connection),
) -> List[dict]:
    clauses = []
    params: list = []
    if customer_id:
        clauses.append("customer_id = %s")
        params.append(customer_id)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"""
        SELECT t.*, c.full_name, c.risk_level
        FROM transactions t
        JOIN customers c ON c.id = t.customer_id
        {where}
        ORDER BY occurred_at DESC
        LIMIT %s
    """
    params.append(limit)
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()
    return rows


@app.get("/alerts", response_model=List[Alert])
async def list_alerts(
    status_filter: Optional[str] = Query(None, alias="status"),
    conn: AsyncConnection = Depends(connection),
) -> List[Alert]:
    query = "SELECT * FROM alerts"
    params: list = []
    if status_filter:
        query += " WHERE status = %s"
        params.append(status_filter)
    query += " ORDER BY created_at DESC LIMIT 100"

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()
    return [Alert(**row) for row in rows]


@app.patch("/alerts/{alert_id}", response_model=Alert)
async def update_alert(
    alert_id: int, payload: AlertUpdate, conn: AsyncConnection = Depends(connection)
) -> Alert:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT * FROM alerts WHERE id = %s", (alert_id,))
        existing = await cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Alert not found")

        await cur.execute(
            """
            UPDATE alerts
            SET status = COALESCE(%s, status),
                resolution_notes = COALESCE(%s, resolution_notes),
                resolved_by = COALESCE(%s, resolved_by),
                resolved_at = CASE WHEN %s IS NOT NULL THEN NOW() ELSE resolved_at END
            WHERE id = %s
            RETURNING *
            """,
            (payload.status, payload.resolution_notes, payload.resolved_by, payload.status, alert_id),
        )
        row = await cur.fetchone()
    return Alert(**row)


@app.post("/kyc/run")
async def run_kyc_checks(
    days_before_expiry: int = 30, conn: AsyncConnection = Depends(connection)
) -> dict:
    upcoming = date.today() + timedelta(days=days_before_expiry)
    query = """
        INSERT INTO kyc_tasks (customer_id, due_date, reason)
        SELECT id, id_document_expiry, 'Document expiry approaching'
        FROM customers
        WHERE id_document_expiry IS NOT NULL
          AND id_document_expiry <= %s
        ON CONFLICT DO NOTHING
        RETURNING id, customer_id
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, (upcoming,))
        rows = await cur.fetchall()
    await publish_event("aml.kyc.tasks.created", {"count": len(rows)})
    return {"tasks_created": len(rows)}


@app.get("/kyc/tasks")
async def list_kyc_tasks(conn: AsyncConnection = Depends(connection)) -> List[dict]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM kyc_tasks ORDER BY due_date ASC LIMIT 100",
        )
        rows = await cur.fetchall()
    return rows


@app.get("/reports/high-risk")
async def high_risk_report(conn: AsyncConnection = Depends(connection)) -> List[dict]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id, full_name, email, risk_score, risk_level, country FROM customers WHERE risk_level = 'high'"
        )
        return await cur.fetchall()


@app.post("/reports/alerts")
async def alert_report(filters: ReportFilters, conn: AsyncConnection = Depends(connection)) -> List[dict]:
    clauses = []
    params: list = []
    if filters.from_date:
        clauses.append("created_at >= %s")
        params.append(datetime.combine(filters.from_date, datetime.min.time()))
    if filters.to_date:
        clauses.append("created_at <= %s")
        params.append(datetime.combine(filters.to_date, datetime.max.time()))
    if filters.scenario:
        clauses.append("scenario = %s")
        params.append(filters.scenario)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"SELECT * FROM alerts {where} ORDER BY created_at DESC LIMIT 500"
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()
    return rows


async def log_assessment(
    conn: AsyncConnection, customer_id: UUID, score: float, level: str, reasons: List[str]
) -> None:
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO risk_assessments (customer_id, base_score, adjusted_score, risk_level, reason)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (customer_id, score, score, level, "; ".join(reasons)),
        )


async def evaluate_transaction(
    conn: AsyncConnection, payload: TransactionCreate, customer: dict
) -> None:
    scenarios: list[tuple[str, str, str, dict]] = []

    if payload.amount >= 10000:
        scenarios.append(
            ("transaction_monitoring", "high", "large_transaction", {"amount": payload.amount})
        )
    if payload.country and payload.country != customer.get("country"):
        scenarios.append(
            ("transaction_monitoring", "medium", "geography_mismatch", {"country": payload.country})
        )
    if customer.get("risk_level") == "high":
        scenarios.append(
            ("transaction_monitoring", "high", "high_risk_customer_activity", {"risk": "high"})
        )

    for alert_type, severity, scenario, details in scenarios:
        await create_alert(conn, payload.customer_id, alert_type, severity, scenario, details)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
