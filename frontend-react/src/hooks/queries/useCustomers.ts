import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Customer, CustomerFilters } from '@/types/customer'

export function useCustomers(filters?: CustomerFilters) {
  return useQuery({
    queryKey: ['customers', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.search) params.append('search', filters.search)
      if (filters?.risk_level) params.append('risk_level', filters.risk_level)
      if (filters?.status) params.append('status', filters.status)

      // API returns array directly, not wrapped in object
      const { data } = await api.get<Customer[]>(`/customers?${params}`)
      return data
    },
  })
}

export function useCustomer(customerId: string | null) {
  return useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      if (!customerId) return null
      const { data } = await api.get<Customer>(`/customers/${customerId}`)
      return data
    },
    enabled: !!customerId,
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (customer: Partial<Customer>) => {
      const { data } = await api.post<Customer>('/customers', customer)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...customer }: Partial<Customer> & { id: string }) => {
      const { data } = await api.patch<Customer>(`/customers/${id}`, customer)
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer', variables.id] })
    },
  })
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (customerId: string) => {
      await api.delete(`/customers/${customerId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
