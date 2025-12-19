import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useDashboardStats } from '@/hooks/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const riskColors = {
  low: {
    bg: 'bg-green-500',
    text: 'text-green-500',
    label: 'Low Risk',
  },
  medium: {
    bg: 'bg-yellow-500',
    text: 'text-yellow-500',
    label: 'Medium Risk',
  },
  high: {
    bg: 'bg-destructive',
    text: 'text-destructive',
    label: 'High Risk',
  },
}

export function RiskDistribution() {
  const { data: stats, isLoading } = useDashboardStats()

  const distribution = stats?.risk_distribution ?? { low: 0, medium: 0, high: 0 }
  const total = distribution.low + distribution.medium + distribution.high

  const getPercentage = (value: number) => {
    if (total === 0) return 0
    return Math.round((value / total) * 100)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Risk Distribution</CardTitle>
        <CardDescription>Customer risk level breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Progress bar */}
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {Object.entries(distribution).map(([level, count]) => {
                const percentage = getPercentage(count)
                if (percentage === 0) return null
                return (
                  <div
                    key={level}
                    className={cn(
                      riskColors[level as keyof typeof riskColors].bg,
                      'transition-all duration-300'
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                )
              })}
            </div>

            {/* Legend */}
            <div className="space-y-3">
              {Object.entries(distribution).map(([level, count]) => {
                const config = riskColors[level as keyof typeof riskColors]
                const percentage = getPercentage(count)
                return (
                  <div key={level} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn('h-3 w-3 rounded-full', config.bg)} />
                      <span className="text-sm">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('font-semibold', config.text)}>{count}</span>
                      <span className="text-sm text-muted-foreground">({percentage}%)</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Total */}
            <div className="pt-3 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Customers</span>
                <span className="font-semibold">{total}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
