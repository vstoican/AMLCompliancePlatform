import { CreditCard, TrendingUp, AlertTriangle, ClipboardList } from 'lucide-react'
import { StatsCard } from '@/components/shared'
import { useDashboardStats } from '@/hooks/queries'
import { Skeleton } from '@/components/ui/skeleton'

function formatVolume(value: number): string {
  if (value >= 1_000_000) {
    return `€${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `€${(value / 1_000).toFixed(1)}K`
  }
  return `€${value.toFixed(0)}`
}

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
        title="Transactions Today"
        value={stats?.transactions_today ?? 0}
        icon={CreditCard}
        description="Processed today"
      />
      <StatsCard
        title="Volume Today"
        value={formatVolume(stats?.volume_today ?? 0)}
        icon={TrendingUp}
        description="Total amount"
      />
      <StatsCard
        title="Pending Tasks"
        value={stats?.pending_tasks ?? 0}
        icon={ClipboardList}
        variant="primary"
        description="To be completed"
      />
      <StatsCard
        title="Open Alerts"
        value={stats?.open_alerts ?? 0}
        icon={AlertTriangle}
        variant="warning"
        description="Pending investigation"
      />
    </div>
  )
}
