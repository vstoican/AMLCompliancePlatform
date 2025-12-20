import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckSquare, Clock, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { useTasks } from '@/hooks/queries'
import { useAuthStore } from '@/stores/authStore'
import { formatDistanceToNow, cn } from '@/lib/utils'

const priorityConfig = {
  low: { color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
  medium: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  high: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  critical: { color: 'bg-red-500/10 text-red-500 border-red-500/20' },
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/20' },
  in_progress: { icon: AlertCircle, color: 'text-blue-500', bg: 'bg-blue-500/20' },
  completed: { icon: CheckSquare, color: 'text-green-500', bg: 'bg-green-500/20' },
}

export function MyTasks() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)

  // Fetch tasks assigned to the current user (pending and in_progress only)
  const { data, isLoading } = useTasks({
    assigned_to: user?.id,
  })

  // Filter to only show pending and in_progress tasks
  const activeTasks = data?.tasks?.filter(t => t.status === 'pending' || t.status === 'in_progress') || []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">My Tasks</CardTitle>
          <CardDescription>Tasks assigned to you</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
          View All
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : !activeTasks.length ? (
          <EmptyState
            icon={CheckSquare}
            title="No active tasks"
            description="You have no tasks assigned to you."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {activeTasks.slice(0, 5).map((task) => {
              const status = statusConfig[task.status] || statusConfig.pending
              const priority = priorityConfig[task.priority] || priorityConfig.medium
              const StatusIcon = status.icon

              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate('/tasks')}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                      'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
                      status.bg
                    )}>
                      <StatusIcon className={cn('h-4 w-4', status.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">
                        {task.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {task.task_type.replace(/_/g, ' ')} • {formatDistanceToNow(task.created_at)}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn('ml-2 flex-shrink-0 text-[10px]', priority.color)}>
                    {task.priority}
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
