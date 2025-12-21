import { useNavigate } from 'react-router-dom'
import { ArrowRight, UserX, Clock, AlertTriangle, CalendarClock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTasks } from '@/hooks/queries'
import { formatDistanceToNow, cn } from '@/lib/utils'
import type { Task } from '@/types/task'

const priorityConfig = {
  low: { color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
  medium: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  high: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  critical: { color: 'bg-red-500/10 text-red-500 border-red-500/20' },
}

function isApproachingDeadline(dueDate: string | undefined): boolean {
  if (!dueDate) return false
  const due = new Date(dueDate)
  const now = new Date()
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  return due <= threeDaysFromNow && due >= now
}

function isOverdue(dueDate: string | undefined): boolean {
  if (!dueDate) return false
  const due = new Date(dueDate)
  const now = new Date()
  return due < now
}

function getDaysUntilDue(dueDate: string): string {
  const due = new Date(dueDate)
  const now = new Date()
  const diffTime = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  return `Due in ${diffDays} days`
}

interface TaskItemProps {
  task: Task
  onClick: () => void
  showDueDate?: boolean
}

function TaskItem({ task, onClick, showDueDate }: TaskItemProps) {
  const priority = priorityConfig[task.priority] || priorityConfig.medium
  const overdue = isOverdue(task.due_date)

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
          overdue ? 'bg-red-500/20' : 'bg-muted'
        )}>
          {overdue ? (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          ) : showDueDate ? (
            <CalendarClock className="h-4 w-4 text-orange-500" />
          ) : (
            <UserX className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">
            {task.title}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {showDueDate && task.due_date ? (
              <span className={cn(overdue && 'text-red-500 font-medium')}>
                {getDaysUntilDue(task.due_date)}
              </span>
            ) : (
              <>
                {task.task_type.replace(/_/g, ' ')} • {formatDistanceToNow(task.created_at)}
              </>
            )}
          </div>
        </div>
      </div>
      <Badge variant="outline" className={cn('ml-2 flex-shrink-0 text-[10px]', priority.color)}>
        {task.priority}
      </Badge>
    </div>
  )
}

export function TasksOverview() {
  const navigate = useNavigate()

  // Fetch all non-completed tasks
  const { data, isLoading } = useTasks({})

  // Filter tasks
  const allTasks = data?.tasks?.filter(t => t.status !== 'completed') || []

  // Unassigned tasks
  const unassignedTasks = allTasks.filter(t => !t.assigned_to)

  // Tasks approaching deadline (within 3 days) or overdue
  const approachingDeadlineTasks = allTasks.filter(t =>
    t.due_date && (isApproachingDeadline(t.due_date) || isOverdue(t.due_date))
  ).sort((a, b) => {
    // Sort by due date (earliest first)
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  })

  const overdueTasks = approachingDeadlineTasks.filter(t => isOverdue(t.due_date))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">Task Overview</CardTitle>
          <CardDescription>Unassigned tasks and upcoming deadlines</CardDescription>
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
        ) : (
          <Tabs defaultValue="unassigned" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="unassigned" className="flex items-center gap-2">
                <UserX className="h-4 w-4" />
                Unassigned
                {unassignedTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {unassignedTasks.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="deadline" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Deadlines
                {approachingDeadlineTasks.length > 0 && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "ml-1 h-5 px-1.5 text-xs",
                      overdueTasks.length > 0 && "bg-red-500/20 text-red-500"
                    )}
                  >
                    {approachingDeadlineTasks.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="unassigned" className="mt-0">
              {unassignedTasks.length === 0 ? (
                <EmptyState
                  icon={UserX}
                  title="No unassigned tasks"
                  description="All tasks have been assigned."
                  className="py-8"
                />
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {unassignedTasks.slice(0, 10).map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onClick={() => navigate('/tasks')}
                    />
                  ))}
                  {unassignedTasks.length > 10 && (
                    <p className="text-xs text-center text-muted-foreground pt-2">
                      +{unassignedTasks.length - 10} more unassigned tasks
                    </p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="deadline" className="mt-0">
              {approachingDeadlineTasks.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No upcoming deadlines"
                  description="No tasks with deadlines in the next 3 days."
                  className="py-8"
                />
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {approachingDeadlineTasks.slice(0, 10).map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onClick={() => navigate('/tasks')}
                      showDueDate
                    />
                  ))}
                  {approachingDeadlineTasks.length > 10 && (
                    <p className="text-xs text-center text-muted-foreground pt-2">
                      +{approachingDeadlineTasks.length - 10} more tasks with deadlines
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
