"""
Task Management API endpoints
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .db import connection
from .models import (
    Task,
    TaskCreate,
    TaskUpdate,
    TaskClaim,
    TaskComplete,
    TaskDefinition,
    TaskDefinitionCreate,
    TaskDefinitionUpdate,
    TASK_TYPES,
    TASK_STATUSES,
    TASK_PRIORITIES,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])
definition_router = APIRouter(prefix="/task-definitions", tags=["task-definitions"])


# =============================================================================
# TASK ENDPOINTS
# =============================================================================

@router.get("", response_model=List[Task])
async def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status"),
    task_type: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    customer_id: Optional[UUID] = Query(None),
    claimed_by: Optional[str] = Query(None),
    unclaimed_only: bool = Query(False),
    limit: int = Query(100, le=500),
    conn: AsyncConnection = Depends(connection),
) -> List[Task]:
    """List tasks with optional filters"""
    clauses = []
    params: list = []

    if status_filter:
        clauses.append("t.status = %s")
        params.append(status_filter)
    if task_type:
        clauses.append("t.task_type = %s")
        params.append(task_type)
    if priority:
        clauses.append("t.priority = %s")
        params.append(priority)
    if customer_id:
        clauses.append("t.customer_id = %s")
        params.append(customer_id)
    if claimed_by:
        clauses.append("t.claimed_by = %s")
        params.append(claimed_by)
    if unclaimed_only:
        clauses.append("t.claimed_by IS NULL AND t.status = 'pending'")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT t.*,
               COALESCE(c.first_name || ' ' || c.last_name, c.full_name) as customer_name,
               c.risk_level as customer_risk_level,
               a.scenario as alert_scenario,
               a.severity as alert_severity
        FROM tasks t
        LEFT JOIN customers c ON c.id = t.customer_id
        LEFT JOIN alerts a ON a.id = t.alert_id
        {where}
        ORDER BY
            CASE t.priority
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                ELSE 4
            END,
            t.due_date ASC NULLS LAST,
            t.created_at DESC
        LIMIT %s
    """
    params.append(limit)

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        rows = await cur.fetchall()

    return [Task(**_serialize_task(row)) for row in rows]


@router.get("/{task_id}", response_model=Task)
async def get_task(
    task_id: int,
    conn: AsyncConnection = Depends(connection)
) -> Task:
    """Get a specific task by ID"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("""
            SELECT t.*,
                   COALESCE(c.first_name || ' ' || c.last_name, c.full_name) as customer_name,
                   c.risk_level as customer_risk_level,
                   a.scenario as alert_scenario,
                   a.severity as alert_severity
            FROM tasks t
            LEFT JOIN customers c ON c.id = t.customer_id
            LEFT JOIN alerts a ON a.id = t.alert_id
            WHERE t.id = %s
        """, (task_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

    return Task(**_serialize_task(row))


@router.post("", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    created_by: str = Query(..., description="Username creating the task"),
    conn: AsyncConnection = Depends(connection),
) -> Task:
    """Create a new task manually"""
    # Validate task_type and priority
    if payload.task_type not in TASK_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid task_type. Must be one of: {TASK_TYPES}"
        )
    if payload.priority not in TASK_PRIORITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid priority. Must be one of: {TASK_PRIORITIES}"
        )

    query = """
        INSERT INTO tasks (
            customer_id, alert_id, task_type, priority,
            title, description, due_date, details, created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            query,
            (
                payload.customer_id,
                payload.alert_id,
                payload.task_type,
                payload.priority,
                payload.title,
                payload.description,
                payload.due_date,
                Jsonb(payload.details or {}),
                created_by,
            ),
        )
        row = await cur.fetchone()

    return Task(**_serialize_task(row))


@router.patch("/{task_id}", response_model=Task)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    conn: AsyncConnection = Depends(connection),
) -> Task:
    """Update a task"""
    # Build dynamic update
    updates = {}
    if payload.status is not None:
        if payload.status not in TASK_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Must be one of: {TASK_STATUSES}"
            )
        updates["status"] = payload.status
        if payload.status == "completed":
            updates["completed_at"] = datetime.utcnow()
    if payload.priority is not None:
        if payload.priority not in TASK_PRIORITIES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid priority. Must be one of: {TASK_PRIORITIES}"
            )
        updates["priority"] = payload.priority
    if payload.title is not None:
        updates["title"] = payload.title
    if payload.description is not None:
        updates["description"] = payload.description
    if payload.due_date is not None:
        updates["due_date"] = payload.due_date
    if payload.resolution_notes is not None:
        updates["resolution_notes"] = payload.resolution_notes

    if not updates:
        return await get_task(task_id, conn)

    set_clause = ", ".join(f"{field} = %s" for field in updates.keys())
    params = list(updates.values()) + [task_id]

    query = f"""
        UPDATE tasks SET {set_clause}
        WHERE id = %s
        RETURNING *
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

    return Task(**_serialize_task(row))


@router.post("/{task_id}/claim", response_model=Task)
async def claim_task(
    task_id: int,
    payload: TaskClaim,
    conn: AsyncConnection = Depends(connection),
) -> Task:
    """Claim a task from the shared queue"""
    async with conn.cursor(row_factory=dict_row) as cur:
        # Check if task exists and is claimable
        await cur.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
        task = await cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["claimed_by"] and task["claimed_by"] != payload.claimed_by:
            raise HTTPException(
                status_code=409,
                detail=f"Task already claimed by {task['claimed_by']}"
            )
        if task["status"] not in ("pending", "in_progress"):
            raise HTTPException(
                status_code=400,
                detail="Cannot claim completed or cancelled task"
            )

        # Claim the task
        await cur.execute("""
            UPDATE tasks
            SET claimed_by = %s,
                claimed_at = NOW(),
                status = 'in_progress'
            WHERE id = %s
            RETURNING *
        """, (payload.claimed_by, task_id))
        row = await cur.fetchone()

    return Task(**_serialize_task(row))


@router.post("/{task_id}/release", response_model=Task)
async def release_task(
    task_id: int,
    conn: AsyncConnection = Depends(connection),
) -> Task:
    """Release a claimed task back to the queue"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("""
            UPDATE tasks
            SET claimed_by = NULL,
                claimed_at = NULL,
                status = 'pending'
            WHERE id = %s AND status = 'in_progress'
            RETURNING *
        """, (task_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(
                status_code=404,
                detail="Task not found or not in progress"
            )

    return Task(**_serialize_task(row))


@router.post("/{task_id}/complete", response_model=Task)
async def complete_task(
    task_id: int,
    payload: TaskComplete,
    conn: AsyncConnection = Depends(connection),
) -> Task:
    """Mark a task as completed"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("""
            UPDATE tasks
            SET status = 'completed',
                completed_at = NOW(),
                completed_by = %s,
                resolution_notes = COALESCE(%s, resolution_notes)
            WHERE id = %s
            RETURNING *
        """, (payload.completed_by, payload.resolution_notes, task_id))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

    return Task(**_serialize_task(row))


@router.post("/{task_id}/cancel", response_model=Task)
async def cancel_task(
    task_id: int,
    cancelled_by: str = Query(...),
    reason: Optional[str] = Query(None),
    conn: AsyncConnection = Depends(connection),
) -> Task:
    """Cancel a task"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("""
            UPDATE tasks
            SET status = 'cancelled',
                resolution_notes = COALESCE(%s, resolution_notes),
                completed_by = %s,
                completed_at = NOW()
            WHERE id = %s AND status IN ('pending', 'in_progress')
            RETURNING *
        """, (reason, cancelled_by, task_id))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(
                status_code=404,
                detail="Task not found or already completed/cancelled"
            )

    return Task(**_serialize_task(row))


@router.post("/{task_id}/start-workflow", response_model=Task)
async def start_task_workflow(
    task_id: int,
    conn: AsyncConnection = Depends(connection),
) -> Task:
    """Start a Temporal workflow for this task"""
    # Import here to avoid circular imports
    from .main import temporal_client

    if not temporal_client:
        raise HTTPException(
            status_code=503,
            detail="Temporal client not connected"
        )

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
        task = await cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task["workflow_id"]:
            raise HTTPException(
                status_code=400,
                detail=f"Workflow already started: {task['workflow_id']}"
            )

        # Map task type to workflow
        workflow_map = {
            "investigation": "InvestigationWorkflow",
            "kyc_refresh": "KycRefreshWorkflow",
            "document_request": "DocumentRequestWorkflow",
            "escalation": "EscalationWorkflow",
            "sar_filing": "SarFilingWorkflow",
        }

        workflow_name = workflow_map.get(task["task_type"])
        if not workflow_name:
            raise HTTPException(
                status_code=400,
                detail=f"No workflow defined for task type: {task['task_type']}"
            )

        # Start workflow
        workflow_id = f"task-{task_id}-{task['task_type']}-{int(datetime.utcnow().timestamp())}"

        try:
            handle = await temporal_client.start_workflow(
                workflow_name,
                args=[
                    str(task["customer_id"]) if task["customer_id"] else None,
                    task["id"],
                    dict(task["details"]) if task["details"] else {}
                ],
                id=workflow_id,
                task_queue="aml-tasks",
            )

            # Update task with workflow info
            await cur.execute("""
                UPDATE tasks
                SET workflow_id = %s,
                    workflow_run_id = %s,
                    workflow_status = 'RUNNING'
                WHERE id = %s
                RETURNING *
            """, (handle.id, handle.result_run_id, task_id))
            row = await cur.fetchone()

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start workflow: {str(e)}"
            )

    return Task(**_serialize_task(row))


@router.get("/{task_id}/workflow-status")
async def get_task_workflow_status(
    task_id: int,
    conn: AsyncConnection = Depends(connection),
) -> dict:
    """Get the workflow status for a task"""
    from .main import temporal_client

    if not temporal_client:
        raise HTTPException(
            status_code=503,
            detail="Temporal client not connected"
        )

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT workflow_id, workflow_run_id FROM tasks WHERE id = %s",
            (task_id,)
        )
        task = await cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if not task["workflow_id"]:
            return {
                "status": "NO_WORKFLOW",
                "message": "No workflow started for this task"
            }

    try:
        handle = temporal_client.get_workflow_handle(
            task["workflow_id"],
            run_id=task["workflow_run_id"]
        )
        desc = await handle.describe()

        # Update task workflow status
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE tasks SET workflow_status = %s WHERE id = %s",
                (desc.status.name, task_id)
            )

        return {
            "workflow_id": desc.id,
            "run_id": desc.run_id,
            "status": desc.status.name,
            "start_time": desc.start_time.isoformat() if desc.start_time else None,
            "close_time": desc.close_time.isoformat() if desc.close_time else None,
        }
    except Exception as e:
        return {
            "status": "ERROR",
            "message": str(e)
        }


# =============================================================================
# TASK DEFINITION ENDPOINTS
# =============================================================================

@definition_router.get("", response_model=List[TaskDefinition])
async def list_task_definitions(
    enabled_only: bool = Query(False),
    conn: AsyncConnection = Depends(connection)
) -> List[TaskDefinition]:
    """List all task definitions"""
    where = "WHERE enabled = TRUE" if enabled_only else ""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(f"SELECT * FROM task_definitions {where} ORDER BY id")
        rows = await cur.fetchall()
    return [TaskDefinition(**row) for row in rows]


@definition_router.get("/{definition_id}", response_model=TaskDefinition)
async def get_task_definition(
    definition_id: int,
    conn: AsyncConnection = Depends(connection)
) -> TaskDefinition:
    """Get a specific task definition"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM task_definitions WHERE id = %s",
            (definition_id,)
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task definition not found")
    return TaskDefinition(**row)


@definition_router.post("", response_model=TaskDefinition, status_code=status.HTTP_201_CREATED)
async def create_task_definition(
    payload: TaskDefinitionCreate,
    conn: AsyncConnection = Depends(connection),
) -> TaskDefinition:
    """Create a new task definition"""
    # Validate
    if payload.task_type not in TASK_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid task_type. Must be one of: {TASK_TYPES}"
        )
    if payload.default_priority not in TASK_PRIORITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid default_priority. Must be one of: {TASK_PRIORITIES}"
        )

    # Check for duplicate
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id FROM task_definitions WHERE alert_scenario = %s",
            (payload.alert_scenario,)
        )
        if await cur.fetchone():
            raise HTTPException(
                status_code=400,
                detail="Task definition for this alert scenario already exists"
            )

    query = """
        INSERT INTO task_definitions (
            alert_scenario, alert_severity, task_type, default_priority,
            due_date_offset_hours, title_template, description_template,
            enabled, auto_start_workflow
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            query,
            (
                payload.alert_scenario,
                payload.alert_severity,
                payload.task_type,
                payload.default_priority,
                payload.due_date_offset_hours,
                payload.title_template,
                payload.description_template,
                payload.enabled,
                payload.auto_start_workflow,
            ),
        )
        row = await cur.fetchone()
    return TaskDefinition(**row)


@definition_router.patch("/{definition_id}", response_model=TaskDefinition)
async def update_task_definition(
    definition_id: int,
    payload: TaskDefinitionUpdate,
    conn: AsyncConnection = Depends(connection),
) -> TaskDefinition:
    """Update a task definition"""
    updates = {}
    if payload.alert_severity is not None:
        updates["alert_severity"] = payload.alert_severity
    if payload.task_type is not None:
        if payload.task_type not in TASK_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid task_type. Must be one of: {TASK_TYPES}"
            )
        updates["task_type"] = payload.task_type
    if payload.default_priority is not None:
        if payload.default_priority not in TASK_PRIORITIES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid default_priority. Must be one of: {TASK_PRIORITIES}"
            )
        updates["default_priority"] = payload.default_priority
    if payload.due_date_offset_hours is not None:
        updates["due_date_offset_hours"] = payload.due_date_offset_hours
    if payload.title_template is not None:
        updates["title_template"] = payload.title_template
    if payload.description_template is not None:
        updates["description_template"] = payload.description_template
    if payload.enabled is not None:
        updates["enabled"] = payload.enabled
    if payload.auto_start_workflow is not None:
        updates["auto_start_workflow"] = payload.auto_start_workflow

    if not updates:
        return await get_task_definition(definition_id, conn)

    set_clause = ", ".join(f"{field} = %s" for field in updates.keys())
    params = list(updates.values()) + [definition_id]

    query = f"UPDATE task_definitions SET {set_clause} WHERE id = %s RETURNING *"
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task definition not found")
    return TaskDefinition(**row)


@definition_router.delete("/{definition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_definition(
    definition_id: int,
    conn: AsyncConnection = Depends(connection),
) -> None:
    """Delete a task definition"""
    async with conn.cursor() as cur:
        await cur.execute(
            "DELETE FROM task_definitions WHERE id = %s RETURNING id",
            (definition_id,)
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Task definition not found")


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _serialize_task(row: dict) -> dict:
    """Serialize task row for Pydantic model"""
    data = dict(row)
    # Convert UUID to string if present
    if data.get("customer_id"):
        data["customer_id"] = str(data["customer_id"])
    # Ensure details is a dict
    if data.get("details") is None:
        data["details"] = {}
    return data
