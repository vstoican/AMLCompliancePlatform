import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type {
  WorkflowDefinition,
  WorkflowDefinitionCreate,
  WorkflowDefinitionUpdate,
  WorkflowExecution,
  WorkflowRunRequest,
} from '@/types/workflow'

// =============================================================================
// QUERY KEYS
// =============================================================================

export const workflowDefinitionKeys = {
  all: ['workflow-definitions'] as const,
  lists: () => [...workflowDefinitionKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...workflowDefinitionKeys.lists(), filters] as const,
  details: () => [...workflowDefinitionKeys.all, 'detail'] as const,
  detail: (id: number) => [...workflowDefinitionKeys.details(), id] as const,
  history: (id: number) => [...workflowDefinitionKeys.detail(id), 'history'] as const,
}

// =============================================================================
// LIST WORKFLOW DEFINITIONS
// =============================================================================

interface ListWorkflowDefinitionsParams {
  enabled_only?: boolean
  workflow_type?: string
  schedule_type?: string
}

export function useWorkflowDefinitions(params?: ListWorkflowDefinitionsParams) {
  return useQuery({
    queryKey: workflowDefinitionKeys.list(params as Record<string, unknown> || {}),
    queryFn: async () => {
      const { data } = await api.get<WorkflowDefinition[]>('/workflow-definitions', { params })
      return data
    },
  })
}

// =============================================================================
// GET SINGLE WORKFLOW DEFINITION
// =============================================================================

export function useWorkflowDefinition(id: number) {
  return useQuery({
    queryKey: workflowDefinitionKeys.detail(id),
    queryFn: async () => {
      const { data } = await api.get<WorkflowDefinition>(`/workflow-definitions/${id}`)
      return data
    },
    enabled: id > 0,
  })
}

// =============================================================================
// CREATE WORKFLOW DEFINITION
// =============================================================================

export function useCreateWorkflowDefinition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (definition: WorkflowDefinitionCreate) => {
      const { data } = await api.post<WorkflowDefinition>('/workflow-definitions', definition)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowDefinitionKeys.all })
    },
  })
}

// =============================================================================
// UPDATE WORKFLOW DEFINITION
// =============================================================================

export function useUpdateWorkflowDefinition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: WorkflowDefinitionUpdate & { id: number }) => {
      const { data } = await api.patch<WorkflowDefinition>(`/workflow-definitions/${id}`, updates)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: workflowDefinitionKeys.all })
      queryClient.setQueryData(workflowDefinitionKeys.detail(data.id), data)
    },
  })
}

// =============================================================================
// DELETE WORKFLOW DEFINITION
// =============================================================================

export function useDeleteWorkflowDefinition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/workflow-definitions/${id}`)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowDefinitionKeys.all })
    },
  })
}

// =============================================================================
// TOGGLE WORKFLOW DEFINITION (ENABLE/DISABLE)
// =============================================================================

export function useToggleWorkflowDefinition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<WorkflowDefinition>(`/workflow-definitions/${id}/toggle`)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: workflowDefinitionKeys.all })
      queryClient.setQueryData(workflowDefinitionKeys.detail(data.id), data)
    },
  })
}

// =============================================================================
// RUN WORKFLOW MANUALLY
// =============================================================================

export function useRunWorkflow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...request }: WorkflowRunRequest & { id: number }) => {
      const { data } = await api.post<WorkflowExecution>(`/workflow-definitions/${id}/run`, request)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: workflowDefinitionKeys.history(variables.id) })
    },
  })
}

// =============================================================================
// GET WORKFLOW EXECUTION HISTORY
// =============================================================================

interface WorkflowHistoryParams {
  limit?: number
  offset?: number
}

export function useWorkflowHistory(id: number, params?: WorkflowHistoryParams) {
  return useQuery({
    queryKey: workflowDefinitionKeys.history(id),
    queryFn: async () => {
      const { data } = await api.get<WorkflowExecution[]>(`/workflow-definitions/${id}/history`, { params })
      return data
    },
    enabled: id > 0,
  })
}

// =============================================================================
// LIST ALL EXECUTIONS
// =============================================================================

interface AllExecutionsParams {
  status?: string
  limit?: number
  offset?: number
}

export function useAllWorkflowExecutions(params?: AllExecutionsParams) {
  return useQuery({
    queryKey: ['workflow-executions', params],
    queryFn: async () => {
      const { data } = await api.get<WorkflowExecution[]>('/workflow-definitions/executions/all', { params })
      return data
    },
  })
}
