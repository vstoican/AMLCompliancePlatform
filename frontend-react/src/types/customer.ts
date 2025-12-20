export interface Customer {
  id: string
  member_id: string
  first_name?: string
  last_name?: string
  full_name: string
  phone_number?: string
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED'
  email?: string
  country?: string

  // Risk scoring
  risk_score: number
  risk_level: 'low' | 'medium' | 'high'
  risk_override?: string
  geography_risk?: number
  product_risk?: number
  behavior_risk?: number
  pep_flag: boolean
  sanctions_hit: boolean

  // Personal information
  birth_date?: string
  identity_number?: string
  place_of_birth?: string
  country_of_birth?: string
  employer_name?: string

  // Address
  address_county?: string
  address_city?: string
  address_street?: string
  address_house_number?: string
  address_block_number?: string
  address_entrance?: string
  address_apartment?: string

  // Document information
  document_type?: 'PERSONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE'
  document_id?: string
  document_issuer?: string
  document_date_of_issue?: string
  document_date_of_expire?: string
  id_document_expiry?: string

  // Financial information
  leanpay_monthly_repayment?: number
  available_monthly_credit_limit?: number
  available_exposure?: number
  limit_exposure_last_update?: string

  // Consent and validation
  data_validated?: 'VALIDATED' | 'NOT VALIDATED' | 'PENDING'
  marketing_consent?: 'ACCEPTED' | 'REJECTED' | 'NOT SET'
  marketing_consent_last_modified?: string
  kyc_motion_consent_given?: boolean
  kyc_motion_consent_date?: string

  // Timestamps
  application_time?: string
  created_at?: string
  updated_at?: string
}

export interface CustomerFilters {
  search?: string
  risk_level?: string
  status?: string
}
