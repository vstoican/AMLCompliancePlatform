import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export interface Role {
  id: string
  name: string
  description?: string | null
  permissions: string[]
  color: string
  is_system: boolean
  created_at?: string
  updated_at?: string
}

export interface RoleCreate {
  id: string
  name: string
  description?: string
  permissions?: string[]
  color?: string
}

export interface RoleUpdate {
  name?: string
  description?: string
  permissions?: string[]
  color?: string
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data } = await api.get<Role[]>('/roles')
      return data
    },
  })
}

export function useRole(roleId: string | null) {
  return useQuery({
    queryKey: ['role', roleId],
    queryFn: async () => {
      if (!roleId) return null
      const { data } = await api.get<Role>(`/roles/${roleId}`)
      return data
    },
    enabled: !!roleId,
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (role: RoleCreate) => {
      const { data } = await api.post<Role>('/roles', role)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...role }: RoleUpdate & { id: string }) => {
      const { data } = await api.put<Role>(`/roles/${id}`, role)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['role', variables.id] })
    },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (roleId: string) => {
      await api.delete(`/roles/${roleId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}
