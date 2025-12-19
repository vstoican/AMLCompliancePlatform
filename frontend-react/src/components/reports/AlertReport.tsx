"use client"

import { useState } from 'react'
import { Bell, Download, Search } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAlertReport } from '@/hooks/queries'
import type { ReportFilters } from '@/hooks/queries'
import { formatDateTime } from '@/lib/utils'

const severityColors: Record<string, string> = {
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
}

export function AlertReport() {
  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const [filters, setFilters] = useState<ReportFilters>({
    from_date: thirtyDaysAgo,
    to_date: today,
  })

  const { data: alerts, isLoading, refetch } = useAlertReport(filters)

  const handleSearch = () => {
    refetch()
  }

  const handleExport = () => {
    if (!alerts) return

    const csv = [
      ['ID', 'Type', 'Scenario', 'Severity', 'Status', 'Customer', 'Created At'].join(','),
      ...alerts.map((a) =>
        [
          a.id,
          a.type,
          a.scenario,
          a.severity,
          a.status,
          a.customer_name || 'N/A',
          a.created_at,
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `alert-report-${filters.from_date}-to-${filters.to_date}.csv`
    link.click()
  }

  // Calculate summary stats
  const summary = alerts
    ? {
        total: alerts.length,
        critical: alerts.filter((a) => a.severity === 'critical').length,
        high: alerts.filter((a) => a.severity === 'high').length,
        resolved: alerts.filter((a) => a.status === 'resolved').length,
      }
    : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Alert Summary Report
          </CardTitle>
          <CardDescription>
            Alerts generated within the specified date range
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!alerts?.length}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Date Filters */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="from_date">From Date</Label>
            <Input
              id="from_date"
              type="date"
              value={filters.from_date}
              onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to_date">To Date</Label>
            <Input
              id="to_date"
              type="date"
              value={filters.to_date}
              onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
            />
          </div>
          <Button onClick={handleSearch}>
            <Search className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Alerts</p>
              <p className="text-2xl font-bold">{summary.total}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold text-red-500">{summary.critical}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">High</p>
              <p className="text-2xl font-bold text-orange-500">{summary.high}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Resolved</p>
              <p className="text-2xl font-bold text-green-500">{summary.resolved}</p>
            </div>
          </div>
        )}

        {/* Results Table */}
        {isLoading ? (
          <AlertReportSkeleton />
        ) : alerts && alerts.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scenario</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>#{alert.id}</TableCell>
                    <TableCell className="capitalize">{alert.type.replace('_', ' ')}</TableCell>
                    <TableCell>{alert.scenario}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={severityColors[alert.severity]}>
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={alert.status === 'resolved' ? 'default' : 'secondary'}>
                        {alert.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{alert.customer_name || 'N/A'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(alert.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {filters.from_date && filters.to_date
              ? 'No alerts found for the selected date range.'
              : 'Select a date range and click "Generate Report" to view results.'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AlertReportSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
