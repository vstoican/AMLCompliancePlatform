import { Shield, AlertTriangle, Info, XCircle, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { AlertDefinition } from '@/types/alert'

interface AlertDefinitionListProps {
  definitions: AlertDefinition[]
  isLoading?: boolean
  onToggle?: (id: number, enabled: boolean) => void
}

const severityConfig = {
  low: { icon: Info, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  medium: { icon: AlertTriangle, color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  high: { icon: AlertTriangle, color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  critical: { icon: XCircle, color: 'bg-red-500/10 text-red-500 border-red-500/20' },
}

const typeLabels: Record<string, string> = {
  transaction_monitoring: 'Transaction Monitoring',
  workflow: 'Workflow',
  customer_risk: 'Customer Risk',
  sanctions: 'Sanctions',
}

export function AlertDefinitionList({
  definitions,
  isLoading = false,
  onToggle,
}: AlertDefinitionListProps) {
  if (isLoading) {
    return <AlertDefinitionListSkeleton />
  }

  if (definitions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No alert definitions found.
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {definitions.map((definition) => (
        <AlertDefinitionCard
          key={definition.id}
          definition={definition}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

interface AlertDefinitionCardProps {
  definition: AlertDefinition
  onToggle?: (id: number, enabled: boolean) => void
}

function AlertDefinitionCard({ definition, onToggle }: AlertDefinitionCardProps) {
  const severity = severityConfig[definition.severity] || severityConfig.medium
  const SeverityIcon = severity.icon

  return (
    <Card className={!definition.enabled ? 'opacity-60' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{definition.name}</CardTitle>
              <CardDescription className="text-xs">
                {typeLabels[definition.category] || definition.category}
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={definition.enabled}
            onCheckedChange={(checked) => onToggle?.(definition.id, checked)}
          />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {definition.description || 'No description'}
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={severity.color}>
            <SeverityIcon className="h-3 w-3 mr-1" />
            {definition.severity.charAt(0).toUpperCase() + definition.severity.slice(1)}
          </Badge>
          <Badge variant="outline">
            {definition.code}
          </Badge>
        </div>
        <div className="mt-3 flex items-center gap-1 text-xs">
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
        </div>
      </CardContent>
    </Card>
  )
}

function AlertDefinitionListSkeleton() {
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
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
