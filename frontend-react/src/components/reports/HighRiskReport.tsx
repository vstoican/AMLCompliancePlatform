import { AlertTriangle, Download } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useHighRiskReport } from '@/hooks/queries'

export function HighRiskReport() {
  const { data: customers, isLoading } = useHighRiskReport()

  const handleExport = () => {
    if (!customers) return

    const csv = [
      ['ID', 'Name', 'Email', 'Risk Score', 'Country', 'Status'].join(','),
      ...customers.map((c) =>
        [
          c.id,
          c.full_name || `${c.first_name} ${c.last_name}`,
          c.email,
          c.risk_score,
          c.country_of_birth || 'N/A',
          c.status,
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `high-risk-customers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            High Risk Customers
          </CardTitle>
          <CardDescription>
            All customers with high risk classification
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!customers?.length}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <HighRiskReportSkeleton />
        ) : customers && customers.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">
                      {customer.full_name || `${customer.first_name} ${customer.last_name}`}
                    </TableCell>
                    <TableCell>{customer.email}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">
                        {customer.risk_score != null ? Number(customer.risk_score).toFixed(1) : 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell>{customer.country_of_birth || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={customer.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {customer.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No high risk customers found.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HighRiskReportSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
