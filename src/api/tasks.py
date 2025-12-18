"""
Task Management API endpoints
"""
import os
import uuid as uuid_module
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import StreamingResponse
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from io import BytesIO

from .db import connection
from .models import (
    Task,
    TaskCreate,
    TaskUpdate,
    TaskClaim,
    TaskComplete,
    TaskAssign,
    TaskNote,
    TaskNoteCreate,
    TaskAttachment,
    TaskStatusHistory,
    TaskDefinition,
    TaskDefinitionCreate,
    TaskDefinitionUpdate,
    TASK_TYPES,
    TASK_STATUSES,
    TASK_PRIORITIES,
)
from . import s3

# File upload configuration
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 10 * 1024 * 1024))  # 10MB
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg", ".txt", ".csv"}

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
               a.severity as alert_severity,
               u_assigned.full_name as assigned_to_name,
               u_claimed.full_name as claimed_by_name
        FROM tasks t
        LEFT JOIN customers c ON c.id = t.customer_id
        LEFT JOIN alerts a ON a.id = t.alert_id
        LEFT JOIN users u_assigned ON u_assigned.id = t.assigned_to
        LEFT JOIN users u_claimed ON u_claimed.id = t.claimed_by_id
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
                   a.severity as alert_severity,
                   u_assigned.full_name as assigned_to_name,
                   u_claimed.full_name as claimed_by_name
            FROM tasks t
            LEFT JOIN customers c ON c.id = t.customer_id
            LEFT JOIN alerts a ON a.id = t.alert_id
            LEFT JOIN users u_assigned ON u_assigned.id = t.assigned_to
            LEFT JOIN users u_claimed ON u_claimed.id = t.claimed_by_id
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
        # Verify user exists
        await cur.execute("SELECT id, email FROM users WHERE id = %s", (str(payload.claimed_by_id),))
        user = await cur.fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="User not found")

        # Check if task exists and is claimable
        await cur.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
        task = await cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["claimed_by_id"] and task["claimed_by_id"] != payload.claimed_by_id:
            raise HTTPException(
                status_code=409,
                detail="Task already claimed by another user"
            )
        if task["status"] not in ("pending", "in_progress"):
            raise HTTPException(
                status_code=400,
                detail="Cannot claim completed task"
            )

        # Claim the task
        await cur.execute("""
            UPDATE tasks
            SET claimed_by_id = %s,
                claimed_by = %s,
                claimed_at = NOW(),
                status = 'in_progress'
            WHERE id = %s
            RETURNING *
        """, (str(payload.claimed_by_id), user["email"], task_id))
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
            SET claimed_by_id = NULL,
                claimed_by = NULL,
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
    # Get completed_by string from user if ID provided
    completed_by_str = payload.completed_by
    if payload.completed_by_id:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT email FROM users WHERE id = %s", (str(payload.completed_by_id),))
            user = await cur.fetchone()
            if user:
                completed_by_str = user["email"]

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("""
            UPDATE tasks
            SET status = 'completed',
                completed_at = NOW(),
                completed_by = %s,
                resolution_notes = COALESCE(%s, resolution_notes)
            WHERE id = %s
            RETURNING *
        """, (completed_by_str, payload.resolution_notes, task_id))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

    return Task(**_serialize_task(row))


@router.post("/{task_id}/assign", response_model=Task)
async def assign_task(
    task_id: int,
    payload: TaskAssign,
    conn: AsyncConnection = Depends(connection),
) -> Task:
    """Assign a task to a specific user (manager action)"""
    async with conn.cursor(row_factory=dict_row) as cur:
        # Verify assignee exists and is active
        await cur.execute(
            "SELECT id, email FROM users WHERE id = %s AND is_active = TRUE",
            (str(payload.assigned_to),)
        )
        assignee = await cur.fetchone()
        if not assignee:
            raise HTTPException(status_code=400, detail="Assignee not found or inactive")

        # Verify assigner exists
        await cur.execute("SELECT id FROM users WHERE id = %s", (str(payload.assigned_by),))
        if not await cur.fetchone():
            raise HTTPException(status_code=400, detail="Assigner not found")

        # Check task exists and is assignable
        await cur.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
        task = await cur.fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["status"] == "completed":
            raise HTTPException(status_code=400, detail="Cannot assign completed task")

        # Assign the task
        await cur.execute("""
            UPDATE tasks
            SET assigned_to = %s,
                assigned_by = %s,
                assigned_at = NOW(),
                claimed_by_id = %s,
                claimed_by = %s,
                claimed_at = NOW(),
                status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END
            WHERE id = %s
            RETURNING *
        """, (
            str(payload.assigned_to),
            str(payload.assigned_by),
            str(payload.assigned_to),
            assignee["email"],
            task_id
        ))
        row = await cur.fetchone()

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
# TASK NOTES ENDPOINTS
# =============================================================================

@router.get("/{task_id}/notes", response_model=List[TaskNote])
async def list_task_notes(
    task_id: int,
    conn: AsyncConnection = Depends(connection),
) -> List[TaskNote]:
    """List all notes for a task"""
    async with conn.cursor(row_factory=dict_row) as cur:
        # Check task exists
        await cur.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Task not found")

        await cur.execute("""
            SELECT n.*, u.full_name as user_name
            FROM task_notes n
            LEFT JOIN users u ON u.id = n.user_id
            WHERE n.task_id = %s
            ORDER BY n.created_at DESC
        """, (task_id,))
        rows = await cur.fetchall()

    return [TaskNote(**row) for row in rows]


@router.post("/{task_id}/notes", response_model=TaskNote, status_code=status.HTTP_201_CREATED)
async def create_task_note(
    task_id: int,
    payload: TaskNoteCreate,
    conn: AsyncConnection = Depends(connection),
) -> TaskNote:
    """Add a note to a task"""
    async with conn.cursor(row_factory=dict_row) as cur:
        # Check task exists
        await cur.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Task not found")

        # Verify user exists
        await cur.execute("SELECT id, full_name FROM users WHERE id = %s", (str(payload.user_id),))
        user = await cur.fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="User not found")

        # Create note
        await cur.execute("""
            INSERT INTO task_notes (task_id, user_id, content)
            VALUES (%s, %s, %s)
            RETURNING *, %s as user_name
        """, (task_id, str(payload.user_id), payload.content, user["full_name"]))
        row = await cur.fetchone()

    return TaskNote(**row)


@router.delete("/{task_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_note(
    task_id: int,
    note_id: int,
    conn: AsyncConnection = Depends(connection),
) -> None:
    """Delete a task note"""
    async with conn.cursor() as cur:
        await cur.execute(
            "DELETE FROM task_notes WHERE id = %s AND task_id = %s RETURNING id",
            (note_id, task_id)
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Note not found")


# =============================================================================
# TASK HISTORY ENDPOINTS
# =============================================================================

@router.get("/{task_id}/history", response_model=List[TaskStatusHistory])
async def list_task_history(
    task_id: int,
    conn: AsyncConnection = Depends(connection),
) -> List[TaskStatusHistory]:
    """List status change history for a task"""
    async with conn.cursor(row_factory=dict_row) as cur:
        # Check task exists
        await cur.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Task not found")

        await cur.execute("""
            SELECT h.*, u.full_name as changed_by_name
            FROM task_status_history h
            LEFT JOIN users u ON u.id = h.changed_by
            WHERE h.task_id = %s
            ORDER BY h.created_at DESC
        """, (task_id,))
        rows = await cur.fetchall()

    return [TaskStatusHistory(**row) for row in rows]


# =============================================================================
# TASK ATTACHMENTS ENDPOINTS
# =============================================================================

@router.get("/{task_id}/attachments", response_model=List[TaskAttachment])
async def list_task_attachments(
    task_id: int,
    conn: AsyncConnection = Depends(connection),
) -> List[TaskAttachment]:
    """List all attachments for a task"""
    async with conn.cursor(row_factory=dict_row) as cur:
        # Check task exists
        await cur.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Task not found")

        await cur.execute("""
            SELECT a.*, u.full_name as user_name
            FROM task_attachments a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.task_id = %s
            ORDER BY a.created_at DESC
        """, (task_id,))
        rows = await cur.fetchall()

    return [TaskAttachment(**row) for row in rows]


@router.post("/{task_id}/attachments", response_model=TaskAttachment, status_code=status.HTTP_201_CREATED)
async def upload_task_attachment(
    task_id: int,
    user_id: UUID = Query(..., description="User uploading the file"),
    file: UploadFile = File(...),
    conn: AsyncConnection = Depends(connection),
) -> TaskAttachment:
    """Upload an attachment to a task (stored in S3)"""
    # Validate file extension
    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {ALLOWED_EXTENSIONS}"
        )

    async with conn.cursor(row_factory=dict_row) as cur:
        # Check task exists
        await cur.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Task not found")

        # Verify user exists
        await cur.execute("SELECT id, full_name FROM users WHERE id = %s", (str(user_id),))
        user = await cur.fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="User not found")

        # Read file content
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Max size: {MAX_FILE_SIZE / (1024 * 1024)}MB"
            )

        # Generate unique filename and S3 key
        unique_filename = f"{uuid_module.uuid4()}{ext}"
        s3_key = f"tasks/{task_id}/{unique_filename}"
        content_type = file.content_type or "application/octet-stream"

        # Upload to S3
        try:
            s3.upload_file(
                content=content,
                key=s3_key,
                content_type=content_type,
                metadata={"original_filename": file.filename or "unknown"},
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload file to storage: {str(e)}"
            )

        # Create database record (file_path stores the S3 key)
        await cur.execute("""
            INSERT INTO task_attachments (task_id, user_id, filename, original_filename, file_path, file_size, content_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *, %s as user_name
        """, (
            task_id,
            str(user_id),
            unique_filename,
            file.filename,
            s3_key,  # Store S3 key as file_path
            len(content),
            content_type,
            user["full_name"]
        ))
        row = await cur.fetchone()
        await conn.commit()

    return TaskAttachment(**row)


@router.get("/{task_id}/attachments/{attachment_id}/download")
async def download_task_attachment(
    task_id: int,
    attachment_id: int,
    conn: AsyncConnection = Depends(connection),
):
    """Download a task attachment from S3"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("""
            SELECT * FROM task_attachments
            WHERE id = %s AND task_id = %s
        """, (attachment_id, task_id))
        attachment = await cur.fetchone()
        if not attachment:
            raise HTTPException(status_code=404, detail="Attachment not found")

    # Download from S3
    s3_key = attachment["file_path"]  # file_path stores the S3 key
    try:
        content, content_type, _ = s3.download_file(s3_key)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found in storage: {str(e)}")

    # Return as streaming response
    return StreamingResponse(
        BytesIO(content),
        media_type=attachment["content_type"] or content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{attachment["original_filename"]}"',
            "Content-Length": str(len(content)),
        }
    )


@router.delete("/{task_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_attachment(
    task_id: int,
    attachment_id: int,
    conn: AsyncConnection = Depends(connection),
) -> None:
    """Delete a task attachment from S3"""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("""
            SELECT file_path FROM task_attachments
            WHERE id = %s AND task_id = %s
        """, (attachment_id, task_id))
        attachment = await cur.fetchone()
        if not attachment:
            raise HTTPException(status_code=404, detail="Attachment not found")

        # Delete file from S3
        s3_key = attachment["file_path"]  # file_path stores the S3 key
        try:
            s3.delete_file(s3_key)
        except Exception:
            pass  # Continue even if S3 delete fails

        # Delete database record
        await cur.execute(
            "DELETE FROM task_attachments WHERE id = %s",
            (attachment_id,)
        )
        await conn.commit()


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
