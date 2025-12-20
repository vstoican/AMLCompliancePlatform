"use client"

import { useState } from 'react'
import { GitBranch, RefreshCw, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { WorkflowDefinitionList, WorkflowDefinitionForm } from '@/components/workflows'
import { PageHeader } from '@/components/shared'
import {
  useWorkflowDefinitions,
  useToggleWorkflowDefinition,
  useRunWorkflow,
  useCreateWorkflowDefinition,
  useUpdateWorkflowDefinition,
  useDeleteWorkflowDefinition,
} from '@/hooks/queries'
import { useAuthStore } from '@/stores/authStore'
import type { WorkflowDefinition, WorkflowDefinitionCreate } from '@/types/workflow'

export default function WorkflowsPage() {
  const user = useAuthStore((state) => state.user)
  const [formOpen, setFormOpen] = useState(false)
  const [editingDefinition, setEditingDefinition] = useState<WorkflowDefinition | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingDefinition, setDeletingDefinition] = useState<WorkflowDefinition | null>(null)

  // Definitions data
  const { data: definitions, isLoading, refetch } = useWorkflowDefinitions()
  const toggleDefinition = useToggleWorkflowDefinition()
  const runWorkflow = useRunWorkflow()
  const createDefinition = useCreateWorkflowDefinition()
  const updateDefinition = useUpdateWorkflowDefinition()
  const deleteDefinition = useDeleteWorkflowDefinition()

  const handleToggleDefinition = async (id: number) => {
    try {
      const result = await toggleDefinition.mutateAsync(id)
      toast.success(`Workflow ${result.enabled ? 'enabled' : 'disabled'}`)
    } catch (error) {
      toast.error('Failed to toggle workflow')
    }
  }

  const handleEditDefinition = (definition: WorkflowDefinition) => {
    setEditingDefinition(definition)
    setFormOpen(true)
  }

  const handleCreateNew = () => {
    setEditingDefinition(null)
    setFormOpen(true)
  }

  const handleFormSubmit = async (data: WorkflowDefinitionCreate) => {
    try {
      if (editingDefinition) {
        await updateDefinition.mutateAsync({ id: editingDefinition.id, ...data })
        toast.success(`Workflow "${data.name}" updated successfully`)
      } else {
        await createDefinition.mutateAsync(data)
        toast.success(`Workflow "${data.name}" created successfully`)
      }
      setFormOpen(false)
      setEditingDefinition(null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(editingDefinition ? 'Failed to update workflow' : 'Failed to create workflow', {
        description: message,
      })
    }
  }

  const handleRunDefinition = async (definition: WorkflowDefinition) => {
    try {
      const result = await runWorkflow.mutateAsync({
        id: definition.id,
        triggered_by_user_id: user?.id,
      })
      if (result.status === 'running') {
        toast.success(`Workflow started: ${definition.name}`)
      } else if (result.status === 'failed') {
        toast.error(`Workflow failed: ${result.error}`)
      } else {
        toast.info(`Workflow queued: ${definition.name}`)
      }
    } catch (error) {
      toast.error('Failed to run workflow')
    }
  }

  const handleViewHistory = (definition: WorkflowDefinition) => {
    toast.info(`View history for ${definition.name} - Coming soon!`)
  }

  const handleDeleteClick = (definition: WorkflowDefinition) => {
    setDeletingDefinition(definition)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingDefinition) return

    try {
      await deleteDefinition.mutateAsync(deletingDefinition.id)
      toast.success(`Workflow "${deletingDefinition.name}" deleted`)
      setDeleteDialogOpen(false)
      setDeletingDefinition(null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Failed to delete workflow', { description: message })
    }
  }

  // Stats for definitions
  const enabledDefinitions = definitions?.filter((d: WorkflowDefinition) => d.enabled) || []
  const cronDefinitions = definitions?.filter((d: WorkflowDefinition) => d.schedule_type === 'cron' && d.enabled) || []
  const eventDefinitions = definitions?.filter((d: WorkflowDefinition) => d.schedule_type === 'event' && d.enabled) || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows"
        description="Manage workflow definitions"
        icon={GitBranch}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Definition
          </Button>
        </div>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{enabledDefinitions.length}</div>
            <p className="text-xs text-muted-foreground">Enabled definitions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{cronDefinitions.length}</div>
            <p className="text-xs text-muted-foreground">Cron-based workflows</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Event-Triggered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">{eventDefinitions.length}</div>
            <p className="text-xs text-muted-foreground">Event-based workflows</p>
          </CardContent>
        </Card>
      </div>

      {/* Definitions List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Workflow Definitions</h2>
        <WorkflowDefinitionList
          definitions={definitions || []}
          isLoading={isLoading}
          onToggle={handleToggleDefinition}
          onEdit={handleEditDefinition}
          onRun={handleRunDefinition}
          onViewHistory={handleViewHistory}
          onDelete={handleDeleteClick}
        />
      </div>

      {/* Create/Edit Form */}
      <WorkflowDefinitionForm
        definition={editingDefinition}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingDefinition(null)
        }}
        onSubmit={handleFormSubmit}
        isLoading={createDefinition.isPending || updateDefinition.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow Definition</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDefinition?.name}"? This action cannot be undone.
              {deletingDefinition?.enabled && (
                <span className="block mt-2 text-orange-600">
                  Warning: This workflow is currently enabled.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingDefinition(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteDefinition.isPending}
            >
              {deleteDefinition.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
