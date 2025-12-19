"use client"

import { UserCircle, Mail, Phone, MapPin, FileText, AlertTriangle, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { StatusBadge, RiskBadge } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { useCustomer } from '@/hooks/queries'
import { useCustomerTransactions } from '@/hooks/queries'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Customer } from '@/types/customer'

interface CustomerDetailPanelProps {
  customerId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (customer: Customer) => void
}

export function CustomerDetailPanel({
  customerId,
  open,
  onOpenChange,
  onEdit,
}: CustomerDetailPanelProps) {
  const { data: customer, isLoading } = useCustomer(customerId)
  const { data: transactionsData, isLoading: transactionsLoading } = useCustomerTransactions(customerId)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-4">
          <div className="flex items-start justify-between">
            <SheetTitle>Customer Details</SheetTitle>
          </div>
        </SheetHeader>

        {isLoading ? (
          <CustomerDetailSkeleton />
        ) : customer ? (
          <div className="mt-6 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <UserCircle className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{customer.full_name}</h3>
                <p className="text-sm text-muted-foreground">{customer.member_id}</p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={customer.status} />
                  <RiskBadge level={customer.risk_level} score={customer.risk_score} showScore />
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact Information */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Contact Information</h4>
              <div className="space-y-3">
                {customer.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{customer.email}</span>
                  </div>
                )}
                {customer.phone_number && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{customer.phone_number}</span>
                  </div>
                )}
                {customer.address_city && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{customer.address_city}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Personal Information */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Personal Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {customer.birth_date && (
                  <div>
                    <p className="text-muted-foreground">Date of Birth</p>
                    <p className="font-medium">{formatDate(customer.birth_date)}</p>
                  </div>
                )}
                {customer.country_of_birth && (
                  <div>
                    <p className="text-muted-foreground">Country of Birth</p>
                    <p className="font-medium">{customer.country_of_birth}</p>
                  </div>
                )}
                {customer.identity_number && (
                  <div>
                    <p className="text-muted-foreground">Identity Number</p>
                    <p className="font-medium">{customer.identity_number}</p>
                  </div>
                )}
                {customer.document_type && (
                  <div>
                    <p className="text-muted-foreground">Document Type</p>
                    <p className="font-medium">{customer.document_type}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Risk Indicators */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Risk Indicators</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={customer.pep_flag ? 'h-4 w-4 text-yellow-500' : 'h-4 w-4 text-muted-foreground'} />
                    <span className="text-sm">Politically Exposed Person (PEP)</span>
                  </div>
                  <span className={customer.pep_flag ? 'text-sm font-medium text-yellow-500' : 'text-sm text-muted-foreground'}>
                    {customer.pep_flag ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={customer.sanctions_hit ? 'h-4 w-4 text-destructive' : 'h-4 w-4 text-muted-foreground'} />
                    <span className="text-sm">Sanctions Hit</span>
                  </div>
                  <span className={customer.sanctions_hit ? 'text-sm font-medium text-destructive' : 'text-sm text-muted-foreground'}>
                    {customer.sanctions_hit ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Risk Score</span>
                  </div>
                  <span className="text-sm font-medium">
                    {customer.risk_score}/10
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Recent Transactions */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Recent Transactions</h4>
              {transactionsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : transactionsData?.transactions?.length ? (
                <div className="space-y-2">
                  {transactionsData.transactions.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">{tx.type}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                      </div>
                      <span className="font-medium">{formatCurrency(tx.amount, tx.currency)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No transactions found.</p>
              )}
            </div>

            <Separator />

            {/* Timestamps */}
            <div className="text-xs text-muted-foreground">
              {customer.created_at && (
                <p>Created: {formatDate(customer.created_at)}</p>
              )}
              {customer.updated_at && (
                <p>Last Updated: {formatDate(customer.updated_at)}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button onClick={() => onEdit?.(customer)} className="flex-1">
                Edit Customer
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 text-center text-muted-foreground">
            Customer not found.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function CustomerDetailSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      </div>
      <Separator />
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  )
}
