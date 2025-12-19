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
