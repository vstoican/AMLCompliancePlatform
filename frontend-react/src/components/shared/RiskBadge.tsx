import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface RiskBadgeProps {
  level: 'low' | 'medium' | 'high' | 'critical' | string
  score?: number
  showScore?: boolean
  className?: string
}

const riskConfig = {
  low: {
    label: 'Low',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  medium: {
    label: 'Medium',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  high: {
    label: 'High',
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  critical: {
    label: 'Critical',
    className: 'bg-destructive/20 text-destructive border-destructive/30',
  },
}

export function RiskBadge({ level, score, showScore = false, className }: RiskBadgeProps) {
  const normalizedLevel = level.toLowerCase() as keyof typeof riskConfig
  const config = riskConfig[normalizedLevel] || riskConfig.medium

  return (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
    >
      {config.label}
      {showScore && score !== undefined && (
        <span className="ml-1 opacity-70">({score})</span>
      )}
    </Badge>
  )
}

interface SeverityBadgeProps {
  severity: 'low' | 'medium' | 'high' | 'critical' | string
  className?: string
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return <RiskBadge level={severity} className={className} />
}
