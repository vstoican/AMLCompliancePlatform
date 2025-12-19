import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

interface DashboardStats {
  total_customers: number
  high_risk_customers: number
  open_alerts: number
  pending_tasks: number
  total_transactions: number
  risk_distribution: {
    low: number
    medium: number
    high: number
  }
}

interface RecentAlert {
  id: number
  type: string
  scenario: string
  severity: string
  status: string
  customer_name?: string
  created_at: string
}

interface RecentTransaction {
  id: number
  member_id: string
  customer_name: string
  amount: number
  currency: string
  type: string
  status: string
  created_at: string
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get<DashboardStats>('/dashboard/stats')
      return data
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

export function useRecentAlerts(limit = 5) {
  return useQuery({
    queryKey: ['recent-alerts', limit],
    queryFn: async () => {
      const { data } = await api.get<RecentAlert[]>(`/alerts?page_size=${limit}&status=open,assigned,investigating`)
      return data
    },
  })
}

export function useRecentTransactions(limit = 5) {
  return useQuery({
    queryKey: ['recent-transactions', limit],
    queryFn: async () => {
      const { data } = await api.get<{ transactions: RecentTransaction[] }>(`/transactions?page_size=${limit}`)
      return data.transactions
    },
  })
}
