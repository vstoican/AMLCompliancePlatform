"use client"

import { Shield, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AlertDefinitionList } from '@/components/alert-definitions'
import { PageHeader } from '@/components/shared'
import { useAlertDefinitions, useToggleAlertDefinition } from '@/hooks/queries'

export default function AlertDefinitionsPage() {
  const { data: definitions, isLoading, refetch } = useAlertDefinitions()
  const toggleDefinition = useToggleAlertDefinition()

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await toggleDefinition.mutateAsync({ id, enabled })
      toast.success(enabled ? 'Alert enabled' : 'Alert disabled', {
        description: `The alert definition has been ${enabled ? 'enabled' : 'disabled'}.`,
      })
    } catch (error) {
      toast.error('Failed to update alert definition')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Definitions"
        description="Configure alert rules and monitoring scenarios"
        icon={Shield}
      >
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </PageHeader>

      <AlertDefinitionList
        definitions={definitions || []}
        isLoading={isLoading}
        onToggle={handleToggle}
      />
    </div>
  )
}
