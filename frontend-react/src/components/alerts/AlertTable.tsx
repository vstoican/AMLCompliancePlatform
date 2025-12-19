"use client"

import { useMemo } from 'react'
import { MoreHorizontal, AlertTriangle, UserPlus, ArrowUp, CheckCircle, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable, SortableHeader } from '@/components/shared/DataTable'
import { StatusBadge, SeverityBadge } from '@/components/shared'
import type { ColumnDef } from '@tanstack/react-table'
import type { Alert } from '@/types/alert'
import { formatDistanceToNow } from '@/lib/utils'

interface AlertTableProps {
  alerts: Alert[]
  isLoading?: boolean
  onRowClick?: (alert: Alert) => void
  onAssign?: (alert: Alert) => void
  onEscalate?: (alert: Alert) => void
  onResolve?: (alert: Alert) => void
  onHold?: (alert: Alert) => void
}

export function AlertTable({
  alerts,
  isLoading = false,
  onRowClick,
  onAssign,
  onEscalate,
  onResolve,
  onHold,
}: AlertTableProps) {
  const columns = useMemo<ColumnDef<Alert>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span className="font-mono text-sm">#{row.original.id}</span>
        ),
      },
      {
        accessorKey: 'scenario',
        header: ({ column }) => <SortableHeader column={column} title="Alert" />,
        cell: ({ row }) => {
          const alert = row.original
          return (
            <div>
              <div className="font-medium">{alert.scenario}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {alert.type.replace(/_/g, ' ')}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'customer_name',
        header: 'Customer',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.customer_name || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'severity',
        header: 'Severity',
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'assigned_to_name',
        header: 'Assigned To',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.assigned_to_name || 'Unassigned'}
          </span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortableHeader column={column} title="Created" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDistanceToNow(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const alert = row.original
          const isResolved = alert.status === 'resolved'
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onRowClick?.(alert)}>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {!isResolved && (
                  <>
                    <DropdownMenuItem onClick={() => onAssign?.(alert)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Assign
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEscalate?.(alert)}>
                      <ArrowUp className="h-4 w-4 mr-2" />
                      Escalate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onHold?.(alert)}>
                      <Pause className="h-4 w-4 mr-2" />
                      Put On Hold
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onResolve?.(alert)}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Resolve
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [onRowClick, onAssign, onEscalate, onResolve, onHold]
  )

  return (
    <DataTable
      columns={columns}
      data={alerts}
      isLoading={isLoading}
      onRowClick={onRowClick}
      emptyMessage="No alerts found"
      emptyDescription="All alerts have been addressed or no alerts match the filters."
    />
  )
}
