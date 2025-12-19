import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AlertFilters as Filters } from '@/types/alert'

interface AlertFiltersProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

export function AlertFilters({ filters, onFiltersChange }: AlertFiltersProps) {
  const handleTypeChange = (value: string) => {
    onFiltersChange({ ...filters, type: value === 'all' ? undefined : value })
  }

  const handleSeverityChange = (value: string) => {
    onFiltersChange({ ...filters, severity: value === 'all' ? undefined : value })
  }

  const handleStatusChange = (value: string) => {
    onFiltersChange({ ...filters, status: value === 'all' ? undefined : value })
  }

  const clearFilters = () => {
    onFiltersChange({})
  }

  const hasFilters = filters.type || filters.severity || filters.status

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Select value={filters.type || 'all'} onValueChange={handleTypeChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Alert Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="transaction_monitoring">Transaction Monitoring</SelectItem>
          <SelectItem value="customer_risk">Customer Risk</SelectItem>
          <SelectItem value="sanctions">Sanctions</SelectItem>
          <SelectItem value="workflow">Workflow</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.severity || 'all'} onValueChange={handleSeverityChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Severity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Severity</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.status || 'all'} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="assigned">Assigned</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="escalated">Escalated</SelectItem>
          <SelectItem value="on_hold">On Hold</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
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
