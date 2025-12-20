"use client"

import {
  UserCircle, Mail, Phone, MapPin, FileText, AlertTriangle, ShieldAlert,
  CreditCard, Calendar, Globe, Briefcase, CheckCircle, XCircle
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
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

// Helper component for displaying field values
function DetailField({ label, value, icon: Icon }: { label: string; value?: string | number | boolean | null; icon?: React.ElementType }) {
  if (value === undefined || value === null || value === '') return null
  const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{displayValue}</p>
      </div>
    </div>
  )
}

export function CustomerDetailPanel({
  customerId,
  open,
  onOpenChange,
  onEdit,
}: CustomerDetailPanelProps) {
  const { data: customer, isLoading } = useCustomer(customerId)
  const { data: transactionsData, isLoading: transactionsLoading } = useCustomerTransactions(customerId)

  // Build full address
  const buildAddress = (c: Customer) => {
    const parts = [
      c.address_street,
      c.address_house_number,
      c.address_block_number && `Block ${c.address_block_number}`,
      c.address_entrance && `Ent. ${c.address_entrance}`,
      c.address_apartment && `Apt. ${c.address_apartment}`,
    ].filter(Boolean)
    const line1 = parts.join(' ')
    const line2 = [c.address_city, c.address_county, c.country].filter(Boolean).join(', ')
    return [line1, line2].filter(Boolean).join('\n') || null
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[1100px] overflow-y-auto" hideCloseButton>
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
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <StatusBadge status={customer.status} />
                  <RiskBadge level={customer.risk_level} score={customer.risk_score} showScore />
                  {customer.data_validated && (
                    <Badge variant="outline" className={customer.data_validated === 'VALIDATED' ? 'text-green-600 border-green-600' : 'text-yellow-600 border-yellow-600'}>
                      {customer.data_validated === 'VALIDATED' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      {customer.data_validated}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact Information */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Contact Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Email" value={customer.email} icon={Mail} />
                <DetailField label="Phone" value={customer.phone_number} icon={Phone} />
                {buildAddress(customer) && (
                  <div className="col-span-2">
                    <DetailField label="Address" value={buildAddress(customer)} icon={MapPin} />
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Personal Information */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Personal Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="First Name" value={customer.first_name} />
                <DetailField label="Last Name" value={customer.last_name} />
                <DetailField label="Date of Birth" value={customer.birth_date ? formatDate(customer.birth_date) : undefined} icon={Calendar} />
                <DetailField label="Place of Birth" value={customer.place_of_birth} />
                <DetailField label="Country of Birth" value={customer.country_of_birth} icon={Globe} />
                <DetailField label="Identity Number" value={customer.identity_number} />
                <DetailField label="Employer" value={customer.employer_name} icon={Briefcase} />
                <DetailField label="Country" value={customer.country} icon={Globe} />
              </div>
            </div>

            <Separator />

            {/* Document Information */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Document Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Document Type" value={customer.document_type} icon={FileText} />
                <DetailField label="Document ID" value={customer.document_id} />
                <DetailField label="Document Issuer" value={customer.document_issuer} />
                <DetailField label="Date of Issue" value={customer.document_date_of_issue ? formatDate(customer.document_date_of_issue) : undefined} />
                <DetailField label="Date of Expiry" value={customer.document_date_of_expire ? formatDate(customer.document_date_of_expire) : undefined} />
              </div>
            </div>

            <Separator />

            {/* Risk Information */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Risk Assessment</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-lg border text-center">
                    <p className="text-xs text-muted-foreground">Overall Risk</p>
                    <p className="text-lg font-bold">{customer.risk_score}/10</p>
                  </div>
                  <div className="p-3 rounded-lg border text-center">
                    <p className="text-xs text-muted-foreground">Geography</p>
                    <p className="text-lg font-bold">{customer.geography_risk ?? '-'}</p>
                  </div>
                  <div className="p-3 rounded-lg border text-center">
                    <p className="text-xs text-muted-foreground">Product</p>
                    <p className="text-lg font-bold">{customer.product_risk ?? '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg border text-center">
                    <p className="text-xs text-muted-foreground">Behavior</p>
                    <p className="text-lg font-bold">{customer.behavior_risk ?? '-'}</p>
                  </div>
                  {customer.risk_override && (
                    <div className="p-3 rounded-lg border text-center">
                      <p className="text-xs text-muted-foreground">Override</p>
                      <p className="text-sm font-medium">{customer.risk_override}</p>
                    </div>
                  )}
                </div>
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
              </div>
            </div>

            <Separator />

            {/* Financial Information */}
            {(customer.leanpay_monthly_repayment !== undefined && customer.leanpay_monthly_repayment !== null) ||
             (customer.available_monthly_credit_limit !== undefined && customer.available_monthly_credit_limit !== null) ||
             (customer.available_exposure !== undefined && customer.available_exposure !== null) ? (
              <>
                <div>
                  <h4 className="text-sm font-semibold mb-3">Financial Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="Monthly Repayment" value={customer.leanpay_monthly_repayment ? formatCurrency(customer.leanpay_monthly_repayment, 'EUR') : undefined} icon={CreditCard} />
                    <DetailField label="Monthly Credit Limit" value={customer.available_monthly_credit_limit ? formatCurrency(customer.available_monthly_credit_limit, 'EUR') : undefined} />
                    <DetailField label="Available Exposure" value={customer.available_exposure ? formatCurrency(customer.available_exposure, 'EUR') : undefined} />
                    <DetailField label="Limit Last Update" value={customer.limit_exposure_last_update ? formatDate(customer.limit_exposure_last_update) : undefined} />
                  </div>
                </div>
                <Separator />
              </>
            ) : null}

            {/* Consent & Validation */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Consent & Validation</h4>
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Data Validated" value={customer.data_validated} />
                <DetailField label="Marketing Consent" value={customer.marketing_consent} />
                {customer.marketing_consent_last_modified && (
                  <DetailField label="Marketing Consent Date" value={formatDate(customer.marketing_consent_last_modified)} />
                )}
                <DetailField label="KYC Motion Consent" value={customer.kyc_motion_consent_given} />
                {customer.kyc_motion_consent_date && (
                  <DetailField label="KYC Consent Date" value={formatDate(customer.kyc_motion_consent_date)} />
                )}
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
                        <p className="text-sm font-medium">{tx.vendor_name || tx.surrogate_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.transaction_financial_status} • {formatDate(tx.created_at)}
                        </p>
                      </div>
                      <span className="font-medium">{formatCurrency(tx.amount, 'EUR')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No transactions found.</p>
              )}
            </div>

            <Separator />

            {/* Timestamps */}
            <div className="text-xs text-muted-foreground space-y-1">
              {customer.application_time && (
                <p>Application: {formatDate(customer.application_time)}</p>
              )}
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
