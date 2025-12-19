"use client"

import { useMemo } from 'react'
import { MoreHorizontal, UserCircle, AlertTriangle, ShieldAlert } from 'lucide-react'
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
import { StatusBadge, RiskBadge } from '@/components/shared'
import type { ColumnDef } from '@tanstack/react-table'
import type { Customer } from '@/types/customer'
import { formatDate } from '@/lib/utils'

interface CustomerTableProps {
  customers: Customer[]
  isLoading?: boolean
  onRowClick?: (customer: Customer) => void
  onEdit?: (customer: Customer) => void
  onDelete?: (customer: Customer) => void
}

export function CustomerTable({
  customers,
  isLoading = false,
  onRowClick,
  onEdit,
  onDelete,
}: CustomerTableProps) {
  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: ({ column }) => <SortableHeader column={column} title="Name" />,
        cell: ({ row }) => {
          const customer = row.original
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <UserCircle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">{customer.full_name}</div>
                <div className="text-xs text-muted-foreground">{customer.member_id}</div>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'email',
        header: ({ column }) => <SortableHeader column={column} title="Email" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.email || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'risk_level',
        header: ({ column }) => <SortableHeader column={column} title="Risk" />,
        cell: ({ row }) => (
          <RiskBadge
            level={row.original.risk_level}
            score={row.original.risk_score}
            showScore
          />
        ),
      },
      {
        accessorKey: 'flags',
        header: 'Flags',
        cell: ({ row }) => {
          const customer = row.original
          return (
            <div className="flex items-center gap-2">
              {customer.pep_flag && (
                <div
                  className="flex items-center gap-1 text-xs text-yellow-500"
                  title="Politically Exposed Person"
                >
                  <AlertTriangle className="h-4 w-4" />
                  PEP
                </div>
              )}
              {customer.sanctions_hit && (
                <div
                  className="flex items-center gap-1 text-xs text-destructive"
                  title="Sanctions Hit"
                >
                  <ShieldAlert className="h-4 w-4" />
                  SAN
                </div>
              )}
              {!customer.pep_flag && !customer.sanctions_hit && (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortableHeader column={column} title="Created" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.created_at ? formatDate(row.original.created_at) : '-'}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const customer = row.original
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
                <DropdownMenuItem onClick={() => onRowClick?.(customer)}>
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit?.(customer)}>
                  Edit Customer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete?.(customer)}
                >
                  Delete Customer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [onRowClick, onEdit, onDelete]
  )

  return (
    <DataTable
      columns={columns}
      data={customers}
      isLoading={isLoading}
      onRowClick={onRowClick}
      searchKey="full_name"
      searchPlaceholder="Filter by name..."
      emptyMessage="No customers found"
      emptyDescription="Try adjusting your search or filter criteria."
    />
  )
}
