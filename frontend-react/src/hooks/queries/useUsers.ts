import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { User } from '@/types/user'

interface UsersResponse {
  users: User[]
  total: number
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get<UsersResponse>('/users')
      return data
    },
  })
}

export function useUser(userId: string | null) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      if (!userId) return null
      const { data } = await api.get<User>(`/users/${userId}`)
      return data
    },
    enabled: !!userId,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (user: Partial<User> & { password: string }) => {
      const { data } = await api.post<User>('/users', user)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...user }: Partial<User> & { id: string }) => {
      const { data } = await api.put<User>(`/users/${id}`, user)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user', variables.id] })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/users/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      await api.post(`/users/${userId}/reset-password`, {
        new_password: newPassword,
      })
    },
  })
}
