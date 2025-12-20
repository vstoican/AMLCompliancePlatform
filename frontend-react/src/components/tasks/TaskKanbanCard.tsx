import { Clock, User, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatDistanceToNow } from '@/lib/utils'
import type { Task } from '@/types/task'

interface TaskKanbanCardProps {
  task: Task
  onClick?: (task: Task) => void
}

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
}

const priorityIndicator: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-blue-500',
}

export function TaskKanbanCard({ task, onClick }: TaskKanbanCardProps) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'

  return (
    <Card
      className={cn(
        'cursor-pointer hover:border-primary/50 hover:shadow-md transition-all',
        isOverdue && 'border-red-500/50'
      )}
      onClick={() => onClick?.(task)}
    >
      <CardContent className="p-3 space-y-2">
        {/* Priority indicator bar */}
        <div className={cn('h-1 -mx-3 -mt-3 rounded-t-lg', priorityIndicator[task.priority])} />

        {/* Title */}
        <h4 className="font-medium text-sm leading-tight line-clamp-2 mt-2">
          {task.title}
        </h4>

        {/* Task type */}
        <Badge variant="outline" className="text-xs">
          {task.task_type.replace(/_/g, ' ')}
        </Badge>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.assigned_to_name ? (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span className="truncate max-w-[100px]">{task.assigned_to_name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-amber-500">
              <User className="h-3 w-3" />
              <span>Unassigned</span>
            </div>
          )}
        </div>

        {/* Due date and priority */}
        <div className="flex items-center justify-between pt-1">
          {task.due_date ? (
            <div className={cn(
              'flex items-center gap-1 text-xs',
              isOverdue ? 'text-red-500' : 'text-muted-foreground'
            )}>
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              <Clock className="h-3 w-3" />
              <span>{formatDistanceToNow(task.due_date)}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No due date</span>
          )}
          <Badge variant="outline" className={cn('text-xs', priorityColors[task.priority])}>
            {task.priority}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
