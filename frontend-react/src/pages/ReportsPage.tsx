"use client"

import { FileText } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HighRiskReport, AlertReport } from '@/components/reports'
import { PageHeader } from '@/components/shared'

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Compliance reports and analytics"
        icon={FileText}
      />

      <Tabs defaultValue="high-risk" className="space-y-6">
        <TabsList>
          <TabsTrigger value="high-risk">High Risk Customers</TabsTrigger>
          <TabsTrigger value="alerts">Alert Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="high-risk">
          <HighRiskReport />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertReport />
        </TabsContent>
      </Tabs>
    </div>
  )
}
