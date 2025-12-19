import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
  variant?: 'default' | 'primary' | 'warning' | 'danger' | 'success'
}

const variantStyles = {
  default: 'bg-card',
  primary: 'bg-primary/10 border-primary/20',
  warning: 'bg-warning/10 border-warning/20',
  danger: 'bg-destructive/10 border-destructive/20',
  success: 'bg-green-500/10 border-green-500/20',
}

const iconVariantStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/20 text-primary',
  warning: 'bg-warning/20 text-warning',
  danger: 'bg-destructive/20 text-destructive',
  success: 'bg-green-500/20 text-green-500',
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className,
  variant = 'default',
}: StatsCardProps) {
  return (
    <Card className={cn(variantStyles[variant], className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && (
          <div className={cn('rounded-md p-2', iconVariantStyles[variant])}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(description || trend) && (
          <div className="flex items-center gap-2 mt-1">
            {trend && (
              <span
                className={cn(
                  'text-xs font-medium',
                  trend.isPositive ? 'text-green-500' : 'text-destructive'
                )}
              >
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
