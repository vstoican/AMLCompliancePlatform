"use client"

import { useState } from 'react'
import { CreditCard, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TransactionTable, TransactionFilters } from '@/components/transactions'
import { useTransactions } from '@/hooks/queries'
import type { TransactionFilters as Filters } from '@/types/transaction'

export default function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { data, isLoading } = useTransactions({
    ...filters,
    page,
    pageSize,
  })

  const totalPages = data?.totalPages ?? 1
  const canPreviousPage = page > 1
  const canNextPage = page < totalPages

  const handlePageSizeChange = (newSize: string) => {
    setPageSize(Number(newSize))
    setPage(1) // Reset to first page when changing page size
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-muted-foreground">
          Monitor and analyze transaction activity across all customers
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Search and filter transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionFilters filters={filters} onFiltersChange={(f) => { setFilters(f); setPage(1); }} />
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Transaction List</CardTitle>
            </div>
            {data && (
              <span className="text-sm text-muted-foreground">
                {data.total.toLocaleString()} total transactions
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <TransactionTable
            transactions={data?.transactions ?? []}
            isLoading={isLoading}
            showPagination={false}
          />

          {/* Server-side Pagination */}
          <div className="flex items-center justify-between px-2">
            <div className="flex-1 text-sm text-muted-foreground">
              Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, data?.total ?? 0)} of {data?.total?.toLocaleString() ?? 0} transactions
            </div>
            <div className="flex items-center space-x-6 lg:space-x-8">
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium">Rows per page</p>
                <Select value={`${pageSize}`} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={pageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[10, 20, 50, 100].map((size) => (
                      <SelectItem key={size} value={`${size}`}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-[100px] items-center justify-center text-sm font-medium">
                Page {page} of {totalPages.toLocaleString()}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  className="hidden h-8 w-8 p-0 lg:flex"
                  onClick={() => setPage(1)}
                  disabled={!canPreviousPage}
                >
                  <span className="sr-only">Go to first page</span>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage(p => p - 1)}
                  disabled={!canPreviousPage}
                >
                  <span className="sr-only">Go to previous page</span>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!canNextPage}
                >
                  <span className="sr-only">Go to next page</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="hidden h-8 w-8 p-0 lg:flex"
                  onClick={() => setPage(totalPages)}
                  disabled={!canNextPage}
                >
                  <span className="sr-only">Go to last page</span>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
