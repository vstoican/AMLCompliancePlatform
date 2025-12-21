import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import type { Task, TaskFilters, TaskNote, TaskAttachment, TaskStatusHistory } from '@/types/task'

interface UseTasksOptions extends TaskFilters {
  page?: number
  pageSize?: number
}

export function useTasks(options?: UseTasksOptions) {
  return useQuery({
    queryKey: ['tasks', options],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (options?.page) params.append('page', options.page.toString())
      if (options?.pageSize) params.append('page_size', options.pageSize.toString())
      if (options?.status) params.append('status', options.status)
      if (options?.priority) params.append('priority', options.priority)
      if (options?.assigned_to) params.append('assigned_to', options.assigned_to)

      const { data } = await api.get<Task[]>(`/tasks?${params}`)
      // API returns array directly, wrap it for consistency
      return {
        tasks: data,
        total: data.length,
        page: options?.page ?? 1,
        pageSize: options?.pageSize ?? 20,
        totalPages: 1,
      }
    },
  })
}

export function useTask(taskId: number | null) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      if (!taskId) return null
      const { data } = await api.get<Task>(`/tasks/${taskId}`)
      return data
    },
    enabled: !!taskId,
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (task: Partial<Task>) => {
      const { data } = await api.post<Task>('/tasks', task)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...task }: Partial<Task> & { id: number }) => {
      const { data } = await api.patch<Task>(`/tasks/${id}`, task)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', variables.id] })
    },
  })
}

export function useClaimTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: number; userId: string }) => {
      const { data } = await api.post<Task>(`/tasks/${taskId}/claim`, { assigned_to: userId })
      return data
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.refetchQueries({ queryKey: ['task-history', taskId] })
    },
  })
}

export function useAssignTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, assignedTo, assignedBy }: { taskId: number; assignedTo: string; assignedBy: string }) => {
      const { data } = await api.post<Task>(`/tasks/${taskId}/assign`, { assigned_to: assignedTo, assigned_by: assignedBy })
      return data
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.refetchQueries({ queryKey: ['task-history', taskId] })
    },
  })
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, status, priority, dueDate, changedBy }: { taskId: number; status?: string; priority?: string; dueDate?: string | null; changedBy?: string }) => {
      const payload: Record<string, string | null> = {}
      if (status) payload.status = status
      if (priority) payload.priority = priority
      if (dueDate !== undefined) payload.due_date = dueDate
      if (changedBy) payload.changed_by = changedBy
      const { data } = await api.patch<Task>(`/tasks/${taskId}`, payload)
      return data
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.refetchQueries({ queryKey: ['task-history', taskId] })
    },
  })
}

export function useReleaseTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (taskId: number) => {
      const { data } = await api.post<Task>(`/tasks/${taskId}/release`)
      return data
    },
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.refetchQueries({ queryKey: ['task-history', taskId] })
    },
  })
}

export function useCompleteTask() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)

  return useMutation({
    mutationFn: async ({ taskId, notes }: { taskId: number; notes?: string }) => {
      const { data } = await api.post<Task>(`/tasks/${taskId}/complete`, {
        resolution_notes: notes,
        completed_by_id: user?.id,
      })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId] })
      queryClient.refetchQueries({ queryKey: ['task-history', variables.taskId] })
    },
  })
}

// =============================================================================
// NOTES
// =============================================================================

export function useTaskNotes(taskId: number | null) {
  return useQuery({
    queryKey: ['task-notes', taskId],
    queryFn: async () => {
      if (!taskId) return []
      const { data } = await api.get<TaskNote[]>(`/tasks/${taskId}/notes`)
      return data
    },
    enabled: !!taskId,
  })
}

export function useCreateTaskNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, content, userId }: { taskId: number; content: string; userId: string }) => {
      const { data } = await api.post<TaskNote>(`/tasks/${taskId}/notes`, { content, user_id: userId })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-notes', variables.taskId] })
      queryClient.refetchQueries({ queryKey: ['task-history', variables.taskId] })
    },
  })
}

export function useDeleteTaskNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, noteId }: { taskId: number; noteId: number }) => {
      await api.delete(`/tasks/${taskId}/notes/${noteId}`)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-notes', variables.taskId] })
    },
  })
}

// =============================================================================
// ATTACHMENTS
// =============================================================================

export function useTaskAttachments(taskId: number | null) {
  return useQuery({
    queryKey: ['task-attachments', taskId],
    queryFn: async () => {
      if (!taskId) return []
      const { data } = await api.get<TaskAttachment[]>(`/tasks/${taskId}/attachments`)
      return data
    },
    enabled: !!taskId,
  })
}

export function useUploadTaskAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, file, userId }: { taskId: number; file: File; userId: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post<TaskAttachment>(
        `/tasks/${taskId}/attachments?user_id=${userId}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-attachments', variables.taskId] })
      queryClient.refetchQueries({ queryKey: ['task-history', variables.taskId] })
    },
  })
}

export function useDeleteTaskAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, attachmentId, userId }: { taskId: number; attachmentId: number; userId?: string }) => {
      const params = userId ? `?user_id=${userId}` : ''
      await api.delete(`/tasks/${taskId}/attachments/${attachmentId}${params}`)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task-attachments', variables.taskId] })
      queryClient.refetchQueries({ queryKey: ['task-history', variables.taskId] })
    },
  })
}

// =============================================================================
// HISTORY
// =============================================================================

export function useTaskHistory(taskId: number | null) {
  return useQuery({
    queryKey: ['task-history', taskId],
    queryFn: async () => {
      if (!taskId) return []
      const { data } = await api.get<TaskStatusHistory[]>(`/tasks/${taskId}/history`)
      return data
    },
    enabled: !!taskId,
    staleTime: 0, // Always refetch when invalidated
  })
}
