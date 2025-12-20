export interface Workflow {
  workflow_id: string
  run_id: string
  workflow_type: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TERMINATED' | 'TIMED_OUT'
  start_time?: string
  close_time?: string
  execution_time?: number
  memo?: Record<string, unknown>
}

export interface WorkflowDetails extends Workflow {
  history_length?: number
  task_queue?: string
  memo?: Record<string, unknown>
}

export interface StartKYCWorkflowRequest {
  customer_id: string
  days_before?: number
}

export interface StartSanctionsWorkflowRequest {
  customer_id: string
  hit_detected?: boolean
}

export interface StartAlertWorkflowRequest {
  alert_id: number
  action?: string
  resolved_by?: string
}

// =============================================================================
// WORKFLOW DEFINITIONS
// =============================================================================

export type WorkflowType = 'kyc_refresh' | 'sanctions_screening' | 'investigation' | 'document_request' | 'escalation' | 'sar_filing'
export type ScheduleType = 'cron' | 'event' | 'manual'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface WorkflowDefinition {
  id: number
  code: string
  name: string
  description?: string
  workflow_type: WorkflowType
  schedule_type: ScheduleType
  cron_expression?: string
  trigger_event?: string
  parameters: Record<string, unknown>
  create_alert: boolean
  alert_severity: Severity
  create_task: boolean
  task_type?: string
  task_priority: Severity
  timeout_seconds: number
  retry_max_attempts: number
  retry_backoff_seconds: number
  enabled: boolean
  is_system_default: boolean
  version: number
  created_at: string
  updated_at: string
}

export interface WorkflowDefinitionCreate {
  code: string
  name: string
  description?: string
  workflow_type: WorkflowType
  schedule_type?: ScheduleType
  cron_expression?: string
  trigger_event?: string
  parameters?: Record<string, unknown>
  create_alert?: boolean
  alert_severity?: Severity
  create_task?: boolean
  task_type?: string
  task_priority?: Severity
  timeout_seconds?: number
  retry_max_attempts?: number
  retry_backoff_seconds?: number
  enabled?: boolean
}

export interface WorkflowDefinitionUpdate {
  name?: string
  description?: string
  schedule_type?: ScheduleType
  cron_expression?: string
  trigger_event?: string
  parameters?: Record<string, unknown>
  create_alert?: boolean
  alert_severity?: Severity
  create_task?: boolean
  task_type?: string
  task_priority?: Severity
  timeout_seconds?: number
  retry_max_attempts?: number
  retry_backoff_seconds?: number
  enabled?: boolean
}

export interface WorkflowExecution {
  id: number
  workflow_definition_id?: number
  workflow_definition_code?: string
  temporal_workflow_id?: string
  temporal_run_id?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  started_at: string
  completed_at?: string
  result?: Record<string, unknown>
  error?: string
  triggered_by?: 'schedule' | 'event' | 'manual' | 'api'
  triggered_by_user_id?: string
  parameters_used?: Record<string, unknown>
  workflow_name?: string
  triggered_by_user_name?: string
}

export interface WorkflowRunRequest {
  parameters?: Record<string, unknown>
  triggered_by_user_id?: string
}
