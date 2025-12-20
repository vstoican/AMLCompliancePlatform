"use client"

import { History, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WorkflowList } from '@/components/workflows'
import { PageHeader } from '@/components/shared'
import { useWorkflows, useCancelWorkflow } from '@/hooks/queries'
import type { Workflow } from '@/types/workflow'

export default function WorkflowHistoryPage() {
  const { data: workflows, isLoading, refetch } = useWorkflows()
  const cancelWorkflow = useCancelWorkflow()

  const handleCancel = async (workflow: Workflow) => {
    try {
      await cancelWorkflow.mutateAsync({
        workflowId: workflow.workflow_id,
        runId: workflow.run_id,
      })
      toast.success('Workflow cancelled')
    } catch (error) {
      toast.error('Failed to cancel workflow')
    }
  }

  const handleViewDetails = (workflow: Workflow) => {
    toast.info(`Viewing ${workflow.workflow_type} (${workflow.status})`)
  }

  // Stats
  const runningWorkflows = workflows?.filter((w) => w.status === 'RUNNING') || []
  const completedWorkflows = workflows?.filter((w) => w.status === 'COMPLETED') || []
  const failedWorkflows = workflows?.filter((w) => w.status === 'FAILED') || []
  const terminatedWorkflows = workflows?.filter((w) => w.status === 'TERMINATED') || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow History"
        description="View workflow executions and audit trail"
        icon={History}
      >
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Running</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{runningWorkflows.length}</div>
            <p className="text-xs text-muted-foreground">Active workflows</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{completedWorkflows.length}</div>
            <p className="text-xs text-muted-foreground">Successful executions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{failedWorkflows.length}</div>
            <p className="text-xs text-muted-foreground">Errors encountered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Terminated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{terminatedWorkflows.length}</div>
            <p className="text-xs text-muted-foreground">Manually stopped</p>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Executions List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Workflow Executions</h2>
        <WorkflowList
          workflows={workflows || []}
          isLoading={isLoading}
          onViewDetails={handleViewDetails}
          onCancel={handleCancel}
        />
      </div>
    </div>
  )
}
