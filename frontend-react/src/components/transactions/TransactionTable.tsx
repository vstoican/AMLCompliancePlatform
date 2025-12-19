"use client"

import { useMemo } from 'react'
import { ArrowUpRight, ArrowDownRight, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { DataTable, SortableHeader } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared'
import type { ColumnDef } from '@tanstack/react-table'
import type { Transaction } from '@/types/transaction'
import { formatDate, formatCurrency, cn } from '@/lib/utils'

interface TransactionTableProps {
  transactions: Transaction[]
  isLoading?: boolean
  onRowClick?: (transaction: Transaction) => void
  showPagination?: boolean
}

export function TransactionTable({
  transactions,
  isLoading = false,
  onRowClick,
  showPagination = true,
}: TransactionTableProps) {
  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span className="font-mono text-sm">#{row.original.id}</span>
        ),
      },
      {
        accessorKey: 'type',
        header: ({ column }) => <SortableHeader column={column} title="Type" />,
        cell: ({ row }) => {
          const tx = row.original
          const isCredit = tx.type?.toLowerCase().includes('credit') || tx.type?.toLowerCase().includes('deposit')
          return (
            <div className="flex items-center gap-2">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full',
                isCredit ? 'bg-green-500/20' : 'bg-blue-500/20'
              )}>
                {isCredit ? (
                  <ArrowDownRight className="h-4 w-4 text-green-500" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 text-blue-500" />
                )}
              </div>
              <span className="font-medium">{tx.type || 'Transfer'}</span>
            </div>
          )
        },
      },
      {
        accessorKey: 'customer_name',
        header: ({ column }) => <SortableHeader column={column} title="Customer" />,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.customer_name || '-'}</div>
            <div className="text-xs text-muted-foreground">{row.original.member_id}</div>
          </div>
        ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => <SortableHeader column={column} title="Amount" />,
        cell: ({ row }) => {
          const tx = row.original
          const isCredit = tx.type?.toLowerCase().includes('credit') || tx.type?.toLowerCase().includes('deposit')
          return (
            <span className={cn(
              'font-semibold',
              isCredit ? 'text-green-500' : 'text-foreground'
            )}>
              {isCredit ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
            </span>
          )
        },
      },
      {
        accessorKey: 'transaction_financial_status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge status={row.original.transaction_financial_status} />
        ),
      },
      {
        accessorKey: 'client_settlement_status',
        header: 'Settlement',
        cell: ({ row }) => {
          const status = row.original.client_settlement_status
          return (
            <Badge
              variant="outline"
              className={cn(
                status === 'paid' && 'bg-green-500/20 text-green-400 border-green-500/30',
                status === 'unpaid' && 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                status === 'partial' && 'bg-blue-500/20 text-blue-400 border-blue-500/30'
              )}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => <SortableHeader column={column} title="Date" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const transaction = row.original
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
                <DropdownMenuItem onClick={() => onRowClick?.(transaction)}>
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem>View Customer</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [onRowClick]
  )

  return (
    <DataTable
      columns={columns}
      data={transactions}
      isLoading={isLoading}
      onRowClick={onRowClick}
      showPagination={showPagination}
      emptyMessage="No transactions found"
      emptyDescription="Try adjusting your search or filter criteria."
    />
  )
}
