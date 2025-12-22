import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ApiKey, ApiKeyCreateRequest, ApiKeyCreateResponse, ApiKeyUpdateRequest } from '@/types/api-key'

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data } = await api.get<ApiKey[]>('/api-keys')
      return { apiKeys: data, total: data.length }
    },
  })
}

export function useApiKey(keyId: number | null) {
  return useQuery({
    queryKey: ['api-key', keyId],
    queryFn: async () => {
      if (!keyId) return null
      const { data } = await api.get<ApiKey>(`/api-keys/${keyId}`)
      return data
    },
    enabled: !!keyId,
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (apiKey: ApiKeyCreateRequest) => {
      const { data } = await api.post<ApiKeyCreateResponse>('/api-keys', apiKey)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })
}

export function useUpdateApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...update }: ApiKeyUpdateRequest & { id: number }) => {
      const { data } = await api.patch<ApiKey>(`/api-keys/${id}`, update)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      queryClient.invalidateQueries({ queryKey: ['api-key', variables.id] })
    },
  })
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (keyId: number) => {
      await api.delete(`/api-keys/${keyId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })
}

export function useToggleApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const { data } = await api.patch<ApiKey>(`/api-keys/${id}`, { is_active })
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      queryClient.invalidateQueries({ queryKey: ['api-key', variables.id] })
    },
  })
}
