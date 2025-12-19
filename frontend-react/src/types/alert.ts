export interface Alert {
  id: number
  type: 'transaction_monitoring' | 'workflow' | 'customer_risk' | 'sanctions'
  scenario: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'assigned' | 'investigating' | 'escalated' | 'on_hold' | 'resolved'
  customer_id?: string
  customer_name?: string
  transaction_id?: number
  assigned_to?: string
  assigned_to_name?: string
  escalated_to?: string
  escalated_to_name?: string
  resolution_type?: 'false_positive' | 'true_positive' | 'suspicious_activity_report' | 'no_action_required'
  resolution_notes?: string
  resolved_at?: string
  resolved_by?: string
  details?: Record<string, unknown>
  created_at: string
  updated_at?: string
}

export interface AlertNote {
  id: number
  alert_id: number
  user_id: string
  user_name?: string
  content: string
  note_type: 'comment' | 'action' | 'system'
  created_at: string
}

export interface AlertFilters {
  type?: string
  severity?: string
  status?: string
  assigned_to?: string
}

export interface AlertDefinition {
  id: number
  code: string
  name: string
  description?: string
  category: string
  enabled: boolean
  severity: 'low' | 'medium' | 'high' | 'critical'
  threshold_amount?: number
  window_minutes?: number
  channels?: string[]
  country_scope?: string | null
  direction?: string
  is_system_default?: boolean
  created_at?: string
  updated_at?: string
}
