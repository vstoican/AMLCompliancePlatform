import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Transaction, TransactionFilters } from '@/types/transaction'

interface TransactionsResponse {
  transactions: Transaction[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

interface UseTransactionsOptions extends TransactionFilters {
  page?: number
  pageSize?: number
}

export function useTransactions(options?: UseTransactionsOptions) {
  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 20
  const offset = (page - 1) * pageSize

  return useQuery({
    queryKey: ['transactions', options],
    queryFn: async () => {
      const params = new URLSearchParams()
      // API uses limit/offset, not page/page_size
      params.append('limit', pageSize.toString())
      params.append('offset', offset.toString())
      if (options?.search) params.append('search', options.search)
      if (options?.status) params.append('financial_status', options.status)
      if (options?.settlement_status) params.append('settlement_status', options.settlement_status)
      if (options?.customer_id) params.append('customer_id', options.customer_id)

      const { data } = await api.get<TransactionsResponse>(`/transactions?${params}`)

      // Calculate pagination info
      const totalPages = Math.ceil(data.total / pageSize)

      return {
        ...data,
        page,
        pageSize,
        totalPages,
      }
    },
  })
}

export function useTransaction(transactionId: number | null) {
  return useQuery({
    queryKey: ['transaction', transactionId],
    queryFn: async () => {
      if (!transactionId) return null
      const { data } = await api.get<Transaction>(`/transactions/${transactionId}`)
      return data
    },
    enabled: !!transactionId,
  })
}

export function useCustomerTransactions(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-transactions', customerId],
    queryFn: async () => {
      if (!customerId) return { transactions: [], total: 0 }
      const { data } = await api.get<TransactionsResponse>(
        `/transactions?customer_id=${customerId}`
      )
      return data
    },
    enabled: !!customerId,
  })
}
