"use client"

import { useState } from 'react'
import { Download, Users, AlertTriangle, CreditCard, ClipboardList, Shield, Calendar, FileDown, ChevronRight, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

type ExportType = 'customers' | 'alerts' | 'transactions' | 'tasks' | 'risk-assessments'

interface ExportConfig {
  type: ExportType
  title: string
  description: string
  icon: typeof Users
  filters: FilterConfig[]
}

interface FilterConfig {
  key: string
  label: string
  type: 'date' | 'select'
  options?: { value: string; label: string }[]
}

const exportConfigs: ExportConfig[] = [
  {
    type: 'customers',
    title: 'Customers',
    description: 'Complete customer database with risk profiles',
    icon: Users,
    filters: [
      {
        key: 'risk_level',
        label: 'Risk Level',
        type: 'select',
        options: [
          { value: '', label: 'All Risk Levels' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: '', label: 'All Statuses' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'pending', label: 'Pending' },
        ],
      },
    ],
  },
  {
    type: 'alerts',
    title: 'Alerts',
    description: 'Alert history with investigation details',
    icon: AlertTriangle,
    filters: [
      { key: 'from_date', label: 'From Date', type: 'date' },
      { key: 'to_date', label: 'To Date', type: 'date' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: '', label: 'All Statuses' },
          { value: 'new', label: 'New' },
          { value: 'investigating', label: 'Investigating' },
          { value: 'escalated', label: 'Escalated' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'dismissed', label: 'Dismissed' },
        ],
      },
      {
        key: 'severity',
        label: 'Severity',
        type: 'select',
        options: [
          { value: '', label: 'All Severities' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'critical', label: 'Critical' },
        ],
      },
    ],
  },
  {
    type: 'transactions',
    title: 'Transactions',
    description: 'Transaction history and financial details',
    icon: CreditCard,
    filters: [
      { key: 'from_date', label: 'From Date', type: 'date' },
      { key: 'to_date', label: 'To Date', type: 'date' },
      {
        key: 'financial_status',
        label: 'Financial Status',
        type: 'select',
        options: [
          { value: '', label: 'All Statuses' },
          { value: 'pending', label: 'Pending' },
          { value: 'completed', label: 'Completed' },
          { value: 'failed', label: 'Failed' },
          { value: 'cancelled', label: 'Cancelled' },
        ],
      },
    ],
  },
  {
    type: 'tasks',
    title: 'Tasks',
    description: 'Compliance tasks and assignments',
    icon: ClipboardList,
    filters: [
      { key: 'from_date', label: 'From Date', type: 'date' },
      { key: 'to_date', label: 'To Date', type: 'date' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: '', label: 'All Statuses' },
          { value: 'pending', label: 'Pending' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ],
      },
      {
        key: 'priority',
        label: 'Priority',
        type: 'select',
        options: [
          { value: '', label: 'All Priorities' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'critical', label: 'Critical' },
        ],
      },
      {
        key: 'task_type',
        label: 'Task Type',
        type: 'select',
        options: [
          { value: '', label: 'All Types' },
          { value: 'kyc_refresh', label: 'KYC Refresh' },
          { value: 'investigation', label: 'Investigation' },
          { value: 'document_review', label: 'Document Review' },
          { value: 'sar_filing', label: 'SAR Filing' },
        ],
      },
    ],
  },
  {
    type: 'risk-assessments',
    title: 'Risk Assessments',
    description: 'Customer risk assessment history',
    icon: Shield,
    filters: [
      { key: 'from_date', label: 'From Date', type: 'date' },
      { key: 'to_date', label: 'To Date', type: 'date' },
      {
        key: 'risk_level',
        label: 'Risk Level',
        type: 'select',
        options: [
          { value: '', label: 'All Risk Levels' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
      },
    ],
  },
]

export default function DataExportPage() {
  const [selectedType, setSelectedType] = useState<ExportType>('customers')
  const [filters, setFilters] = useState<Record<string, Record<string, string>>>({})
  const [exporting, setExporting] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const selectedConfig = exportConfigs.find((c) => c.type === selectedType)!

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [selectedType]: {
        ...prev[selectedType],
        [key]: value,
      },
    }))
  }

  const clearFilters = () => {
    setFilters((prev) => ({
      ...prev,
      [selectedType]: {},
    }))
  }

  const handleExport = async () => {
    setExporting(true)

    try {
      const params = new URLSearchParams()
      const exportFilters = filters[selectedType] || {}

      Object.entries(exportFilters).forEach(([key, value]) => {
        if (value && value !== '_all') {
          params.append(key, value)
        }
      })

      const response = await api.get(`/exports/${selectedType}`, {
        params,
        responseType: 'blob',
      })

      const contentDisposition = response.headers['content-disposition']
      let filename = `${selectedType}_export.csv`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) {
          filename = match[1]
        }
      }

      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('Export complete', {
        description: `${selectedConfig.title} exported to ${filename}`,
      })
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Export failed', {
        description: 'There was an error exporting the data.',
      })
    } finally {
      setExporting(false)
    }
  }

  const handleArchive = async () => {
    setArchiving(true)

    try {
      const params = new URLSearchParams()
      const exportFilters = filters[selectedType] || {}

      Object.entries(exportFilters).forEach(([key, value]) => {
        if (value && value !== '_all') {
          params.append(key, value)
        }
      })

      const response = await api.post(`/exports/archive/${selectedType}`, null, {
        params,
      })

      toast.success('Archive complete', {
        description: `${selectedConfig.title} archived to MinIO: ${response.data.path}`,
      })
    } catch (error) {
      console.error('Archive error:', error)
      toast.error('Archive failed', {
        description: 'There was an error archiving the data to MinIO.',
      })
    } finally {
      setArchiving(false)
    }
  }

  const activeFilterCount = Object.values(filters[selectedType] || {}).filter(
    (v) => v && v !== '_all'
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Export"
        description="Export compliance data to CSV for reporting and analysis"
        icon={Download}
      />

      <div className="flex gap-6">
        {/* Left sidebar - Export types */}
        <div className="w-64 flex-shrink-0">
          <div className="text-sm font-medium text-muted-foreground mb-3">
            Select Data Type
          </div>
          <nav className="space-y-1">
            {exportConfigs.map((config) => {
              const Icon = config.icon
              const isSelected = selectedType === config.type

              return (
                <button
                  key={config.type}
                  onClick={() => setSelectedType(config.type)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{config.title}</div>
                  </div>
                  {isSelected && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Right content - Filters and export */}
        <div className="flex-1 min-w-0">
          <div className="bg-card border rounded-lg">
            {/* Header */}
            <div className="px-6 py-4 border-b">
              <div className="flex items-center gap-3">
                {(() => {
                  const Icon = selectedConfig.icon
                  return <Icon className="h-5 w-5 text-muted-foreground" />
                })()}
                <div>
                  <h2 className="font-semibold">{selectedConfig.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedConfig.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-2 text-muted-foreground">
                      ({activeFilterCount} active)
                    </span>
                  )}
                </span>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear all
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {selectedConfig.filters.map((filter) => (
                  <div key={filter.key} className="space-y-1.5">
                    <Label htmlFor={filter.key} className="text-sm">
                      {filter.label}
                    </Label>
                    {filter.type === 'date' ? (
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id={filter.key}
                          type="date"
                          className="pl-9"
                          value={filters[selectedType]?.[filter.key] || ''}
                          onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                        />
                      </div>
                    ) : (
                      <Select
                        value={filters[selectedType]?.[filter.key] || ''}
                        onValueChange={(value) => handleFilterChange(filter.key, value)}
                      >
                        <SelectTrigger id={filter.key}>
                          <SelectValue placeholder={filter.options?.[0]?.label || 'Select...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {filter.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value || '_all'}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Export action */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {selectedType === 'transactions' && (
                    <span>Limited to 100,000 records. Use date filters for larger datasets.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleArchive}
                    disabled={archiving || exporting}
                    variant="outline"
                    size="lg"
                  >
                    {archiving ? (
                      <>
                        <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Archiving...
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4 mr-2" />
                        Archive to MinIO
                      </>
                    )}
                  </Button>
                  <Button onClick={handleExport} disabled={exporting || archiving} size="lg">
                    {exporting ? (
                      <>
                        <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <FileDown className="h-4 w-4 mr-2" />
                        Export to CSV
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
