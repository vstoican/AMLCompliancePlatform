import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Inbox } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
        {action && (
          <Button onClick={action.onClick} className="mt-4">
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}

interface EmptyTableStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  colSpan: number
}

export function EmptyTableState({
  icon: Icon = Inbox,
  title = 'No results',
  description = 'No data to display.',
  colSpan,
}: EmptyTableStateProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-24 text-center">
        <div className="flex flex-col items-center justify-center gap-2">
          <Icon className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </td>
    </tr>
  )
}
