export interface Task {
  id: number
  title: string
  description?: string
  task_type: string
  status: 'pending' | 'claimed' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  alert_id?: number
  customer_id?: string
  assigned_to?: string
  assigned_to_name?: string
  claimed_by?: string
  claimed_by_name?: string
  due_date?: string
  completed_at?: string
  completion_notes?: string
  notes?: string
  created_at: string
  updated_at?: string
}

export interface TaskFilters {
  status?: string
  priority?: string
  assigned_to?: string
}
