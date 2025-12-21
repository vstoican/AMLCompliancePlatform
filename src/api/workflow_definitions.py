"""
Workflow Definitions API Router

CRUD operations for workflow definitions and manual execution.
"""
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from temporalio.client import Client

from src.api.config import settings
from src.api.db import get_pool
from src.api.models import (
    WORKFLOW_TYPES,
    SCHEDULE_TYPES,
    WorkflowDefinition,
    WorkflowDefinitionCreate,
    WorkflowDefinitionUpdate,
    WorkflowExecution,
    WorkflowRunRequest,
)
from src.api.workflow_scheduler import (
    create_or_update_schedule,
    delete_schedule,
    pause_schedule,
    unpause_schedule,
    trigger_schedule,
    get_schedule_info,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflow-definitions", tags=["workflow-definitions"])

# Temporal client singleton
_temporal_client: Optional[Client] = None


async def get_temporal_client() -> Optional[Client]:
    """Get or create Temporal client singleton"""
    global _temporal_client
    if _temporal_client is None:
        try:
            _temporal_client = await Client.connect(
                f"{settings.temporal_host}:{settings.temporal_port}"
            )
        except Exception as e:
            logger.warning(f"Failed to connect to Temporal: {e}")
            return None
    return _temporal_client


# =============================================================================
# LIST & GET WORKFLOW DEFINITIONS
# =============================================================================

@router.get("", response_model=list[WorkflowDefinition])
async def list_workflow_definitions(
    enabled_only: bool = Query(False, description="Filter to only enabled definitions"),
    workflow_type: Optional[str] = Query(None, description="Filter by workflow type"),
    schedule_type: Optional[str] = Query(None, description="Filter by schedule type"),
):
    """List all workflow definitions"""
    pool = get_pool()

    conditions = []
    params = []

    if enabled_only:
        conditions.append("enabled = TRUE")

    if workflow_type:
        if workflow_type not in WORKFLOW_TYPES:
            raise HTTPException(400, f"Invalid workflow_type. Must be one of: {WORKFLOW_TYPES}")
        conditions.append("workflow_type = %s")
        params.append(workflow_type)

    if schedule_type:
        if schedule_type not in SCHEDULE_TYPES:
            raise HTTPException(400, f"Invalid schedule_type. Must be one of: {SCHEDULE_TYPES}")
        conditions.append("schedule_type = %s")
        params.append(schedule_type)

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            f"""
            SELECT * FROM workflow_definitions
            WHERE {where_clause}
            ORDER BY is_system_default DESC, name ASC
            """,
            params,
        )
        rows = await cur.fetchall()
        return [WorkflowDefinition(**row) for row in rows]


# =============================================================================
# SCHEDULE SYNC (must be before /{definition_id} routes to avoid path conflicts)
# =============================================================================

@router.post("/schedules/sync")
async def sync_all_workflow_schedules():
    """
    Synchronize all cron-based workflow definitions with Temporal Schedules.
    Call this after startup or when schedules may be out of sync.
    """
    from src.api.workflow_scheduler import sync_all_schedules
    return await sync_all_schedules()


# =============================================================================
# GET SINGLE WORKFLOW DEFINITION
# =============================================================================

@router.get("/{definition_id}", response_model=WorkflowDefinition)
async def get_workflow_definition(definition_id: int):
    """Get a single workflow definition by ID"""
    pool = get_pool()

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM workflow_definitions WHERE id = %s",
            (definition_id,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Workflow definition not found")
        return WorkflowDefinition(**row)


# =============================================================================
# CREATE WORKFLOW DEFINITION
# =============================================================================

@router.post("", response_model=WorkflowDefinition, status_code=201)
async def create_workflow_definition(data: WorkflowDefinitionCreate):
    """Create a new workflow definition"""
    pool = get_pool()

    # Validate workflow_type
    if data.workflow_type not in WORKFLOW_TYPES:
        raise HTTPException(400, f"Invalid workflow_type. Must be one of: {WORKFLOW_TYPES}")

    # Validate schedule_type
    if data.schedule_type not in SCHEDULE_TYPES:
        raise HTTPException(400, f"Invalid schedule_type. Must be one of: {SCHEDULE_TYPES}")

    # Validate cron_expression is provided for cron schedule
    if data.schedule_type == "cron" and not data.cron_expression:
        raise HTTPException(400, "cron_expression is required for cron schedule type")

    # Validate trigger_event is provided for event schedule
    if data.schedule_type == "event" and not data.trigger_event:
        raise HTTPException(400, "trigger_event is required for event schedule type")

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Check for duplicate code
        await cur.execute(
            "SELECT id FROM workflow_definitions WHERE code = %s",
            (data.code,),
        )
        if await cur.fetchone():
            raise HTTPException(400, f"Workflow definition with code '{data.code}' already exists")

        # Insert new definition
        await cur.execute(
            """
            INSERT INTO workflow_definitions (
                code, name, description, workflow_type,
                schedule_type, cron_expression, trigger_event,
                parameters, create_alert, alert_severity,
                create_task, task_type, task_priority,
                timeout_seconds, retry_max_attempts, retry_backoff_seconds,
                enabled
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s
            )
            RETURNING *
            """,
            (
                data.code, data.name, data.description, data.workflow_type,
                data.schedule_type, data.cron_expression, data.trigger_event,
                Jsonb(data.parameters), data.create_alert, data.alert_severity,
                data.create_task, data.task_type, data.task_priority,
                data.timeout_seconds, data.retry_max_attempts, data.retry_backoff_seconds,
                data.enabled,
            ),
        )
        row = await cur.fetchone()
        await conn.commit()

        logger.info(f"Created workflow definition: {data.code}")

        # Sync with Temporal Schedule if cron-based
        if data.schedule_type == "cron" and data.cron_expression:
            schedule_result = await create_or_update_schedule(
                definition_id=row["id"],
                definition_code=data.code,
                workflow_type=data.workflow_type,
                cron_expression=data.cron_expression,
                parameters=data.parameters,
                enabled=data.enabled,
                timeout_seconds=data.timeout_seconds,
            )
            logger.info(f"Schedule sync result for {data.code}: {schedule_result}")

        return WorkflowDefinition(**row)


# =============================================================================
# UPDATE WORKFLOW DEFINITION
# =============================================================================

@router.patch("/{definition_id}", response_model=WorkflowDefinition)
async def update_workflow_definition(definition_id: int, data: WorkflowDefinitionUpdate):
    """Update a workflow definition (partial update)"""
    pool = get_pool()

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Get existing definition
        await cur.execute(
            "SELECT * FROM workflow_definitions WHERE id = %s",
            (definition_id,),
        )
        existing = await cur.fetchone()
        if not existing:
            raise HTTPException(404, "Workflow definition not found")

        # Build update query dynamically
        updates = []
        params = []

        update_data = data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            if field == "parameters" and value is not None:
                updates.append(f"{field} = %s")
                params.append(Jsonb(value))
            else:
                updates.append(f"{field} = %s")
                params.append(value)

        if not updates:
            # No fields to update, return existing
            return WorkflowDefinition(**existing)

        params.append(definition_id)

        await cur.execute(
            f"""
            UPDATE workflow_definitions
            SET {", ".join(updates)}
            WHERE id = %s
            RETURNING *
            """,
            params,
        )
        row = await cur.fetchone()
        await conn.commit()

        logger.info(f"Updated workflow definition: {existing['code']}")

        # Sync with Temporal Schedule if cron-based
        if row["schedule_type"] == "cron" and row["cron_expression"]:
            schedule_result = await create_or_update_schedule(
                definition_id=row["id"],
                definition_code=row["code"],
                workflow_type=row["workflow_type"],
                cron_expression=row["cron_expression"],
                parameters=row["parameters"] or {},
                enabled=row["enabled"],
                timeout_seconds=row["timeout_seconds"] or 3600,
            )
            logger.info(f"Schedule sync result for {row['code']}: {schedule_result}")
        elif existing["schedule_type"] == "cron" and row["schedule_type"] != "cron":
            # Schedule type changed from cron to something else - delete the schedule
            await delete_schedule(existing["code"])
            logger.info(f"Deleted schedule for {existing['code']} (no longer cron-based)")

        return WorkflowDefinition(**row)


# =============================================================================
# DELETE WORKFLOW DEFINITION
# =============================================================================

@router.delete("/{definition_id}", status_code=204)
async def delete_workflow_definition(definition_id: int):
    """Delete a workflow definition (cannot delete system defaults)"""
    pool = get_pool()

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Check if exists and is not system default
        await cur.execute(
            "SELECT code, is_system_default, schedule_type FROM workflow_definitions WHERE id = %s",
            (definition_id,),
        )
        existing = await cur.fetchone()
        if not existing:
            raise HTTPException(404, "Workflow definition not found")

        if existing["is_system_default"]:
            raise HTTPException(400, "Cannot delete system default workflow definitions. Disable it instead.")

        # Delete Temporal Schedule if it was cron-based
        if existing.get("schedule_type") == "cron":
            await delete_schedule(existing["code"])
            logger.info(f"Deleted schedule for {existing['code']}")

        await cur.execute(
            "DELETE FROM workflow_definitions WHERE id = %s",
            (definition_id,),
        )
        await conn.commit()

        logger.info(f"Deleted workflow definition: {existing['code']}")


# =============================================================================
# TOGGLE WORKFLOW DEFINITION (ENABLE/DISABLE)
# =============================================================================

@router.post("/{definition_id}/toggle", response_model=WorkflowDefinition)
async def toggle_workflow_definition(definition_id: int):
    """Toggle the enabled status of a workflow definition"""
    pool = get_pool()

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            UPDATE workflow_definitions
            SET enabled = NOT enabled
            WHERE id = %s
            RETURNING *
            """,
            (definition_id,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Workflow definition not found")

        await conn.commit()

        status = "enabled" if row["enabled"] else "disabled"
        logger.info(f"Toggled workflow definition {row['code']}: {status}")

        # Pause/unpause Temporal Schedule if cron-based
        if row["schedule_type"] == "cron" and row["cron_expression"]:
            if row["enabled"]:
                schedule_result = await unpause_schedule(row["code"])
            else:
                schedule_result = await pause_schedule(row["code"])
            logger.info(f"Schedule toggle result for {row['code']}: {schedule_result}")

        return WorkflowDefinition(**row)


# =============================================================================
# RUN WORKFLOW MANUALLY
# =============================================================================

@router.post("/{definition_id}/run", response_model=WorkflowExecution)
async def run_workflow(definition_id: int, request: WorkflowRunRequest):
    """Manually trigger a workflow execution"""
    pool = get_pool()

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Get workflow definition
        await cur.execute(
            "SELECT * FROM workflow_definitions WHERE id = %s",
            (definition_id,),
        )
        definition = await cur.fetchone()
        if not definition:
            raise HTTPException(404, "Workflow definition not found")

        if not definition["enabled"]:
            raise HTTPException(400, "Cannot run a disabled workflow definition")

        # Merge parameters
        parameters = {**definition["parameters"]}
        if request.parameters:
            parameters.update(request.parameters)

        # Create execution record
        await cur.execute(
            """
            INSERT INTO workflow_executions (
                workflow_definition_id, workflow_definition_code,
                status, triggered_by, triggered_by_user_id, parameters_used
            ) VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                definition_id, definition["code"],
                "pending", "manual",
                str(request.triggered_by_user_id) if request.triggered_by_user_id else None,
                Jsonb(parameters),
            ),
        )
        execution = await cur.fetchone()
        await conn.commit()

        # Try to start Temporal workflow
        temporal_client = await get_temporal_client()
        if temporal_client:
            try:
                workflow_id = f"{definition['workflow_type']}-{definition['code']}-{uuid4().hex[:8]}"

                # Map workflow_type to actual workflow class
                from src.workflows.worker import (
                    KycRefreshWorkflow,
                    SanctionsScreeningWorkflow,
                    DocumentRequestWorkflow,
                    SarFilingWorkflow,
                    BUSINESS_TASK_QUEUE,
                )

                workflow_map = {
                    "kyc_refresh": KycRefreshWorkflow,
                    "sanctions_screening": SanctionsScreeningWorkflow,
                    "document_request": DocumentRequestWorkflow,
                    "sar_filing": SarFilingWorkflow,
                }

                workflow_class = workflow_map.get(definition["workflow_type"])
                if not workflow_class:
                    raise HTTPException(400, f"Unknown workflow type: {definition['workflow_type']}")

                # Prepare workflow arguments based on type
                workflow_type = definition["workflow_type"]
                if workflow_type == "kyc_refresh":
                    # KycRefreshWorkflow.run(customer_id: str, days_before: int)
                    workflow_args = [
                        parameters.get("customer_id", ""),
                        parameters.get("days_before_expiry", 365),
                    ]
                elif workflow_type == "sanctions_screening":
                    # SanctionsScreeningWorkflow.run(customer_id: str, batch_size: int)
                    workflow_args = [
                        parameters.get("customer_id", ""),
                        parameters.get("batch_size", 100),
                    ]
                elif workflow_type in ("document_request", "sar_filing"):
                    # These workflows expect (customer_id, task_id, details)
                    # Pass workflow_definition_id so workflow can create task if needed
                    workflow_params = {
                        **parameters,
                        "workflow_definition_id": definition_id,
                        "workflow_id": workflow_id,
                    }
                    workflow_args = [
                        parameters.get("customer_id"),
                        parameters.get("task_id", 0),
                        workflow_params,
                    ]
                else:
                    workflow_args = [parameters]

                # Start workflow (non-blocking)
                handle = await temporal_client.start_workflow(
                    workflow_class.run,
                    args=workflow_args,
                    id=workflow_id,
                    task_queue=BUSINESS_TASK_QUEUE,
                )

                # Update execution with Temporal info
                await cur.execute(
                    """
                    UPDATE workflow_executions
                    SET status = 'running',
                        temporal_workflow_id = %s,
                        temporal_run_id = %s
                    WHERE id = %s
                    RETURNING *
                    """,
                    (workflow_id, handle.result_run_id, execution["id"]),
                )
                execution = await cur.fetchone()
                await conn.commit()

                logger.info(f"Started workflow {workflow_id} for definition {definition['code']}")

            except Exception as e:
                # Update execution with error
                await cur.execute(
                    """
                    UPDATE workflow_executions
                    SET status = 'failed', error = %s, completed_at = NOW()
                    WHERE id = %s
                    RETURNING *
                    """,
                    (str(e), execution["id"]),
                )
                execution = await cur.fetchone()
                await conn.commit()
                logger.error(f"Failed to start workflow: {e}")
        else:
            # Temporal not available - mark as failed
            await cur.execute(
                """
                UPDATE workflow_executions
                SET status = 'failed', error = 'Temporal service unavailable', completed_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (execution["id"],),
            )
            execution = await cur.fetchone()
            await conn.commit()

        return WorkflowExecution(**execution)


# =============================================================================
# GET WORKFLOW EXECUTION HISTORY
# =============================================================================

@router.get("/{definition_id}/history", response_model=list[WorkflowExecution])
async def get_workflow_history(
    definition_id: int,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """Get execution history for a workflow definition"""
    pool = get_pool()

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Verify definition exists
        await cur.execute(
            "SELECT id FROM workflow_definitions WHERE id = %s",
            (definition_id,),
        )
        if not await cur.fetchone():
            raise HTTPException(404, "Workflow definition not found")

        await cur.execute(
            """
            SELECT
                e.*,
                d.name as workflow_name,
                u.full_name as triggered_by_user_name
            FROM workflow_executions e
            LEFT JOIN workflow_definitions d ON e.workflow_definition_id = d.id
            LEFT JOIN users u ON e.triggered_by_user_id = u.id
            WHERE e.workflow_definition_id = %s
            ORDER BY e.started_at DESC
            LIMIT %s OFFSET %s
            """,
            (definition_id, limit, offset),
        )
        rows = await cur.fetchall()
        return [WorkflowExecution(**row) for row in rows]


# =============================================================================
# LIST ALL EXECUTIONS (across all definitions)
# =============================================================================

@router.get("/executions/all", response_model=list[WorkflowExecution])
async def list_all_executions(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """List all workflow executions across all definitions"""
    pool = get_pool()

    conditions = []
    params = []

    if status:
        conditions.append("e.status = %s")
        params.append(status)

    where_clause = " AND ".join(conditions) if conditions else "1=1"
    params.extend([limit, offset])

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            f"""
            SELECT
                e.*,
                d.name as workflow_name,
                u.full_name as triggered_by_user_name
            FROM workflow_executions e
            LEFT JOIN workflow_definitions d ON e.workflow_definition_id = d.id
            LEFT JOIN users u ON e.triggered_by_user_id = u.id
            WHERE {where_clause}
            ORDER BY e.started_at DESC
            LIMIT %s OFFSET %s
            """,
            params,
        )
        rows = await cur.fetchall()
        return [WorkflowExecution(**row) for row in rows]


# =============================================================================
# SCHEDULE MANAGEMENT
# =============================================================================

@router.get("/{definition_id}/schedule")
async def get_workflow_schedule(definition_id: int):
    """Get Temporal Schedule information for a workflow definition"""
    pool = get_pool()

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT code, schedule_type FROM workflow_definitions WHERE id = %s",
            (definition_id,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Workflow definition not found")

        if row["schedule_type"] != "cron":
            return {
                "schedule_id": None,
                "message": "This workflow definition is not cron-scheduled",
                "schedule_type": row["schedule_type"],
            }

        return await get_schedule_info(row["code"])
