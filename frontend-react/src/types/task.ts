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

export interface TaskNote {
  id: number
  task_id: number
  user_id: string
  user_name?: string
  content: string
  created_at: string
}

export interface TaskAttachment {
  id: number
  task_id: number
  user_id: string
  user_name?: string
  filename: string
  original_filename: string
  file_path: string
  file_size: number
  content_type: string
  created_at: string
}

export interface TaskStatusHistory {
  id: number
  task_id: number
  previous_status: string | null
  new_status: string
  changed_by: string
  changed_by_name?: string
  reason?: string  // Maps to 'reason' column in DB
  notes?: string   // Alias for reason (for backwards compatibility)
  metadata?: Record<string, unknown>
  created_at: string
}
