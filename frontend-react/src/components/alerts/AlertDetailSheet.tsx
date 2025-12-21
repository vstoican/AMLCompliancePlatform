"use client"

import { AlertTriangle, UserCircle, MessageSquare } from 'lucide-react'
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
import { useAlert, useAlertNotes } from '@/hooks/queries'
import { formatDateTime, formatDistanceToNow } from '@/lib/utils'
import type { Alert } from '@/types/alert'

interface AlertDetailSheetProps {
  alertId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssign?: (alert: Alert) => void
  onEscalate?: (alert: Alert) => void
  onResolve?: (alert: Alert) => void
  onHold?: (alert: Alert) => void
}

export function AlertDetailSheet({
  alertId,
  open,
  onOpenChange,
  onAssign,
  onEscalate,
  onResolve,
  onHold,
}: AlertDetailSheetProps) {
  const { data: alert, isLoading } = useAlert(alertId)
  const { data: notes, isLoading: notesLoading } = useAlertNotes(alertId)

  const isResolved = alert?.status === 'resolved'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[1100px] overflow-y-auto">
        <SheetHeader className="space-y-4">
          <SheetTitle>Alert Details</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <AlertDetailSkeleton />
        ) : alert ? (
          <div className="mt-6 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/20">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{alert.scenario}</h3>
                <p className="text-sm text-muted-foreground capitalize">
                  {alert.type.replace(/_/g, ' ')}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={alert.status} />
                  <SeverityBadge severity={alert.severity} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Alert Info */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Alert Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Alert ID</p>
                  <p className="font-mono">#{alert.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{formatDistanceToNow(alert.created_at)}</p>
                </div>
                {alert.customer_name && (
                  <div>
                    <p className="text-muted-foreground">Customer</p>
                    <p className="font-medium">{alert.customer_name}</p>
                  </div>
                )}
                {alert.transaction_id && (
                  <div>
                    <p className="text-muted-foreground">Transaction ID</p>
                    <p className="font-mono">#{alert.transaction_id}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Assignment Info */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Assignment</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Assigned To</span>
                  </div>
                  <span className="text-sm font-medium">
                    {alert.assigned_to_name || 'Unassigned'}
                  </span>
                </div>
                {alert.escalated_to_name && (
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Escalated To</span>
                    </div>
                    <span className="text-sm font-medium">
                      {alert.escalated_to_name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Resolution Info */}
            {alert.resolved_at && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3">Resolution</h4>
                  <div className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Resolution Type</span>
                      <span className="text-sm font-medium capitalize">
                        {alert.resolution_type?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Resolved At</span>
                      <span className="text-sm">{formatDateTime(alert.resolved_at)}</span>
                    </div>
                    {alert.resolution_notes && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm">{alert.resolution_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Notes */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Notes & Activity
              </h4>
              {notesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : notes && notes.length > 0 ? (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{note.user_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(note.created_at)}
                        </span>
                      </div>
                      <p className="text-sm">{note.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              )}
            </div>

            <Separator />

            {/* Actions */}
            {!isResolved && (
              <div className="flex flex-wrap gap-2 pt-4">
                <Button variant="outline" size="sm" onClick={() => onAssign?.(alert)}>
                  Assign
                </Button>
                <Button variant="outline" size="sm" onClick={() => onEscalate?.(alert)}>
                  Escalate
                </Button>
                <Button variant="outline" size="sm" onClick={() => onHold?.(alert)}>
                  Put On Hold
                </Button>
                <Button size="sm" onClick={() => onResolve?.(alert)}>
                  Resolve
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 text-center text-muted-foreground">
            Alert not found.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function AlertDetailSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </div>
      <Separator />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
