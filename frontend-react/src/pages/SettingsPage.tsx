"use client"

import { Settings as SettingsIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CompanySettings,
  RiskMatrixSettings,
  GeographyRiskSettings,
  AISettings,
  IntegrationsSettings,
} from '@/components/settings'
import { PageHeader } from '@/components/shared'

export default function SettingsPage() {
  const handleSave = (section: string) => {
    toast.success(`${section} settings saved`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure system settings and preferences"
        icon={SettingsIcon}
      />

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="risk-matrix">Risk Matrix</TabsTrigger>
          <TabsTrigger value="geography">Geography Risk</TabsTrigger>
          <TabsTrigger value="ai">AI Assistant</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <CompanySettings />
        </TabsContent>

        <TabsContent value="risk-matrix">
          <RiskMatrixSettings onSave={() => handleSave('Risk Matrix')} />
        </TabsContent>

        <TabsContent value="geography">
          <GeographyRiskSettings />
        </TabsContent>

        <TabsContent value="ai">
          <AISettings onSave={() => handleSave('AI')} />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
