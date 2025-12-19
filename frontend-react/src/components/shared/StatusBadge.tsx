import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type StatusType =
  | 'open' | 'assigned' | 'investigating' | 'escalated' | 'on_hold' | 'resolved'  // Alert statuses
  | 'pending' | 'active' | 'inactive' | 'blocked'  // Customer/User statuses
  | 'completed' | 'in_progress' | 'overdue' | 'cancelled'  // Task statuses
  | 'success' | 'failed' | 'running'  // Workflow statuses

interface StatusBadgeProps {
  status: StatusType | string
  className?: string
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  // Alert statuses
  open: { label: 'Open', variant: 'destructive', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  assigned: { label: 'Assigned', variant: 'default', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  investigating: { label: 'Investigating', variant: 'default', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  escalated: { label: 'Escalated', variant: 'destructive', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  on_hold: { label: 'On Hold', variant: 'secondary', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  resolved: { label: 'Resolved', variant: 'default', className: 'bg-green-500/20 text-green-400 border-green-500/30' },

  // Customer/User statuses
  pending: { label: 'Pending', variant: 'secondary', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  active: { label: 'Active', variant: 'default', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  inactive: { label: 'Inactive', variant: 'secondary', className: 'bg-muted text-muted-foreground border-muted' },
  blocked: { label: 'Blocked', variant: 'destructive', className: 'bg-destructive/20 text-destructive border-destructive/30' },

  // Task statuses
  completed: { label: 'Completed', variant: 'default', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  in_progress: { label: 'In Progress', variant: 'default', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  overdue: { label: 'Overdue', variant: 'destructive', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  cancelled: { label: 'Cancelled', variant: 'secondary', className: 'bg-muted text-muted-foreground border-muted' },

  // Workflow statuses
  success: { label: 'Success', variant: 'default', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  failed: { label: 'Failed', variant: 'destructive', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  running: { label: 'Running', variant: 'default', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().replace(/\s+/g, '_')
  const config = statusConfig[normalizedStatus] || {
    label: status,
    variant: 'secondary' as const,
    className: 'bg-muted text-muted-foreground border-muted',
  }

  return (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  )
}
