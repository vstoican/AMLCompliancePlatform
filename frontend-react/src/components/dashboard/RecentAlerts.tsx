import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge, SeverityBadge, EmptyState } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { useAlerts } from '@/hooks/queries'
import { formatDistanceToNow } from '@/lib/utils'

export function RecentAlerts() {
  const navigate = useNavigate()
  const { data, isLoading } = useAlerts({ pageSize: 5, status: 'open' })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">Recent Alerts</CardTitle>
          <CardDescription>Latest alerts requiring attention</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/alerts')}>
          View All
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : !data?.alerts?.length ? (
          <EmptyState
            icon={AlertTriangle}
            title="No open alerts"
            description="All alerts have been addressed."
            className="py-8"
          />
        ) : (
          <div className="space-y-4">
            {data.alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate('/alerts')}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{alert.scenario}</span>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {alert.customer_name && <span>{alert.customer_name}</span>}
                    <span>•</span>
                    <span>{formatDistanceToNow(alert.created_at)}</span>
                  </div>
                </div>
                <StatusBadge status={alert.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
