from datetime import date, datetime, timedelta
from typing import List, Optional
from uuid import UUID
import json
import logging

import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from temporalio.client import Client as TemporalClient

from .config import settings
from .db import connection, get_pool
from .events import publish_event, connect_jetstream, close_jetstream
from .models import (
    AlertDefinition,
    AlertDefinitionCreate,
    AlertDefinitionUpdate,
    Customer,
    CustomerCreate,
    ReportFilters,
    RiskIndicators,
    TransactionCreate,
)
from .risk import calculate_risk
from .auth import router as auth_router
from .streaming import router as streaming_router
from .tasks import router as tasks_router, definition_router as task_definitions_router
from .users import router as users_router
from .alerts import router as alerts_router
from .ai_assistant import router as ai_router

app = FastAPI(title="AML Compliance MVP", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register authentication router
app.include_router(auth_router)

# Register SSE streaming router
app.include_router(streaming_router)

# Register task management routers
app.include_router(tasks_router)
app.include_router(task_definitions_router)

# Register user management router
app.include_router(users_router)

# Register alert lifecycle router
app.include_router(alerts_router)

# Register AI assistant router
app.include_router(ai_router)

# Global Temporal client
temporal_client: Optional[TemporalClient] = None


@app.on_event("startup")
async def startup_event() -> None:
    """Initialize connections on startup"""
    global temporal_client

    # Initialize database pool
    get_pool()

    # Initialize JetStream connection
    await connect_jetstream()

    # Initialize Temporal client
    try:
        temporal_client = await TemporalClient.connect(
            f"{settings.temporal_host}:{settings.temporal_port}"
        )
        logging.info("Connected to Temporal server")
    except Exception as e:
        logging.error(f"Failed to connect to Temporal: {e}")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """Gracefully close connections on shutdown"""
    # Close JetStream connection
    await close_jetstream()

    # Close Temporal client
    if temporal_client:
        await temporal_client.close()

    # Close database pool
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
    full_name = f"{payload.first_name} {payload.last_name}".strip()

    query = """
        INSERT INTO customers (
            member_id, first_name, last_name, full_name, phone_number, status, email,
            birth_date, identity_number, place_of_birth, country_of_birth,
            address_county, address_city, address_street, address_house_number,
            address_block_number, address_entrance, address_apartment,
            employer_name,
            document_type, document_id, document_issuer, document_date_of_expire, document_date_of_issue,
            leanpay_monthly_repayment, available_monthly_credit_limit, available_exposure,
            data_validated, marketing_consent, kyc_motion_consent_given,
            risk_score, risk_level, risk_override, pep_flag, sanctions_hit,
            geography_risk, product_risk, behavior_risk,
            application_time
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s,
            %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s,
            NOW()
        )
        RETURNING *
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            query,
            (
                payload.member_id,
                payload.first_name,
                payload.last_name,
                full_name,
                payload.phone_number,
                payload.status,
                payload.email,
                payload.birth_date,
                payload.identity_number,
                payload.place_of_birth,
                payload.country_of_birth,
                payload.address_county,
                payload.address_city,
                payload.address_street,
                payload.address_house_number,
                payload.address_block_number,
                payload.address_entrance,
                payload.address_apartment,
                payload.employer_name,
                payload.document_type,
                payload.document_id,
                payload.document_issuer,
                payload.document_date_of_expire,
                payload.document_date_of_issue,
                payload.leanpay_monthly_repayment,
                payload.available_monthly_credit_limit,
                payload.available_exposure,
                payload.data_validated,
                payload.marketing_consent,
                payload.kyc_motion_consent_given,
                score,
                level,
                payload.risk_override,
                payload.indicators.pep_flag,
                payload.indicators.sanctions_hit,
                payload.indicators.geography_risk,
                payload.indicators.product_risk,
                payload.indicators.behavior_risk,
            ),
        )
        customer_row = await cur.fetchone()

    await log_assessment(conn, customer_row["id"], score, level, reasons)
    await publish_event("aml.customer.created", {"customer_id": str(customer_row["id"]), "risk_level": level})

    return Customer(**customer_row)


@app.get("/customers", response_model=List[Customer])
async def list_customers(
    risk_level: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    data_validated: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    conn: AsyncConnection = Depends(connection),
) -> List[Customer]:
    clauses = []
    params: list = []
    if risk_level:
        clauses.append("risk_level = %s")
        params.append(risk_level)
    if status:
        clauses.append("status = %s")
        params.append(status)
    if data_validated:
        clauses.append("data_validated = %s")
        params.append(data_validated)
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


@app.patch("/customers/{customer_id}", response_model=Customer)
async def update_customer(
    customer_id: UUID,
    payload: CustomerCreate,
    conn: AsyncConnection = Depends(connection),
) -> Customer:
    score, level, reasons = calculate_risk(payload.indicators, payload.risk_override)
    full_name = f"{payload.first_name} {payload.last_name}".strip()

    query = """
        UPDATE customers
        SET member_id = %s,
            first_name = %s,
            last_name = %s,
            full_name = %s,
            phone_number = %s,
            status = %s,
            email = %s,
            birth_date = %s,
            identity_number = %s,
            place_of_birth = %s,
            country_of_birth = %s,
            address_county = %s,
            address_city = %s,
            address_street = %s,
            address_house_number = %s,
            address_block_number = %s,
            address_entrance = %s,
            address_apartment = %s,
            employer_name = %s,
            document_type = %s,
            document_id = %s,
            document_issuer = %s,
            document_date_of_expire = %s,
            document_date_of_issue = %s,
            leanpay_monthly_repayment = %s,
            available_monthly_credit_limit = %s,
            available_exposure = %s,
            limit_exposure_last_update = NOW(),
            data_validated = %s,
            marketing_consent = %s,
            marketing_consent_last_modified = NOW(),
            kyc_motion_consent_given = %s,
            risk_score = %s,
            risk_level = %s,
            risk_override = %s,
            pep_flag = %s,
            sanctions_hit = %s,
            geography_risk = %s,
            product_risk = %s,
            behavior_risk = %s
        WHERE id = %s
        RETURNING *
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            query,
            (
                payload.member_id,
                payload.first_name,
                payload.last_name,
                full_name,
                payload.phone_number,
                payload.status,
                payload.email,
                payload.birth_date,
                payload.identity_number,
                payload.place_of_birth,
                payload.country_of_birth,
                payload.address_county,
                payload.address_city,
                payload.address_street,
                payload.address_house_number,
                payload.address_block_number,
                payload.address_entrance,
                payload.address_apartment,
                payload.employer_name,
                payload.document_type,
                payload.document_id,
                payload.document_issuer,
                payload.document_date_of_expire,
                payload.document_date_of_issue,
                payload.leanpay_monthly_repayment,
                payload.available_monthly_credit_limit,
                payload.available_exposure,
                payload.data_validated,
                payload.marketing_consent,
                payload.kyc_motion_consent_given,
                score,
                level,
                payload.risk_override,
                payload.indicators.pep_flag,
                payload.indicators.sanctions_hit,
                payload.indicators.geography_risk,
                payload.indicators.product_risk,
                payload.indicators.behavior_risk,
                customer_id,
            ),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")

    await log_assessment(conn, customer_id, score, level, reasons)
    await publish_event("aml.customer.updated", {"customer_id": str(customer_id), "risk_level": level})
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
    payload: TransactionCreate,
    sync: bool = Query(False, description="Write directly to DB instead of async via NATS"),
    conn: AsyncConnection = Depends(connection),
) -> dict:
    """
    Ingest a transaction.

    By default (sync=False), publishes to NATS for async processing by the consumer.
    This provides higher throughput as the API returns immediately.

    With sync=True, writes directly to the database (lower throughput, immediate consistency).
    """
    if sync:
        # Synchronous mode: write directly to database
        async with conn.cursor(row_factory=dict_row) as cur:
            query = """
                INSERT INTO transactions (
                    surrogate_id, person_first_name, person_last_name, vendor_name,
                    price_number_of_months, grace_number_of_months,
                    original_transaction_amount, amount, vendor_transaction_id,
                    client_settlement_status, vendor_settlement_status,
                    transaction_delivery_status, partial_delivery,
                    transaction_last_activity, transaction_financial_status, customer_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, created_at
            """
            await cur.execute(
                query,
                (
                    payload.surrogate_id,
                    payload.person_first_name,
                    payload.person_last_name,
                    payload.vendor_name,
                    payload.price_number_of_months,
                    payload.grace_number_of_months,
                    payload.original_transaction_amount,
                    payload.amount,
                    payload.vendor_transaction_id,
                    payload.client_settlement_status,
                    payload.vendor_settlement_status,
                    payload.transaction_delivery_status,
                    payload.partial_delivery,
                    payload.transaction_last_activity,
                    payload.transaction_financial_status,
                    payload.customer_id,
                ),
            )
            tx = await cur.fetchone()

        await publish_event(
            "aml.transaction.ingested",
            {"transaction_id": tx["id"], "surrogate_id": payload.surrogate_id, "amount": payload.amount},
        )
        return {"id": tx["id"], "created_at": tx["created_at"], "mode": "sync"}

    else:
        # Async mode: publish to NATS for consumer to process
        tx_data = {
            "surrogate_id": payload.surrogate_id,
            "person_first_name": payload.person_first_name,
            "person_last_name": payload.person_last_name,
            "vendor_name": payload.vendor_name,
            "price_number_of_months": payload.price_number_of_months,
            "grace_number_of_months": payload.grace_number_of_months,
            "original_transaction_amount": float(payload.original_transaction_amount) if payload.original_transaction_amount else None,
            "amount": float(payload.amount) if payload.amount else None,
            "vendor_transaction_id": payload.vendor_transaction_id,
            "client_settlement_status": payload.client_settlement_status,
            "vendor_settlement_status": payload.vendor_settlement_status,
            "transaction_delivery_status": payload.transaction_delivery_status,
            "partial_delivery": payload.partial_delivery,
            "transaction_last_activity": payload.transaction_last_activity,
            "transaction_financial_status": payload.transaction_financial_status,
            "customer_id": str(payload.customer_id) if payload.customer_id else None,
        }

        success = await publish_event("aml.transaction.ingest", tx_data)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Failed to queue transaction for processing"
            )

        return {
            "surrogate_id": payload.surrogate_id,
            "status": "queued",
            "mode": "async",
            "message": "Transaction queued for processing"
        }


@app.post("/transactions/batch")
async def ingest_transactions_batch(
    transactions: List[TransactionCreate],
) -> dict:
    """
    Ingest multiple transactions in a single request (async mode only).
    Reduces HTTP overhead for high-volume ingestion.
    Max 1000 transactions per batch.
    """
    if len(transactions) > 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 1000 transactions per batch"
        )

    # Publish all transactions to NATS
    success_count = 0
    failed_count = 0

    for payload in transactions:
        tx_data = {
            "surrogate_id": payload.surrogate_id,
            "person_first_name": payload.person_first_name,
            "person_last_name": payload.person_last_name,
            "vendor_name": payload.vendor_name,
            "price_number_of_months": payload.price_number_of_months,
            "grace_number_of_months": payload.grace_number_of_months,
            "original_transaction_amount": float(payload.original_transaction_amount) if payload.original_transaction_amount else None,
            "amount": float(payload.amount) if payload.amount else None,
            "vendor_transaction_id": payload.vendor_transaction_id,
            "client_settlement_status": payload.client_settlement_status,
            "vendor_settlement_status": payload.vendor_settlement_status,
            "transaction_delivery_status": payload.transaction_delivery_status,
            "partial_delivery": payload.partial_delivery,
            "transaction_last_activity": payload.transaction_last_activity,
            "transaction_financial_status": payload.transaction_financial_status,
            "customer_id": str(payload.customer_id) if payload.customer_id else None,
        }

        if await publish_event("aml.transaction.ingest", tx_data):
            success_count += 1
        else:
            failed_count += 1

    return {
        "queued": success_count,
        "failed": failed_count,
        "total": len(transactions),
        "mode": "async"
    }


@app.get("/transactions")
async def list_transactions(
    customer_id: Optional[UUID] = Query(None),
    financial_status: Optional[str] = Query(None),
    settlement_status: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Search by surrogate_id, name, or vendor"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    conn: AsyncConnection = Depends(connection),
):
    """
    List transactions with pagination.
    Returns {transactions: [...], total: N, limit: N, offset: N, has_more: bool}
    """
    clauses = []
    params: list = []

    if customer_id:
        clauses.append("t.customer_id = %s")
        params.append(customer_id)
    if financial_status:
        clauses.append("t.transaction_financial_status = %s")
        params.append(financial_status)
    if settlement_status:
        clauses.append("(t.client_settlement_status = %s OR t.vendor_settlement_status = %s)")
        params.extend([settlement_status, settlement_status])
    if search:
        clauses.append("""(
            t.surrogate_id ILIKE %s OR
            t.person_first_name ILIKE %s OR
            t.person_last_name ILIKE %s OR
            t.vendor_name ILIKE %s
        )""")
        search_pattern = f"%{search}%"
        params.extend([search_pattern, search_pattern, search_pattern, search_pattern])

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    # Copy params for count query (before adding limit/offset)
    count_params = params.copy()

    # Get total count - use TimescaleDB approximate_row_count for speed
    async with conn.cursor(row_factory=dict_row) as cur:
        if not clauses:
            # For unfiltered queries, use TimescaleDB approximate count
            try:
                await cur.execute("SELECT approximate_row_count('transactions') as count")
                count_row = await cur.fetchone()
                total = count_row["count"] if count_row and count_row["count"] else 0
            except Exception:
                # Fallback to exact count if approximate fails
                await cur.execute("SELECT COUNT(*) as count FROM transactions t")
                count_row = await cur.fetchone()
                total = count_row["count"] if count_row else 0
        else:
            # For filtered queries, need exact count
            count_query = f"SELECT COUNT(*) as count FROM transactions t {where}"
            await cur.execute(count_query, count_params)
            count_row = await cur.fetchone()
            total = count_row["count"] if count_row else 0

    # Get paginated results
    query = f"""
        SELECT t.*, c.full_name as customer_name, c.risk_level
        FROM transactions t
        LEFT JOIN customers c ON c.id = t.customer_id
        {where}
        ORDER BY t.created_at DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    # Convert rows to JSON-serializable format
    serialized_rows = []
    for row in rows:
        data = dict(row)
        if "customer_id" in data and data["customer_id"]:
            data["customer_id"] = str(data["customer_id"])
        if "id" in data and data["id"]:
            data["id"] = int(data["id"])
        if "amount" in data and data["amount"]:
            data["amount"] = float(data["amount"])
        if "original_transaction_amount" in data and data["original_transaction_amount"]:
            data["original_transaction_amount"] = float(data["original_transaction_amount"])
        if "created_at" in data and data["created_at"]:
            data["created_at"] = data["created_at"].isoformat()
        serialized_rows.append(data)

    return JSONResponse(
        content={
            "transactions": serialized_rows,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(serialized_rows) < total,
        },
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/alert-definitions", response_model=List[AlertDefinition])
async def list_alert_definitions(conn: AsyncConnection = Depends(connection)) -> List[AlertDefinition]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT * FROM alert_definitions ORDER BY id")
        rows = await cur.fetchall()
    return [AlertDefinition(**row) for row in rows]


@app.post("/alert-definitions", response_model=AlertDefinition, status_code=status.HTTP_201_CREATED)
async def create_alert_definition(
    payload: AlertDefinitionCreate, conn: AsyncConnection = Depends(connection)
) -> AlertDefinition:
    # Check if code already exists
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT id FROM alert_definitions WHERE code = %s", (payload.code,))
        if await cur.fetchone():
            raise HTTPException(status_code=400, detail="Alert definition with this code already exists")

    query = """
        INSERT INTO alert_definitions
        (code, name, description, category, enabled, severity, threshold_amount,
         window_minutes, channels, country_scope, direction, is_system_default)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    params = (
        payload.code,
        payload.name,
        payload.description,
        payload.category,
        payload.enabled,
        payload.severity,
        payload.threshold_amount,
        payload.window_minutes,
        payload.channels,
        payload.country_scope,
        payload.direction,
        False,  # User-created alerts are never system defaults
    )
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        row = await cur.fetchone()
    return AlertDefinition(**row)


@app.patch("/alert-definitions/{definition_id}", response_model=AlertDefinition)
async def update_alert_definition(
    definition_id: int, payload: AlertDefinitionUpdate, conn: AsyncConnection = Depends(connection)
) -> AlertDefinition:
    updates = {k: v for k, v in payload.dict(exclude_none=True).items()}
    if not updates:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT * FROM alert_definitions WHERE id = %s", (definition_id,))
            row = await cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Alert definition not found")
            return AlertDefinition(**row)

    set_clause = ", ".join(f"{field} = %s" for field in updates.keys())
    params = list(updates.values()) + [definition_id]
    query = f"""
        UPDATE alert_definitions
        SET {set_clause}
        WHERE id = %s
        RETURNING *
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Alert definition not found")
    return AlertDefinition(**row)


@app.delete("/alert-definitions/{definition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_definition(
    definition_id: int, conn: AsyncConnection = Depends(connection)
) -> None:
    # Check if alert definition exists and is not a system default
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT is_system_default FROM alert_definitions WHERE id = %s", (definition_id,)
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Alert definition not found")
        if row["is_system_default"]:
            raise HTTPException(status_code=403, detail="Cannot delete system default alert definitions")

    async with conn.cursor() as cur:
        await cur.execute("DELETE FROM alert_definitions WHERE id = %s", (definition_id,))


# NOTE: Alert CRUD and lifecycle endpoints moved to alerts.py router


@app.post("/kyc/run")
async def run_kyc_checks(
    days_before_expiry: int = 365, conn: AsyncConnection = Depends(connection)
) -> dict:
    upcoming = date.today() + timedelta(days=days_before_expiry)
    query = """
        INSERT INTO kyc_tasks (customer_id, due_date, reason)
        SELECT id, document_date_of_expire, 'Document expiry approaching'
        FROM customers
        WHERE document_date_of_expire IS NOT NULL
          AND document_date_of_expire <= %s
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
            """SELECT id, member_id, first_name, last_name, full_name, email,
                      risk_score, risk_level, country_of_birth, status, data_validated
               FROM customers WHERE risk_level = 'high'"""
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


# ========================================
# Temporal Workflow Endpoints
# ========================================

@app.get("/workflows")
async def list_workflows() -> List[dict]:
    """List all workflow executions"""
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not connected")

    try:
        workflows = []
        async for workflow in temporal_client.list_workflows():
            workflows.append({
                "workflow_id": workflow.id,
                "run_id": workflow.run_id,
                "workflow_type": workflow.workflow_type,
                "status": workflow.status.name,
                "start_time": workflow.start_time.isoformat() if workflow.start_time else None,
                "close_time": workflow.close_time.isoformat() if workflow.close_time else None,
                "execution_time": workflow.execution_time.isoformat() if workflow.execution_time else None,
            })

        return workflows
    except Exception as e:
        logging.error(f"Error listing workflows: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/workflows/kyc-refresh/start")
async def start_kyc_workflow(customer_id: UUID, days_before: int = 365) -> dict:
    """Start a KYC refresh workflow for a customer"""
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not connected")

    try:
        from src.workflows.worker import KycRefreshWorkflow

        handle = await temporal_client.start_workflow(
            KycRefreshWorkflow.run,
            args=[str(customer_id), days_before],
            id=f"kyc-refresh-{customer_id}-{datetime.utcnow().timestamp()}",
            task_queue="aml-tasks",
        )

        return {
            "workflow_id": handle.id,
            "run_id": handle.result_run_id,
            "workflow_type": "KycRefreshWorkflow",
            "status": "RUNNING"
        }
    except Exception as e:
        logging.error(f"Error starting KYC workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/workflows/sanctions-screening/start")
async def start_sanctions_workflow(customer_id: UUID, hit_detected: bool = False) -> dict:
    """Start a sanctions screening workflow for a customer"""
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not connected")

    try:
        from src.workflows.worker import SanctionsScreeningWorkflow

        handle = await temporal_client.start_workflow(
            SanctionsScreeningWorkflow.run,
            args=[str(customer_id), hit_detected],
            id=f"sanctions-screening-{customer_id}-{datetime.utcnow().timestamp()}",
            task_queue="aml-tasks",
        )

        return {
            "workflow_id": handle.id,
            "run_id": handle.result_run_id,
            "workflow_type": "SanctionsScreeningWorkflow",
            "status": "RUNNING"
        }
    except Exception as e:
        logging.error(f"Error starting sanctions workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/workflows/alert-handling/start")
async def start_alert_workflow(
    alert_id: int,
    action: str = "triage",
    resolved_by: Optional[str] = None,
    conn: AsyncConnection = Depends(connection),
) -> dict:
    """Start an alert handling workflow for a specific alert"""
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not connected")

    try:
        from src.workflows.worker import AlertHandlingWorkflow, InvestigationWorkflow

        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT * FROM alerts WHERE id = %s", (alert_id,))
            alert = await cur.fetchone()
            if not alert:
                raise HTTPException(status_code=404, detail="Alert not found")

            # Mark alert as investigating
            await cur.execute(
                """
                UPDATE alerts
                SET status = 'investigating'
                WHERE id = %s
                """,
                (alert_id,),
            )

            # Reuse existing investigation task for this alert if it exists
            await cur.execute(
                """
                SELECT * FROM tasks
                WHERE alert_id = %s
                  AND task_type = 'investigation'
                  AND status IN ('pending', 'in_progress')
                LIMIT 1
                """,
                (alert_id,),
            )
            task = await cur.fetchone()

            if not task:
                priority = {
                    "critical": "critical",
                    "high": "high",
                    "medium": "medium",
                    "low": "low",
                }.get((alert.get("severity") or "").lower(), "medium")

                title = f"Investigate alert {alert_id}"
                description = alert.get("scenario") or "Investigate triggered alert"
                details = Jsonb({
                    "alert_id": alert_id,
                    "action": action,
                    "scenario": alert.get("scenario"),
                    "severity": alert.get("severity"),
                    "source": "alert-handling",
                })

                await cur.execute(
                    """
                    INSERT INTO tasks (
                        customer_id, alert_id, task_type, priority,
                        title, description, details, created_by
                    )
                    VALUES (%s, %s, 'investigation', %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        alert.get("customer_id"),
                        alert_id,
                        priority,
                        title,
                        description,
                        details,
                        resolved_by or "system",
                    ),
                )
                task = await cur.fetchone()

            workflow_id = f"alert-{alert_id}-investigation-{datetime.utcnow().timestamp()}"

            # Start investigation workflow tied to the task
            handle = await temporal_client.start_workflow(
                InvestigationWorkflow.run,
                args=[
                    str(task["customer_id"]) if task["customer_id"] else None,
                    task["id"],
                    dict(task["details"]) if task["details"] else {}
                ],
                id=workflow_id,
                task_queue="aml-tasks",
            )

            # Update task with workflow info
            await cur.execute(
                """
                UPDATE tasks
                SET workflow_id = %s,
                    workflow_run_id = %s,
                    workflow_status = 'RUNNING'
                WHERE id = %s
                """,
                (handle.id, handle.result_run_id, task["id"]),
            )

            return {
                "workflow_id": handle.id,
                "run_id": handle.result_run_id,
                "workflow_type": "InvestigationWorkflow",
                "status": "RUNNING",
                "task_id": task["id"],
            }
    except Exception as e:
        logging.error(f"Error starting alert workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/workflows/{workflow_id}/{run_id}")
async def get_workflow_details(workflow_id: str, run_id: str) -> dict:
    """Get details about a specific workflow execution"""
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not connected")

    try:
        handle = temporal_client.get_workflow_handle(workflow_id, run_id=run_id)
        desc = await handle.describe()

        return {
            "workflow_id": desc.id,
            "run_id": desc.run_id,
            "workflow_type": desc.workflow_type,
            "status": desc.status.name,
            "start_time": desc.start_time.isoformat() if desc.start_time else None,
            "close_time": desc.close_time.isoformat() if desc.close_time else None,
            "execution_time": desc.execution_time.isoformat() if desc.execution_time else None,
            "task_queue": desc.task_queue,
        }
    except Exception as e:
        logging.error(f"Error getting workflow details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/workflows/{workflow_id}/{run_id}/cancel")
async def cancel_workflow(workflow_id: str, run_id: str) -> dict:
    """Cancel a running workflow"""
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not connected")

    try:
        handle = temporal_client.get_workflow_handle(workflow_id, run_id=run_id)
        await handle.cancel()

        return {
            "workflow_id": workflow_id,
            "run_id": run_id,
            "status": "CANCELLED"
        }
    except Exception as e:
        logging.error(f"Error canceling workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
