import { Clock, User, CheckCircle, Play, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge, SeverityBadge } from '@/components/shared'
import { formatDistanceToNow, formatDate } from '@/lib/utils'
import type { Task } from '@/types/task'

interface TaskCardProps {
  task: Task
  onClaim?: (task: Task) => void
  onRelease?: (task: Task) => void
  onComplete?: (task: Task) => void
  onClick?: (task: Task) => void
  currentUserId?: string
}

export function TaskCard({
  task,
  onClaim,
  onRelease,
  onComplete,
  onClick,
  currentUserId,
}: TaskCardProps) {
  const isAssignedToMe = task.assigned_to === currentUserId
  const canClaim = !task.assigned_to && task.status !== 'completed'
  const canRelease = isAssignedToMe && task.status !== 'completed'
  const canComplete = isAssignedToMe && task.status === 'in_progress'

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onClick?.(task)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">#{task.id}</span>
              <h4 className="font-semibold leading-tight">{task.title}</h4>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {task.description || 'No description'}
            </p>
          </div>
          <SeverityBadge severity={task.priority} />
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            <span>{task.assigned_to_name || 'Unassigned'}</span>
          </div>
          {task.due_date && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{formatDate(task.due_date)}</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <StatusBadge status={task.status} />
          <span className="text-xs text-muted-foreground">
            Created {formatDistanceToNow(task.created_at)}
          </span>
        </div>
      </CardContent>
      <CardFooter className="pt-2 border-t">
        <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
          {canClaim && (
            <Button size="sm" variant="outline" onClick={() => onClaim?.(task)}>
              <Play className="h-4 w-4 mr-1" />
              Claim
            </Button>
          )}
          {canRelease && (
            <Button size="sm" variant="outline" onClick={() => onRelease?.(task)}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Release
            </Button>
          )}
          {canComplete && (
            <Button size="sm" onClick={() => onComplete?.(task)}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Complete
            </Button>
          )}
          {task.status === 'completed' && (
            <span className="text-sm text-green-500 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              Completed
            </span>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
