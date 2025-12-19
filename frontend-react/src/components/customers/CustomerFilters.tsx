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
import type { CustomerFilters as Filters } from '@/types/customer'

interface CustomerFiltersProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

export function CustomerFilters({ filters, onFiltersChange }: CustomerFiltersProps) {
  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value || undefined })
  }

  const handleRiskLevelChange = (value: string) => {
    onFiltersChange({ ...filters, risk_level: value === 'all' ? undefined : value })
  }

  const handleStatusChange = (value: string) => {
    onFiltersChange({ ...filters, status: value === 'all' ? undefined : value })
  }

  const clearFilters = () => {
    onFiltersChange({})
  }

  const hasFilters = filters.search || filters.risk_level || filters.status

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customers..."
          value={filters.search || ''}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={filters.risk_level || 'all'} onValueChange={handleRiskLevelChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Risk Level" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Risk</SelectItem>
          <SelectItem value="low">Low Risk</SelectItem>
          <SelectItem value="medium">Medium Risk</SelectItem>
          <SelectItem value="high">High Risk</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.status || 'all'} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="INACTIVE">Inactive</SelectItem>
          <SelectItem value="BLOCKED">Blocked</SelectItem>
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
