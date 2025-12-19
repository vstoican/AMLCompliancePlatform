export interface Transaction {
  id: number
  surrogate_id: string
  member_id: string
  person_first_name?: string
  person_last_name?: string
  vendor_name?: string
  price_number_of_months?: number
  grace_number_of_months?: number
  original_transaction_amount: number
  amount: number
  currency: string
  type: string
  vendor_transaction_id?: string
  client_settlement_status: 'paid' | 'unpaid' | 'partial'
  vendor_settlement_status: 'paid' | 'unpaid' | 'partial'
  transaction_delivery_status: 'PENDING' | 'DELIVERED' | 'CANCELLED'
  partial_delivery: boolean
  transaction_last_activity?: string
  transaction_financial_status: 'PENDING' | 'COMPLETED' | 'FAILED'
  status: string
  customer_id: string
  customer_name?: string
  risk_level?: 'low' | 'medium' | 'high'
  created_at: string
}

export interface TransactionFilters {
  search?: string
  financial_status?: string
  settlement_status?: string
  status?: string
  customer_id?: string
  limit?: number
  offset?: number
}

export interface TransactionPagination {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}
