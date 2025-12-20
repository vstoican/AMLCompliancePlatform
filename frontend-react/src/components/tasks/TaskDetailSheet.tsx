"use client"

import { ClipboardList, User, Clock, Calendar, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { StatusBadge, SeverityBadge } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { useTask } from '@/hooks/queries'
import { formatDateTime, formatDate } from '@/lib/utils'
import type { Task } from '@/types/task'

interface TaskDetailSheetProps {
  taskId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onClaim?: (task: Task) => void
  onRelease?: (task: Task) => void
  onComplete?: (task: Task) => void
  currentUserId?: string
}

export function TaskDetailSheet({
  taskId,
  open,
  onOpenChange,
  onClaim,
  onRelease,
  onComplete,
  currentUserId,
}: TaskDetailSheetProps) {
  const { data: task, isLoading } = useTask(taskId)

  const isAssignedToMe = task?.assigned_to === currentUserId
  const canClaim = task && !task.assigned_to && task.status !== 'completed'
  const canRelease = task && isAssignedToMe && task.status !== 'completed'
  const canComplete = task && isAssignedToMe && task.status === 'in_progress'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-4">
          <SheetTitle>Task Details</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <TaskDetailSkeleton />
        ) : task ? (
          <div className="mt-6 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                <ClipboardList className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{task.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {task.description || 'No description provided'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={task.status} />
                  <SeverityBadge severity={task.priority} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Task Info */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Task Information</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Assigned To</span>
                  </div>
                  <span className="text-sm font-medium">
                    {task.assigned_to_name || 'Unassigned'}
                  </span>
                </div>

                {task.due_date && (
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Due Date</span>
                    </div>
                    <span className="text-sm font-medium">
                      {formatDate(task.due_date)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Priority</span>
                  </div>
                  <SeverityBadge severity={task.priority} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Created</span>
                  </div>
                  <span className="text-sm">
                    {formatDateTime(task.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Related Alert */}
            {task.alert_id && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3">Related Alert</h4>
                  <div className="p-3 rounded-lg border">
                    <p className="text-sm">Alert #{task.alert_id}</p>
                  </div>
                </div>
              </>
            )}

            {/* Completion Info */}
            {task.completed_at && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3">Completion</h4>
                  <div className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Completed At</span>
                      <span className="text-sm">{formatDateTime(task.completed_at)}</span>
                    </div>
                    {task.resolution_notes && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm">{task.resolution_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-4">
              {canClaim && (
                <Button onClick={() => onClaim?.(task)}>
                  Claim Task
                </Button>
              )}
              {canRelease && (
                <Button variant="outline" onClick={() => onRelease?.(task)}>
                  Release Task
                </Button>
              )}
              {canComplete && (
                <Button onClick={() => onComplete?.(task)}>
                  Mark Complete
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 text-center text-muted-foreground">
            Task not found.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function TaskDetailSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </div>
      <Separator />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
