import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export interface CompanySettings {
  company_name: string
  registration_number?: string | null
  address_line1?: string | null
  city?: string | null
  postal_code?: string | null
  country?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  website?: string | null
  compliance_officer_name?: string | null
  compliance_officer_email?: string | null
  compliance_officer_phone?: string | null
  updated_at?: string | null
}

export function useCompanySettings() {
  return useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await api.get<CompanySettings>('/company-settings')
      return data
    },
  })
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<CompanySettings>) => {
      const { data } = await api.put<CompanySettings>('/company-settings', settings)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] })
    },
  })
}
