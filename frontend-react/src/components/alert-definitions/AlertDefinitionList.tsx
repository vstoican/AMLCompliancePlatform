import { Shield, AlertTriangle, Info, XCircle, CheckCircle, Pencil, Trash2, MoreVertical } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState, LoadingOverlay } from '@/components/shared'
import { cn } from '@/lib/utils'
import type { AlertDefinition } from '@/types/alert'

interface AlertDefinitionListProps {
  definitions: AlertDefinition[]
  isLoading?: boolean
  onToggle?: (id: number, enabled: boolean) => void
  onEdit?: (definition: AlertDefinition) => void
  onDelete?: (definition: AlertDefinition) => void
}

const severityConfig = {
  low: { icon: Info, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  medium: { icon: AlertTriangle, color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  high: { icon: AlertTriangle, color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  critical: { icon: XCircle, color: 'bg-red-500/10 text-red-500 border-red-500/20' },
}

const categoryLabels: Record<string, string> = {
  transaction_monitoring: 'Transaction Monitoring',
  workflow: 'Workflow',
  customer_risk: 'Customer Risk',
  sanctions: 'Sanctions',
}

export function AlertDefinitionList({
  definitions,
  isLoading = false,
  onToggle,
  onEdit,
  onDelete,
}: AlertDefinitionListProps) {
  if (isLoading) {
    return <LoadingOverlay message="Loading alert definitions..." />
  }

  if (definitions.length === 0) {
    return (
      <EmptyState
        icon={Shield}
        title="No alert definitions found"
        description="Create your first alert definition to start monitoring."
      />
    )
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="w-[120px]">Code</TableHead>
            <TableHead className="w-[160px]">Category</TableHead>
            <TableHead className="w-[100px]">Severity</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-[80px]">Type</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {definitions.map((definition) => {
            const severity = severityConfig[definition.severity] || severityConfig.medium
            const SeverityIcon = severity.icon
            const isSystemDefault = definition.is_system_default

            return (
              <TableRow
                key={definition.id}
                className={cn(!definition.enabled && 'opacity-60')}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  #{definition.id}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium">{definition.name}</div>
                    {definition.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {definition.description}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {definition.code}
                  </code>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {categoryLabels[definition.category] || definition.category}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('text-xs', severity.color)}>
                    <SeverityIcon className="h-3 w-3 mr-1" />
                    {definition.severity.charAt(0).toUpperCase() + definition.severity.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className={cn(
                    'flex items-center gap-1.5 text-xs',
                    definition.enabled ? 'text-green-500' : 'text-muted-foreground'
                  )}>
                    {definition.enabled ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5" />
                        Disabled
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {isSystemDefault ? (
                    <Badge variant="secondary" className="text-xs">
                      System
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Custom
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={definition.enabled}
                      onCheckedChange={(checked) => onToggle?.(definition.id, checked)}
                      className="scale-75"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit?.(definition)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDelete?.(definition)}
                          disabled={isSystemDefault}
                          className={isSystemDefault ? 'opacity-50' : 'text-destructive focus:text-destructive'}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                          {isSystemDefault && <span className="ml-1 text-xs">(System)</span>}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
