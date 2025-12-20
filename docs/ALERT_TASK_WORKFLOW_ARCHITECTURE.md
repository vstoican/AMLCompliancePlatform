# Alert-to-Task Workflow Architecture

This document describes the architecture for alert and task lifecycle management in the AML Compliance Platform, including Temporal workflow orchestration, event publishing, and automatic task creation.

## Overview

The platform uses a combination of:
- **PostgreSQL triggers** for alert creation from transaction analysis
- **pg_notify** for real-time event publishing
- **NATS JetStream** for reliable message delivery
- **Temporal workflows** for orchestrated alert and task lifecycle management

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Transaction Ingestion                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  NATS JetStream: aml.transaction.ingest                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  transaction_consumer.py (4 replicas)                                       │
│  - COPY batch to TimescaleDB                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL Trigger: trg_transactions_alerts                                │
│  - Analyzes transactions for suspicious patterns                            │
│  - INSERTs alerts when thresholds exceeded                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL Trigger: trg_notify_alert_created                               │
│  - pg_notify('alert_created', {alert_id, scenario, severity, ...})         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  API Server: _listen_for_alert_notifications()                              │
│  - LISTEN alert_created                                                     │
│  - Publishes to NATS: aml.alert.created                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  alert_processor.py                                                         │
│  - Consumes aml.alert.created                                               │
│  - Starts AlertLifecycleWorkflow with "init" action                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Temporal: AlertLifecycleWorkflow                                           │
│  - Manages full alert lifecycle                                             │
│  - Auto-creates tasks on assign/escalate                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. PostgreSQL Triggers

#### Alert Creation Trigger
Located in: `db/migrations/V2__alert_triggers.sql`

Automatically creates alerts when transactions exceed risk thresholds.

#### Alert Notification Trigger
Located in: `db/migrations/V20__alert_created_notify.sql`

```sql
CREATE OR REPLACE FUNCTION notify_alert_created()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('alert_created', json_build_object(
        'alert_id', NEW.id,
        'customer_id', NEW.customer_id,
        'scenario', NEW.scenario,
        'severity', NEW.severity,
        'type', NEW.type,
        'status', NEW.status,
        'created_at', NEW.created_at
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 2. API Server Event Listener

Located in: `src/api/main.py`

The API server runs a background task that listens for PostgreSQL notifications and forwards them to NATS:

```python
async def _listen_for_alert_notifications():
    """Background task that listens for pg_notify events"""
    async with pool.connection() as conn:
        await conn.execute("LISTEN alert_created")
        async for notify in conn.notifies():
            payload = json.loads(notify.payload)
            await publish_event("aml.alert.created", payload)
```

### 3. Alert Processor Worker

Located in: `src/workers/alert_processor.py`

Consumes `aml.alert.created` events from NATS and starts Temporal workflows:

```python
async def start_alert_workflow(alert_data: dict) -> dict:
    handle = await temporal_client.start_workflow(
        AlertLifecycleWorkflow.run,
        args=[alert_id, "init", SYSTEM_USER_ID, "system", params],
        id=workflow_id,
        task_queue="aml-tasks",
    )
```

### 4. Temporal Workflows

#### AlertLifecycleWorkflow

Located in: `src/workflows/worker.py`

Manages the complete alert lifecycle with the following actions:

| Action | Description | Auto-Creates Task |
|--------|-------------|-------------------|
| `init` | Initialize new alert workflow | No |
| `assign` | Assign alert to analyst | Yes (investigation) |
| `unassign` | Return alert to queue | No |
| `start` | Begin work on alert | No |
| `escalate` | Escalate to senior/manager | Yes (escalation) |
| `hold` | Put alert on hold | No |
| `resume` | Resume work on alert | No |
| `resolve` | Resolve with resolution type | No |
| `reopen` | Reopen resolved alert | No |
| `add_note` | Add note to alert | No |

#### TaskLifecycleWorkflow

Located in: `src/workflows/worker.py`

Manages task operations with full audit trail:

| Action | Description |
|--------|-------------|
| `claim` | Claim task from queue |
| `release` | Release task back to queue |
| `complete` | Mark task as completed |
| `assign` | Manager assigns task to user |

## Alert Status Flow

```
                    ┌──────────────┐
                    │     new      │
                    │ (pg trigger) │
                    └──────┬───────┘
                           │ init
                           ▼
                    ┌──────────────┐
                    │     open     │◄─────────────────────────┐
                    └──────┬───────┘                          │
                           │ assign                           │ reopen
                           ▼                                  │
                    ┌──────────────┐                          │
              ┌─────│   assigned   │─────┐                    │
              │     └──────┬───────┘     │                    │
              │            │ start       │ unassign           │
              │            ▼             │                    │
              │     ┌──────────────┐     │                    │
              │     │ in_progress  │─────┼────────────────────┤
              │     └──────┬───────┘     │                    │
              │            │             │                    │
      ┌───────┼────────────┼─────────────┼───────┐            │
      │       │            │             │       │            │
      │escalate│          hold          resolve  │            │
      │       │            │             │       │            │
      ▼       │            ▼             ▼       │            │
┌──────────┐  │     ┌──────────────┐  ┌──────────────┐        │
│ escalated│──┼────►│   on_hold    │  │   resolved   │────────┘
└──────────┘  │     └──────────────┘  └──────────────┘
      │       │            │
      │       │            │ resume
      │       │            │
      └───────┴────────────┘
```

## Task Auto-Creation

When an alert is assigned or escalated, a task is automatically created:

### On Alert Assignment
- **Task Type**: `investigation`
- **Priority**: Based on alert severity (critical→critical, high→high, etc.)
- **Title**: `Investigate: {scenario}`
- **Assigned To**: The analyst receiving the alert

### On Alert Escalation
- **Task Type**: `escalation`
- **Priority**: `critical` (for critical alerts) or `high` (otherwise)
- **Title**: `Escalation: {scenario}`
- **Assigned To**: The senior/manager receiving the escalation

## API Endpoints

### Alert Actions

All alert actions route through Temporal workflows:

```
POST /alerts/{alert_id}/assign
POST /alerts/{alert_id}/unassign
POST /alerts/{alert_id}/start
POST /alerts/{alert_id}/escalate
POST /alerts/{alert_id}/hold
POST /alerts/{alert_id}/resume
POST /alerts/{alert_id}/resolve
POST /alerts/{alert_id}/reopen
POST /alerts/{alert_id}/notes
```

**Request Body** (all actions):
```json
{
  "current_user_id": "uuid",
  "current_user_role": "analyst|senior_analyst|manager|admin",
  // action-specific fields...
}
```

### Task Actions

Task operations also route through Temporal with direct DB fallback:

```
POST /tasks/{task_id}/claim
POST /tasks/{task_id}/release
POST /tasks/{task_id}/complete
POST /tasks/{task_id}/assign
```

## User Validation

All activities validate users before performing operations:

```python
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"

async def _validate_user_exists(conn, user_id: str) -> bool:
    """Check if a user exists in the database"""
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        return await cur.fetchone() is not None

async def _get_valid_user_id(conn, user_id: str) -> str:
    """Get a valid user ID, falling back to system user if not found"""
    if await _validate_user_exists(conn, user_id):
        return user_id
    return SYSTEM_USER_ID
```

## Status History

All status changes are logged to history tables:

### Alert Status History
```sql
INSERT INTO alert_status_history
  (alert_id, previous_status, new_status, changed_by, reason, metadata)
VALUES (...)
```

### Task Status History
```sql
INSERT INTO task_status_history
  (task_id, previous_status, new_status, changed_by, reason, metadata)
VALUES (...)
```

## Namespace Separation

To keep the Temporal UI clean, workflows are completely isolated using separate namespaces:

### Business Namespace (`default`)
Visible in Temporal UI - workflows users need to monitor:
- `KycRefreshWorkflow`
- `SanctionsScreeningWorkflow`
- `InvestigationWorkflow`
- `DocumentRequestWorkflow`
- `EscalationWorkflow`
- `SarFilingWorkflow`

**Task Queue:** `aml-tasks`

### Internal Namespace (`internal`)
**NOT visible in the default Temporal UI view** - system operations only:
- `AlertLifecycleWorkflow` - alert state transitions
- `TaskLifecycleWorkflow` - task state transitions

**Task Queue:** `aml-internal`

### Viewing Internal Workflows

Internal workflows are hidden from the default namespace view. To inspect them for debugging:

1. Open Temporal UI at http://localhost:8080
2. Use the namespace dropdown (top-left) to switch to `internal`
3. Or access directly: http://localhost:8080/namespaces/internal/workflows

The internal namespace is automatically created by the worker on startup with a 7-day retention period.

## Docker Services

### Required Services

| Service | Description |
|---------|-------------|
| `api` | FastAPI server with pg_notify listener |
| `worker` | Temporal worker for both queues |
| `alert-processor` | NATS consumer for alert events |
| `transaction-consumer` | NATS consumer for transactions |
| `temporal` | Temporal server |
| `nats` | NATS JetStream server |
| `timescaledb` | PostgreSQL with TimescaleDB |

### Starting Services

```bash
docker-compose up -d
```

### Viewing Temporal Workflows

Access Temporal UI at: http://localhost:8080

## Error Handling

### Temporal Fallback

If Temporal is unavailable, task operations fall back to direct database execution:

```python
if temporal_client:
    result = await temporal_client.start_workflow(...)
else:
    # Direct DB execution
    logger.info("Executing task action directly (Temporal unavailable)")
```

### User Validation Fallback

If a user is not found, operations use the system user to maintain audit trail integrity.

## Monitoring

### NATS Monitoring

Access NATS monitoring at: http://localhost:8222

### Key Metrics

- `aml.alert.created` message rate
- Alert processing latency
- Workflow execution duration
- Task creation rate

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NATS_URL` | NATS server URL | `nats://localhost:4222` |
| `TEMPORAL_HOST` | Temporal server host | `localhost` |
| `TEMPORAL_PORT` | Temporal server port | `7233` |
| `DATABASE_URL` | PostgreSQL connection string | - |

## Troubleshooting

### Alerts Not Being Processed

1. Check pg_notify trigger exists:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'trg_notify_alert_created';
   ```

2. Check API server logs for listener status:
   ```bash
   docker-compose logs api | grep "alert_created"
   ```

3. Check NATS stream:
   ```bash
   docker exec -it <nats-container> nats stream info AML_EVENTS
   ```

### Tasks Not Being Created

1. Verify AlertLifecycleWorkflow is running in Temporal UI
2. Check worker logs:
   ```bash
   docker-compose logs worker | grep "create_task_from_alert"
   ```

3. Verify task_definitions table has matching scenarios

### Workflow Failures

1. Check Temporal UI for failed workflows
2. Review activity error messages
3. Verify user exists in database:
   ```sql
   SELECT id, email FROM users WHERE id = '<user_id>';
   ```
