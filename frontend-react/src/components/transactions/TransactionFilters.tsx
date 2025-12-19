import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TransactionFilters as Filters } from '@/types/transaction'

interface TransactionFiltersProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

export function TransactionFilters({ filters, onFiltersChange }: TransactionFiltersProps) {
  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value || undefined })
  }

  const handleStatusChange = (value: string) => {
    onFiltersChange({ ...filters, financial_status: value === 'all' ? undefined : value })
  }

  const handleSettlementChange = (value: string) => {
    onFiltersChange({ ...filters, settlement_status: value === 'all' ? undefined : value })
  }

  const clearFilters = () => {
    onFiltersChange({})
  }

  const hasFilters = filters.search || filters.financial_status || filters.settlement_status

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search transactions..."
          value={filters.search || ''}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={filters.financial_status || 'all'} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="COMPLETED">Completed</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.settlement_status || 'all'} onValueChange={handleSettlementChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Settlement" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Settlement</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
          <SelectItem value="unpaid">Unpaid</SelectItem>
          <SelectItem value="partial">Partial</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  )
}
