export interface Task {
  id: number
  title: string
  description?: string
  task_type: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  alert_id?: number
  customer_id?: string
  assigned_to?: string
  assigned_by?: string
  assigned_at?: string
  assigned_to_name?: string
  workflow_id?: string
  workflow_run_id?: string
  workflow_status?: string
  details?: Record<string, unknown>
  due_date?: string
  completed_at?: string
  completed_by?: string
  resolution_notes?: string
  created_at: string
  updated_at?: string
  created_by?: string
  customer_name?: string
  customer_risk_level?: string
  alert_scenario?: string
  alert_severity?: string
}

export interface TaskFilters {
  status?: string
  priority?: string
  assigned_to?: string
}
