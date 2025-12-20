"use client"

import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CustomerTable,
  CustomerForm,
  CustomerDetailPanel,
} from '@/components/customers'
import { ConfirmDialog } from '@/components/shared'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '@/hooks/queries'
import type { Customer, CustomerFilters as Filters } from '@/types/customer'

export default function CustomersPage() {
  // State
  const [filters, setFilters] = useState<Filters>({})
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)

  // Queries
  const { data, isLoading } = useCustomers(filters)
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()

  // Handlers
  const handleRowClick = (customer: Customer) => {
    setSelectedCustomerId(customer.id)
    setDetailPanelOpen(true)
  }

  const handleAddNew = () => {
    setEditingCustomer(null)
    setFormOpen(true)
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setFormOpen(true)
    setDetailPanelOpen(false)
  }

  const handleDelete = (customer: Customer) => {
    setCustomerToDelete(customer)
    setDeleteDialogOpen(true)
  }

  const handleFormSubmit = async (data: Partial<Customer>) => {
    try {
      if (editingCustomer) {
        await updateCustomer.mutateAsync({ id: editingCustomer.id, ...data })
        toast.success('Customer updated successfully')
      } else {
        await createCustomer.mutateAsync(data)
        toast.success('Customer created successfully')
      }
    } catch (error) {
      toast.error(editingCustomer ? 'Failed to update customer' : 'Failed to create customer')
      throw error
    }
  }

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return
    try {
      await deleteCustomer.mutateAsync(customerToDelete.id)
      toast.success('Customer deleted successfully')
      setDeleteDialogOpen(false)
      setCustomerToDelete(null)
    } catch (error) {
      toast.error('Failed to delete customer')
    }
  }

  const handleRiskLevelChange = (value: string) => {
    setFilters({ ...filters, risk_level: value === 'all' ? undefined : value })
  }

  const handleStatusChange = (value: string) => {
    setFilters({ ...filters, status: value === 'all' ? undefined : value })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">
            Manage customer profiles, risk scoring, and KYC documentation
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Customer List</CardTitle>
              {data && (
                <span className="text-sm text-muted-foreground">
                  ({data.length})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={filters.risk_level || 'all'} onValueChange={handleRiskLevelChange}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.status || 'all'} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CustomerTable
            customers={data ?? []}
            isLoading={isLoading}
            onRowClick={handleRowClick}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>

      {/* Detail Panel */}
      <CustomerDetailPanel
        customerId={selectedCustomerId}
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
        onEdit={handleEdit}
      />

      {/* Create/Edit Form */}
      <CustomerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editingCustomer}
        onSubmit={handleFormSubmit}
        isSubmitting={createCustomer.isPending || updateCustomer.isPending}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Customer"
        description={`Are you sure you want to delete ${customerToDelete?.full_name}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isLoading={deleteCustomer.isPending}
      />
    </div>
  )
}
