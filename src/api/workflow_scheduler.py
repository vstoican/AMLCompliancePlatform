"""
Temporal Scheduler Integration

Manages Temporal Schedules based on workflow definitions.
Uses Temporal's built-in Schedules API for:
- Durable cron-based execution
- Pause/resume (enable/disable)
- Manual trigger
- Observability through Temporal UI
"""
import logging
from typing import Optional
from uuid import uuid4

from temporalio.client import (
    Client,
    Schedule,
    ScheduleActionStartWorkflow,
    ScheduleSpec,
    ScheduleIntervalSpec,
    ScheduleState,
    ScheduleUpdate,
    ScheduleUpdateInput,
)
from temporalio.common import RetryPolicy
from datetime import timedelta

from src.api.config import settings

logger = logging.getLogger(__name__)

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


def get_schedule_id(definition_code: str) -> str:
    """Generate a consistent schedule ID from workflow definition code"""
    return f"workflow-schedule-{definition_code}"


async def create_or_update_schedule(
    definition_id: int,
    definition_code: str,
    workflow_type: str,
    cron_expression: str,
    parameters: dict,
    enabled: bool = True,
    timeout_seconds: int = 3600,
) -> dict:
    """
    Create or update a Temporal Schedule for a workflow definition.

    Args:
        definition_id: Database ID of the workflow definition
        definition_code: Unique code for the workflow definition
        workflow_type: Type of workflow (kyc_refresh, sanctions_screening, etc.)
        cron_expression: Cron expression for scheduling
        parameters: Workflow parameters
        enabled: Whether the schedule should be active
        timeout_seconds: Workflow execution timeout

    Returns:
        dict with schedule_id and status
    """
    client = await get_temporal_client()
    if not client:
        return {"success": False, "error": "Temporal client unavailable"}

    schedule_id = get_schedule_id(definition_code)

    # Import workflow classes
    from src.workflows.worker import (
        KycRefreshWorkflow,
        SanctionsScreeningWorkflow,
        InvestigationWorkflow,
        DocumentRequestWorkflow,
        EscalationWorkflow,
        SarFilingWorkflow,
        BUSINESS_TASK_QUEUE,
    )

    workflow_map = {
        "kyc_refresh": KycRefreshWorkflow,
        "sanctions_screening": SanctionsScreeningWorkflow,
        "investigation": InvestigationWorkflow,
        "document_request": DocumentRequestWorkflow,
        "escalation": EscalationWorkflow,
        "sar_filing": SarFilingWorkflow,
    }

    workflow_class = workflow_map.get(workflow_type)
    if not workflow_class:
        return {"success": False, "error": f"Unknown workflow type: {workflow_type}"}

    try:
        # Check if schedule already exists
        try:
            existing_handle = client.get_schedule_handle(schedule_id)
            desc = await existing_handle.describe()
            schedule_exists = True
        except Exception:
            schedule_exists = False

        # Prepare workflow arguments based on type
        # Note: For scheduled batch workflows, we typically don't pass customer_id
        # The workflow itself should query for customers that need processing
        if workflow_type == "kyc_refresh":
            # KycRefreshWorkflow.run(customer_id: str, days_before: int)
            # For batch processing, customer_id can be empty string to process all
            workflow_args = [
                parameters.get("customer_id", ""),  # Empty = batch mode
                parameters.get("days_before_expiry", 365),
            ]
        elif workflow_type == "sanctions_screening":
            # SanctionsScreeningWorkflow.run(customer_id: str, hit_detected: bool)
            workflow_args = [
                parameters.get("customer_id", ""),
                parameters.get("hit_detected", False),
            ]
        elif workflow_type in ("investigation", "document_request", "escalation", "sar_filing"):
            # These workflows expect (customer_id, task_id, details)
            # For scheduled runs without a specific task, pass 0 as task_id
            workflow_args = [
                parameters.get("customer_id"),
                parameters.get("task_id", 0),
                parameters,
            ]
        else:
            # Unknown workflow type - pass parameters as single dict
            workflow_args = [parameters]

        # Create schedule spec from cron expression
        schedule_spec = ScheduleSpec(cron_expressions=[cron_expression])

        # Create schedule action
        schedule_action = ScheduleActionStartWorkflow(
            workflow_class.run,
            args=workflow_args,
            id=f"{workflow_type}-{definition_code}-scheduled-{{{{.ScheduleTime.Format \"20060102T150405\"}}}}",
            task_queue=BUSINESS_TASK_QUEUE,
            retry_policy=RetryPolicy(
                maximum_attempts=3,
                initial_interval=timedelta(seconds=60),
            ),
        )

        # Determine initial state
        schedule_state = ScheduleState(
            paused=not enabled,
            note=f"Workflow definition: {definition_code} (ID: {definition_id})",
        )

        if schedule_exists:
            # Update existing schedule
            async def update_schedule(input: ScheduleUpdateInput) -> ScheduleUpdate:
                return ScheduleUpdate(
                    schedule=Schedule(
                        action=schedule_action,
                        spec=schedule_spec,
                        state=schedule_state,
                    )
                )

            await existing_handle.update(update_schedule)
            logger.info(f"Updated Temporal schedule: {schedule_id}")
            return {
                "success": True,
                "schedule_id": schedule_id,
                "action": "updated",
                "paused": not enabled,
            }
        else:
            # Create new schedule
            await client.create_schedule(
                schedule_id,
                Schedule(
                    action=schedule_action,
                    spec=schedule_spec,
                    state=schedule_state,
                ),
            )
            logger.info(f"Created Temporal schedule: {schedule_id}")
            return {
                "success": True,
                "schedule_id": schedule_id,
                "action": "created",
                "paused": not enabled,
            }

    except Exception as e:
        logger.error(f"Failed to create/update schedule {schedule_id}: {e}")
        return {"success": False, "error": str(e)}


async def delete_schedule(definition_code: str) -> dict:
    """
    Delete a Temporal Schedule for a workflow definition.

    Args:
        definition_code: Unique code for the workflow definition

    Returns:
        dict with status
    """
    client = await get_temporal_client()
    if not client:
        return {"success": False, "error": "Temporal client unavailable"}

    schedule_id = get_schedule_id(definition_code)

    try:
        handle = client.get_schedule_handle(schedule_id)
        await handle.delete()
        logger.info(f"Deleted Temporal schedule: {schedule_id}")
        return {"success": True, "schedule_id": schedule_id, "action": "deleted"}
    except Exception as e:
        # Schedule might not exist, which is fine
        logger.warning(f"Could not delete schedule {schedule_id}: {e}")
        return {"success": True, "schedule_id": schedule_id, "action": "not_found"}


async def pause_schedule(definition_code: str) -> dict:
    """
    Pause a Temporal Schedule (when workflow definition is disabled).

    Args:
        definition_code: Unique code for the workflow definition

    Returns:
        dict with status
    """
    client = await get_temporal_client()
    if not client:
        return {"success": False, "error": "Temporal client unavailable"}

    schedule_id = get_schedule_id(definition_code)

    try:
        handle = client.get_schedule_handle(schedule_id)
        await handle.pause(note="Workflow definition disabled")
        logger.info(f"Paused Temporal schedule: {schedule_id}")
        return {"success": True, "schedule_id": schedule_id, "action": "paused"}
    except Exception as e:
        logger.warning(f"Could not pause schedule {schedule_id}: {e}")
        return {"success": False, "error": str(e)}


async def unpause_schedule(definition_code: str) -> dict:
    """
    Unpause a Temporal Schedule (when workflow definition is enabled).

    Args:
        definition_code: Unique code for the workflow definition

    Returns:
        dict with status
    """
    client = await get_temporal_client()
    if not client:
        return {"success": False, "error": "Temporal client unavailable"}

    schedule_id = get_schedule_id(definition_code)

    try:
        handle = client.get_schedule_handle(schedule_id)
        await handle.unpause(note="Workflow definition enabled")
        logger.info(f"Unpaused Temporal schedule: {schedule_id}")
        return {"success": True, "schedule_id": schedule_id, "action": "unpaused"}
    except Exception as e:
        logger.warning(f"Could not unpause schedule {schedule_id}: {e}")
        return {"success": False, "error": str(e)}


async def trigger_schedule(definition_code: str) -> dict:
    """
    Manually trigger a scheduled workflow immediately.

    Args:
        definition_code: Unique code for the workflow definition

    Returns:
        dict with status
    """
    client = await get_temporal_client()
    if not client:
        return {"success": False, "error": "Temporal client unavailable"}

    schedule_id = get_schedule_id(definition_code)

    try:
        handle = client.get_schedule_handle(schedule_id)
        await handle.trigger()
        logger.info(f"Triggered Temporal schedule: {schedule_id}")
        return {"success": True, "schedule_id": schedule_id, "action": "triggered"}
    except Exception as e:
        logger.error(f"Could not trigger schedule {schedule_id}: {e}")
        return {"success": False, "error": str(e)}


async def get_schedule_info(definition_code: str) -> dict:
    """
    Get information about a Temporal Schedule.

    Args:
        definition_code: Unique code for the workflow definition

    Returns:
        dict with schedule information
    """
    client = await get_temporal_client()
    if not client:
        return {"success": False, "error": "Temporal client unavailable"}

    schedule_id = get_schedule_id(definition_code)

    try:
        handle = client.get_schedule_handle(schedule_id)
        desc = await handle.describe()

        return {
            "success": True,
            "schedule_id": schedule_id,
            "paused": desc.schedule.state.paused if desc.schedule.state else False,
            "note": desc.schedule.state.note if desc.schedule.state else None,
            "num_actions": desc.info.num_actions,
            "running_workflows": len(desc.info.running_actions) if desc.info.running_actions else 0,
            "recent_actions": [
                {
                    "scheduled_at": a.schedule_time.isoformat() if a.schedule_time else None,
                    "started_at": a.actual_time.isoformat() if a.actual_time else None,
                }
                for a in (desc.info.recent_actions or [])[:5]
            ],
            "next_action_times": [
                t.isoformat() for t in (desc.info.next_action_times or [])[:3]
            ],
        }
    except Exception as e:
        logger.warning(f"Could not get schedule info for {schedule_id}: {e}")
        return {"success": False, "error": str(e), "schedule_id": schedule_id}


async def sync_all_schedules() -> dict:
    """
    Synchronize all cron-based workflow definitions with Temporal Schedules.
    Call this on startup to ensure schedules match the database.

    Returns:
        dict with sync results
    """
    from src.api.db import get_pool
    from psycopg.rows import dict_row

    pool = get_pool()
    results = {"created": 0, "updated": 0, "paused": 0, "errors": []}

    async with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("""
            SELECT id, code, workflow_type, cron_expression, parameters, enabled, timeout_seconds
            FROM workflow_definitions
            WHERE schedule_type = 'cron' AND cron_expression IS NOT NULL
        """)
        definitions = await cur.fetchall()

    for defn in definitions:
        result = await create_or_update_schedule(
            definition_id=defn["id"],
            definition_code=defn["code"],
            workflow_type=defn["workflow_type"],
            cron_expression=defn["cron_expression"],
            parameters=defn["parameters"] or {},
            enabled=defn["enabled"],
            timeout_seconds=defn["timeout_seconds"] or 3600,
        )

        if result.get("success"):
            if result.get("action") == "created":
                results["created"] += 1
            elif result.get("action") == "updated":
                results["updated"] += 1
            if result.get("paused"):
                results["paused"] += 1
        else:
            results["errors"].append({
                "code": defn["code"],
                "error": result.get("error"),
            })

    logger.info(f"Schedule sync complete: {results}")
    return results
