import { Users, AlertTriangle, ClipboardList, TrendingUp } from 'lucide-react'
import { StatsCard } from '@/components/shared'
import { useDashboardStats } from '@/hooks/queries'
import { Skeleton } from '@/components/ui/skeleton'

export function StatsOverview() {
  const { data: stats, isLoading } = useDashboardStats()

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-6 rounded-lg border bg-card">
            <Skeleton className="h-4 w-24 mb-4" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Total Customers"
        value={stats?.total_customers ?? 0}
        icon={Users}
        description="Active in the system"
      />
      <StatsCard
        title="High Risk Customers"
        value={stats?.high_risk_customers ?? 0}
        icon={TrendingUp}
        variant="danger"
        description="Require monitoring"
      />
      <StatsCard
        title="Open Alerts"
        value={stats?.open_alerts ?? 0}
        icon={AlertTriangle}
        variant="warning"
        description="Pending investigation"
      />
      <StatsCard
        title="Pending Tasks"
        value={stats?.pending_tasks ?? 0}
        icon={ClipboardList}
        variant="primary"
        description="To be completed"
      />
    </div>
  )
}
