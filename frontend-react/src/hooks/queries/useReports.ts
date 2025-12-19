import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Customer } from '@/types/customer'
import type { Alert } from '@/types/alert'

export interface ReportFilters {
  from_date?: string
  to_date?: string
}

export function useHighRiskReport() {
  return useQuery({
    queryKey: ['reports', 'high-risk'],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/reports/high-risk')
      return data
    },
  })
}

export function useAlertReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ['reports', 'alerts', filters],
    queryFn: async () => {
      const { data } = await api.post<Alert[]>('/reports/alerts', filters)
      return data
    },
    enabled: !!(filters.from_date && filters.to_date),
  })
}
