import {
  GitBranch,
  Clock,
  Zap,
  Hand,
  Play,
  Settings,
  History,
  AlertTriangle,
  Bell,
  CheckSquare,
  CheckCircle,
  XCircle,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { WorkflowDefinition, ScheduleType, WorkflowType, Severity } from '@/types/workflow'

interface WorkflowDefinitionListProps {
  definitions: WorkflowDefinition[]
  isLoading?: boolean
  onToggle?: (id: number) => void
  onEdit?: (definition: WorkflowDefinition) => void
  onRun?: (definition: WorkflowDefinition) => void
  onViewHistory?: (definition: WorkflowDefinition) => void
  onDelete?: (definition: WorkflowDefinition) => void
}

const scheduleTypeConfig: Record<ScheduleType, { icon: typeof Clock; label: string; color: string }> = {
  cron: { icon: Clock, label: 'Scheduled', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  event: { icon: Zap, label: 'Event-triggered', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  manual: { icon: Hand, label: 'Manual', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
}

const workflowTypeConfig: Partial<Record<WorkflowType, { icon: typeof GitBranch; label: string }>> = {
  kyc_refresh: { icon: GitBranch, label: 'KYC Refresh' },
  sanctions_screening: { icon: AlertTriangle, label: 'Sanctions Screening' },
  document_request: { icon: GitBranch, label: 'Document Request' },
  sar_filing: { icon: GitBranch, label: 'SAR Filing' },
}

const severityConfig: Record<Severity, { color: string }> = {
  low: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  medium: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  high: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  critical: { color: 'bg-red-500/10 text-red-500 border-red-500/20' },
}

export function WorkflowDefinitionList({
  definitions,
  isLoading = false,
  onToggle,
  onEdit,
  onRun,
  onViewHistory,
  onDelete,
}: WorkflowDefinitionListProps) {
  if (isLoading) {
    return <WorkflowDefinitionListSkeleton />
  }

  if (definitions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No workflow definitions found.
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {definitions.map((definition) => (
        <WorkflowDefinitionCard
          key={definition.id}
          definition={definition}
          onToggle={onToggle}
          onEdit={onEdit}
          onRun={onRun}
          onViewHistory={onViewHistory}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

interface WorkflowDefinitionCardProps {
  definition: WorkflowDefinition
  onToggle?: (id: number) => void
  onEdit?: (definition: WorkflowDefinition) => void
  onRun?: (definition: WorkflowDefinition) => void
  onViewHistory?: (definition: WorkflowDefinition) => void
  onDelete?: (definition: WorkflowDefinition) => void
}

function WorkflowDefinitionCard({
  definition,
  onToggle,
  onEdit,
  onRun,
  onViewHistory,
  onDelete,
}: WorkflowDefinitionCardProps) {
  const scheduleType = scheduleTypeConfig[definition.schedule_type] || scheduleTypeConfig.manual
  const workflowType = workflowTypeConfig[definition.workflow_type]
  const ScheduleIcon = scheduleType.icon
  const WorkflowIcon = workflowType?.icon || GitBranch

  return (
    <Card className={!definition.enabled ? 'opacity-60' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <WorkflowIcon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{definition.name}</CardTitle>
              <CardDescription className="text-xs">
                {workflowType?.label || definition.workflow_type}
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={definition.enabled}
            onCheckedChange={() => onToggle?.(definition.id)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {/* Description */}
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {definition.description || 'No description'}
        </p>

        {/* Schedule Info */}
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className={scheduleType.color}>
            <ScheduleIcon className="h-3 w-3 mr-1" />
            {scheduleType.label}
          </Badge>
          {definition.schedule_type === 'cron' && definition.cron_expression && (
            <Badge variant="outline" className="font-mono text-xs" title="Cron expression">
              {definition.cron_expression}
            </Badge>
          )}
          {definition.schedule_type === 'event' && definition.trigger_event && (
            <Badge variant="outline" className="text-xs">
              {definition.trigger_event}
            </Badge>
          )}
        </div>

        {/* Actions Created */}
        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
          {definition.create_alert && (
            <div className="flex items-center gap-1">
              <Bell className="h-3 w-3" />
              <span>Alert</span>
              <Badge variant="outline" className={`text-[10px] py-0 px-1 ${severityConfig[definition.alert_severity]?.color}`}>
                {definition.alert_severity}
              </Badge>
            </div>
          )}
          {definition.create_task && (
            <div className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              <span>Task</span>
              {definition.task_type && (
                <Badge variant="outline" className="text-[10px] py-0 px-1">
                  {definition.task_type}
                </Badge>
              )}
            </div>
          )}
          {!definition.create_alert && !definition.create_task && (
            <span className="italic">No actions configured</span>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs">
            {definition.enabled ? (
              <>
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span className="text-green-500">Active</span>
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Disabled</span>
              </>
            )}
            {definition.is_system_default && (
              <Badge variant="secondary" className="ml-2 text-[10px] py-0">
                System
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit?.(definition)}
              title="Edit"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onViewHistory?.(definition)}
              title="History"
            >
              <History className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={() => onRun?.(definition)}
              disabled={!definition.enabled}
              title="Run Now"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>

            {!definition.is_system_default && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => onDelete?.(definition)}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function WorkflowDefinitionListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div>
                  <Skeleton className="h-5 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-6 w-10" />
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-full mb-3" />
            <div className="flex gap-2 mb-3">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <div className="flex gap-1">
                <Skeleton className="h-7 w-7" />
                <Skeleton className="h-7 w-7" />
                <Skeleton className="h-7 w-7" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
