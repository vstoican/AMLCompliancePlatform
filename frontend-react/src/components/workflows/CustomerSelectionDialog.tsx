import { useState, useMemo } from 'react'
import { Search, User, AlertTriangle, Shield } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useCustomers } from '@/hooks/queries'
import type { Customer } from '@/types/customer'

interface CustomerSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (customer: Customer) => void
  title?: string
  description?: string
  isLoading?: boolean
}

const riskLevelConfig = {
  low: { color: 'bg-green-500/10 text-green-600 border-green-500/20', label: 'Low Risk' },
  medium: { color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', label: 'Medium Risk' },
  high: { color: 'bg-red-500/10 text-red-600 border-red-500/20', label: 'High Risk' },
}

export function CustomerSelectionDialog({
  open,
  onOpenChange,
  onSelect,
  title = 'Select Customer',
  description = 'Choose a customer to run this workflow for.',
  isLoading: externalLoading = false,
}: CustomerSelectionDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const { data: customers, isLoading: customersLoading } = useCustomers()

  const isLoading = customersLoading || externalLoading

  // Filter customers based on search
  const filteredCustomers = useMemo(() => {
    if (!customers) return []
    if (!search.trim()) return customers

    const searchLower = search.toLowerCase()
    return customers.filter(
      (customer) =>
        customer.full_name?.toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower) ||
        customer.member_id?.toLowerCase().includes(searchLower) ||
        customer.identity_number?.toLowerCase().includes(searchLower)
    )
  }, [customers, search])

  const handleConfirm = () => {
    if (selectedCustomer) {
      onSelect(selectedCustomer)
      setSelectedCustomer(null)
      setSearch('')
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedCustomer(null)
      setSearch('')
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-hidden">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full"
            />
          </div>

          {/* Customer List */}
          <ScrollArea className="h-[300px] rounded-md border overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No customers found</p>
                {search && (
                  <p className="text-sm mt-1">Try adjusting your search</p>
                )}
              </div>
            ) : (
              <div className="p-2">
                {filteredCustomers.map((customer) => {
                  const isSelected = selectedCustomer?.id === customer.id
                  const riskConfig = riskLevelConfig[customer.risk_level] || riskLevelConfig.low

                  return (
                    <button
                      key={customer.id}
                      onClick={() => setSelectedCustomer(customer)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors overflow-hidden ${
                        isSelected
                          ? 'bg-primary/10 border border-primary'
                          : 'hover:bg-muted/50 border border-transparent'
                      }`}
                    >
                      <div className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-full bg-muted">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium truncate max-w-[140px]">
                            {customer.full_name}
                          </span>
                          {customer.pep_flag && (
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/20 text-[10px] py-0 flex-shrink-0">
                              PEP
                            </Badge>
                          )}
                          {customer.sanctions_hit && (
                            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px] py-0 flex-shrink-0">
                              <AlertTriangle className="h-3 w-3 mr-0.5" />
                              Sanctions
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {customer.email || 'No email'} - ID: {customer.member_id}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                        <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${riskConfig.color}`}>
                          <Shield className="h-3 w-3 mr-0.5" />
                          {riskConfig.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          Score: {customer.risk_score}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>

          {/* Selected Customer Summary */}
          {selectedCustomer && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm">
                <span className="text-muted-foreground">Selected: </span>
                <span className="font-medium">{selectedCustomer.full_name}</span>
                <span className="text-muted-foreground"> ({selectedCustomer.member_id})</span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedCustomer || externalLoading}>
            {externalLoading ? 'Running...' : 'Run Workflow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
