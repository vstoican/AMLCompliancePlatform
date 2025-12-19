import { Play, CheckCircle, XCircle, Clock, Loader2, StopCircle } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'
import type { Workflow } from '@/types/workflow'

interface WorkflowListProps {
  workflows: Workflow[]
  isLoading?: boolean
  onViewDetails?: (workflow: Workflow) => void
  onCancel?: (workflow: Workflow) => void
}

const statusConfig: Record<string, { icon: typeof Play; color: string; label: string }> = {
  RUNNING: { icon: Loader2, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Running' },
  COMPLETED: { icon: CheckCircle, color: 'bg-green-500/10 text-green-500 border-green-500/20', label: 'Completed' },
  FAILED: { icon: XCircle, color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Failed' },
  CANCELLED: { icon: StopCircle, color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', label: 'Cancelled' },
  TERMINATED: { icon: XCircle, color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', label: 'Terminated' },
  TIMED_OUT: { icon: Clock, color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', label: 'Timed Out' },
}

const typeLabels: Record<string, string> = {
  KYCRefreshWorkflow: 'KYC Refresh',
  SanctionsScreeningWorkflow: 'Sanctions Screening',
  AlertHandlingWorkflow: 'Alert Handling',
}

export function WorkflowList({
  workflows,
  isLoading = false,
  onViewDetails,
  onCancel,
}: WorkflowListProps) {
  if (isLoading) {
    return <WorkflowListSkeleton />
  }

  if (workflows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No workflow executions found.
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Completed</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workflows.map((workflow) => {
            const status = statusConfig[workflow.status] || statusConfig.RUNNING
            const StatusIcon = status.icon

            return (
              <TableRow key={`${workflow.workflow_id}-${workflow.run_id}`}>
                <TableCell className="font-mono text-sm">
                  {workflow.workflow_id.substring(0, 20)}...
                </TableCell>
                <TableCell>
                  {typeLabels[workflow.workflow_type] || workflow.workflow_type}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={status.color}>
                    <StatusIcon className={`h-3 w-3 mr-1 ${workflow.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {workflow.start_time ? formatDateTime(workflow.start_time) : '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {workflow.close_time ? formatDateTime(workflow.close_time) : '-'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewDetails?.(workflow)}
                    >
                      Details
                    </Button>
                    {workflow.status === 'RUNNING' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => onCancel?.(workflow)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function WorkflowListSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Completed</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-40" /></TableCell>
              <TableCell><Skeleton className="h-4 w-28" /></TableCell>
              <TableCell><Skeleton className="h-6 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-8 w-16" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
