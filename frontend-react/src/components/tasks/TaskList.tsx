import { ClipboardList, User, Calendar, AlertCircle, CheckCircle2, Clock, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, LoadingOverlay } from '@/components/shared'
import { cn, formatDistanceToNow } from '@/lib/utils'
import type { Task } from '@/types/task'

interface TaskListProps {
  tasks: Task[]
  isLoading?: boolean
  onClaim?: (task: Task) => void
  onRelease?: (task: Task) => void
  onComplete?: (task: Task) => void
  onClick?: (task: Task) => void
  currentUserId?: string
}

const priorityConfig = {
  critical: { label: 'Critical', className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  high: { label: 'High', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  medium: { label: 'Medium', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  low: { label: 'Low', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
}

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, className: 'text-yellow-500' },
  in_progress: { label: 'In Progress', icon: AlertCircle, className: 'text-blue-500' },
  completed: { label: 'Completed', icon: CheckCircle2, className: 'text-green-500' },
  cancelled: { label: 'Cancelled', icon: AlertCircle, className: 'text-gray-500' },
}

const taskTypeLabels: Record<string, string> = {
  kyc_refresh: 'KYC Refresh',
  investigation: 'Investigation',
  document_request: 'Document Request',
  sanctions_screening: 'Sanctions Screening',
  enhanced_due_diligence: 'Enhanced Due Diligence',
  sar_filing: 'SAR Filing',
  escalation: 'Escalation',
}

export function TaskList({
  tasks,
  isLoading = false,
  onClaim,
  onRelease,
  onClick,
  currentUserId,
}: TaskListProps) {
  if (isLoading) {
    return <LoadingOverlay message="Loading tasks..." />
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No tasks found"
        description="There are no tasks matching your filters."
      />
    )
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    return new Date(dueDate) < new Date()
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">ID</TableHead>
            <TableHead>Task</TableHead>
            <TableHead className="w-[120px]">Type</TableHead>
            <TableHead className="w-[100px]">Priority</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
            <TableHead className="w-[150px]">Assignee</TableHead>
            <TableHead className="w-[120px]">Due Date</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium
            const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending
            const StatusIcon = status.icon
            const overdue = task.status !== 'completed' && isOverdue(task.due_date || null)
            const isAssignedToMe = task.assigned_to === currentUserId

            return (
              <TableRow
                key={task.id}
                className={cn(
                  'cursor-pointer hover:bg-muted/50',
                  overdue && 'bg-red-500/5'
                )}
                onClick={() => onClick?.(task)}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  #{task.id}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium line-clamp-1">{task.title}</div>
                    {task.customer_name && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {task.customer_name}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {taskTypeLabels[task.task_type] || task.task_type}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('text-xs', priority.className)}>
                    {priority.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className={cn('flex items-center gap-1.5 text-xs', status.className)}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {status.label}
                  </div>
                </TableCell>
                <TableCell>
                  {task.assigned_to_name ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                          {getInitials(task.assigned_to_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className={cn(
                        'text-xs truncate max-w-[80px]',
                        isAssignedToMe && 'font-medium text-primary'
                      )}>
                        {isAssignedToMe ? 'You' : task.assigned_to_name.split(' ')[0]}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell>
                  {task.due_date ? (
                    <div className={cn(
                      'flex items-center gap-1 text-xs',
                      overdue ? 'text-red-500 font-medium' : 'text-muted-foreground'
                    )}>
                      <Calendar className="h-3 w-3" />
                      {formatDistanceToNow(task.due_date)}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {!task.assigned_to && task.status !== 'completed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onClaim?.(task)}
                      >
                        Claim
                      </Button>
                    )}
                    {isAssignedToMe && task.status !== 'completed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => onRelease?.(task)}
                      >
                        Release
                      </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
