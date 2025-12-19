import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Task, TaskFilters } from '@/types/task'

interface TasksResponse {
  tasks: Task[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

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

      const { data } = await api.get<TasksResponse>(`/tasks?${params}`)
      return data
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
      const { data } = await api.put<Task>(`/tasks/${id}`, task)
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
    mutationFn: async (taskId: number) => {
      const { data } = await api.post<Task>(`/tasks/${taskId}/claim`)
      return data
    },
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
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
    },
  })
}

export function useCompleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId, notes }: { taskId: number; notes?: string }) => {
      const { data } = await api.post<Task>(`/tasks/${taskId}/complete`, { notes })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId] })
    },
  })
}
