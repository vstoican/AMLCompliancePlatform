"use client"

import { useState } from 'react'
import { Shield, RefreshCw, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AlertDefinitionList, AlertDefinitionForm, type AlertDefinitionFormData } from '@/components/alert-definitions'
import { PageHeader, ConfirmDialog } from '@/components/shared'
import {
  useAlertDefinitions,
  useToggleAlertDefinition,
  useCreateAlertDefinition,
  useUpdateAlertDefinition,
  useDeleteAlertDefinition,
} from '@/hooks/queries'
import type { AlertDefinition } from '@/types/alert'

export default function AlertDefinitionsPage() {
  const { data: definitions, isLoading, refetch } = useAlertDefinitions()
  const toggleDefinition = useToggleAlertDefinition()
  const createDefinition = useCreateAlertDefinition()
  const updateDefinition = useUpdateAlertDefinition()
  const deleteDefinition = useDeleteAlertDefinition()

  const [formOpen, setFormOpen] = useState(false)
  const [editingDefinition, setEditingDefinition] = useState<AlertDefinition | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [definitionToDelete, setDefinitionToDelete] = useState<AlertDefinition | null>(null)

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await toggleDefinition.mutateAsync({ id, enabled })
      toast.success(enabled ? 'Alert enabled' : 'Alert disabled', {
        description: `The alert definition has been ${enabled ? 'enabled' : 'disabled'}.`,
      })
    } catch {
      toast.error('Failed to update alert definition')
    }
  }

  const handleCreate = () => {
    setEditingDefinition(null)
    setFormOpen(true)
  }

  const handleEdit = (definition: AlertDefinition) => {
    setEditingDefinition(definition)
    setFormOpen(true)
  }

  const handleDelete = (definition: AlertDefinition) => {
    setDefinitionToDelete(definition)
    setDeleteDialogOpen(true)
  }

  const handleFormSubmit = async (data: AlertDefinitionFormData) => {
    try {
      if (editingDefinition) {
        await updateDefinition.mutateAsync({ id: editingDefinition.id, ...data })
        toast.success('Alert definition updated')
      } else {
        await createDefinition.mutateAsync(data)
        toast.success('Alert definition created')
      }
      setFormOpen(false)
    } catch {
      toast.error(editingDefinition ? 'Failed to update' : 'Failed to create')
      throw new Error()
    }
  }

  const handleConfirmDelete = async () => {
    if (!definitionToDelete) return
    try {
      await deleteDefinition.mutateAsync(definitionToDelete.id)
      toast.success('Alert definition deleted')
      setDeleteDialogOpen(false)
      setDefinitionToDelete(null)
    } catch {
      toast.error('Failed to delete alert definition')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Definitions"
        description="Configure alert rules and monitoring scenarios"
        icon={Shield}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Alert
          </Button>
        </div>
      </PageHeader>

      <AlertDefinitionList
        definitions={definitions || []}
        isLoading={isLoading}
        onToggle={handleToggle}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <AlertDefinitionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        definition={editingDefinition}
        onSubmit={handleFormSubmit}
        isSubmitting={createDefinition.isPending || updateDefinition.isPending}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Alert Definition"
        description={`Are you sure you want to delete "${definitionToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isLoading={deleteDefinition.isPending}
      />
    </div>
  )
}
