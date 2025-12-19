import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Workflow, WorkflowDetails } from '@/types/workflow'

export function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const { data } = await api.get<Workflow[]>('/workflows')
      return data
    },
  })
}

export function useWorkflowDetails(workflowId: string | null, runId: string | null) {
  return useQuery({
    queryKey: ['workflow', workflowId, runId],
    queryFn: async () => {
      if (!workflowId || !runId) return null
      const { data } = await api.get<WorkflowDetails>(`/workflows/${workflowId}/${runId}`)
      return data
    },
    enabled: !!workflowId && !!runId,
  })
}

export function useStartKYCWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ customerId, daysBefore }: { customerId: string; daysBefore?: number }) => {
      const params = new URLSearchParams()
      params.append('customer_id', customerId)
      if (daysBefore) params.append('days_before', daysBefore.toString())

      const { data } = await api.post(`/workflows/kyc-refresh/start?${params}`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

export function useStartSanctionsWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ customerId, hitDetected }: { customerId: string; hitDetected?: boolean }) => {
      const params = new URLSearchParams()
      params.append('customer_id', customerId)
      if (hitDetected !== undefined) params.append('hit_detected', hitDetected.toString())

      const { data } = await api.post(`/workflows/sanctions-screening/start?${params}`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

export function useStartAlertWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      alertId,
      action,
      resolvedBy,
    }: {
      alertId: number
      action?: string
      resolvedBy?: string
    }) => {
      const params = new URLSearchParams()
      params.append('alert_id', alertId.toString())
      if (action) params.append('action', action)
      if (resolvedBy) params.append('resolved_by', resolvedBy)

      const { data } = await api.post(`/workflows/alert-handling/start?${params}`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

export function useCancelWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ workflowId, runId }: { workflowId: string; runId: string }) => {
      const { data } = await api.post(`/workflows/${workflowId}/${runId}/cancel`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}
