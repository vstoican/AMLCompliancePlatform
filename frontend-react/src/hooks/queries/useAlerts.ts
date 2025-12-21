import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import type { Alert, AlertNote, AlertFilters, AlertDefinition } from '@/types/alert'

interface AlertsResponse {
  alerts: Alert[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

interface UseAlertsOptions extends AlertFilters {
  page?: number
  pageSize?: number
}

export function useAlerts(options?: UseAlertsOptions) {
  return useQuery({
    queryKey: ['alerts', options],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (options?.page) params.append('page', options.page.toString())
      if (options?.pageSize) params.append('page_size', options.pageSize.toString())
      if (options?.type) params.append('type', options.type)
      if (options?.severity) params.append('severity', options.severity)
      if (options?.status) params.append('status', options.status)
      if (options?.assigned_to) params.append('assigned_to', options.assigned_to)

      const { data } = await api.get<AlertsResponse>(`/alerts?${params}`)
      return data
    },
  })
}

export function useAlert(alertId: number | null) {
  return useQuery({
    queryKey: ['alert', alertId],
    queryFn: async () => {
      if (!alertId) return null
      const { data } = await api.get<Alert>(`/alerts/${alertId}`)
      return data
    },
    enabled: !!alertId,
  })
}

export function useAlertNotes(alertId: number | null) {
  return useQuery({
    queryKey: ['alert-notes', alertId],
    queryFn: async () => {
      if (!alertId) return []
      const { data } = await api.get<AlertNote[]>(`/alerts/${alertId}/notes`)
      return data
    },
    enabled: !!alertId,
  })
}

export function useAssignAlert() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  return useMutation({
    mutationFn: async ({ alertId, userId }: { alertId: number; userId: string }) => {
      const { data } = await api.post<Alert>(`/alerts/${alertId}/assign`, {
        assigned_to: userId,
        current_user_id: user?.id,
        current_user_role: user?.role || 'analyst',
      })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alert', variables.alertId] })
    },
  })
}

export function useEscalateAlert() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  return useMutation({
    mutationFn: async ({ alertId, userId, reason }: { alertId: number; userId: string; reason?: string }) => {
      const { data } = await api.post<Alert>(`/alerts/${alertId}/escalate`, {
        escalated_to: userId,
        reason: reason || 'Escalated for review',
        current_user_id: user?.id,
        current_user_role: user?.role || 'analyst',
      })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alert', variables.alertId] })
    },
  })
}

export function useResolveAlert() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  return useMutation({
    mutationFn: async ({
      alertId,
      resolutionType,
      notes,
    }: {
      alertId: number
      resolutionType: string
      notes?: string
    }) => {
      const { data } = await api.post<Alert>(`/alerts/${alertId}/resolve`, {
        resolution_type: resolutionType,
        resolution_notes: notes,
        current_user_id: user?.id,
        current_user_role: user?.role || 'analyst',
      })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alert', variables.alertId] })
    },
  })
}

export function useHoldAlert() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  return useMutation({
    mutationFn: async ({ alertId, reason }: { alertId: number; reason: string }) => {
      const { data } = await api.post<Alert>(`/alerts/${alertId}/hold`, {
        reason,
        current_user_id: user?.id,
        current_user_role: user?.role || 'analyst',
      })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alert', variables.alertId] })
    },
  })
}

export function useAddAlertNote() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  return useMutation({
    mutationFn: async ({ alertId, content }: { alertId: number; content: string }) => {
      const { data } = await api.post<AlertNote>(`/alerts/${alertId}/notes`, {
        content,
        current_user_id: user?.id,
        current_user_role: user?.role || 'analyst',
      })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['alert-notes', variables.alertId] })
    },
  })
}

// Alert Definitions
export function useAlertDefinitions() {
  return useQuery({
    queryKey: ['alert-definitions'],
    queryFn: async () => {
      const { data } = await api.get<AlertDefinition[]>('/alert-definitions')
      return data
    },
  })
}

export function useToggleAlertDefinition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const { data } = await api.patch<AlertDefinition>(`/alert-definitions/${id}`, {
        enabled,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-definitions'] })
    },
  })
}

export function useCreateAlertDefinition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: Omit<AlertDefinition, 'id' | 'created_at' | 'updated_at' | 'is_system_default'>) => {
      const { data } = await api.post<AlertDefinition>('/alert-definitions', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-definitions'] })
    },
  })
}

export function useUpdateAlertDefinition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<AlertDefinition> & { id: number }) => {
      const { data } = await api.patch<AlertDefinition>(`/alert-definitions/${id}`, payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-definitions'] })
    },
  })
}

export function useDeleteAlertDefinition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/alert-definitions/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-definitions'] })
    },
  })
}
