export interface Customer {
  id: string
  member_id: string
  first_name: string
  last_name: string
  full_name: string
  phone_number?: string
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED'
  email?: string
  birth_date?: string
  identity_number?: string
  country_of_birth?: string
  address_city?: string
  document_type?: 'PERSONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE'
  document_id?: string
  document_date_of_expire?: string
  data_validated?: 'VALIDATED' | 'NOT VALIDATED' | 'PENDING'
  marketing_consent?: 'ACCEPTED' | 'REJECTED'
  risk_score: number
  risk_level: 'low' | 'medium' | 'high'
  pep_flag: boolean
  sanctions_hit: boolean
  created_at?: string
  updated_at?: string
}

export interface CustomerFilters {
  search?: string
  risk_level?: string
  status?: string
}
