"use client"

import { History, RefreshCw, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { WorkflowList } from '@/components/workflows'
import { PageHeader } from '@/components/shared'
import { useWorkflows } from '@/hooks/queries'
import type { Workflow } from '@/types/workflow'

export default function WorkflowHistoryPage() {
  const { data: workflows, isLoading, refetch } = useWorkflows()

  // Filter to only show completed workflows (history)
  const completedWorkflows = workflows?.filter(
    (w) => w.status !== 'RUNNING'
  ) || []

  const handleViewDetails = (workflow: Workflow) => {
    toast.info(`${workflow.workflow_type} - ${workflow.status}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow History"
        description="Past workflow executions and audit trail"
        icon={History}
      >
        <Button variant="outline" size="sm" disabled>
          <Filter className="h-4 w-4 mr-2" />
          Filter
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </PageHeader>

      <WorkflowList
        workflows={completedWorkflows}
        isLoading={isLoading}
        onViewDetails={handleViewDetails}
      />
    </div>
  )
}
