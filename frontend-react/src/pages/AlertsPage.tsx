"use client"

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertFilters,
  AlertTable,
  AlertDetailSheet,
  AssignModal,
  EscalateModal,
  ResolveModal,
  HoldModal,
} from '@/components/alerts'
import {
  useAlerts,
  useAssignAlert,
  useEscalateAlert,
  useResolveAlert,
  useHoldAlert,
} from '@/hooks/queries'
import type { Alert, AlertFilters as Filters } from '@/types/alert'

export default function AlertsPage() {
  // State
  const [filters, setFilters] = useState<Filters>({})
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null)
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)

  // Modal states
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [escalateModalOpen, setEscalateModalOpen] = useState(false)
  const [resolveModalOpen, setResolveModalOpen] = useState(false)
  const [holdModalOpen, setHoldModalOpen] = useState(false)

  // Queries & Mutations
  const { data, isLoading } = useAlerts(filters)
  const assignAlert = useAssignAlert()
  const escalateAlert = useEscalateAlert()
  const resolveAlert = useResolveAlert()
  const holdAlert = useHoldAlert()

  // Handlers
  const handleRowClick = (alert: Alert) => {
    setSelectedAlertId(alert.id)
    setDetailSheetOpen(true)
  }

  const openAssignModal = (alert: Alert) => {
    setSelectedAlert(alert)
    setAssignModalOpen(true)
  }

  const openEscalateModal = (alert: Alert) => {
    setSelectedAlert(alert)
    setEscalateModalOpen(true)
  }

  const openResolveModal = (alert: Alert) => {
    setSelectedAlert(alert)
    setResolveModalOpen(true)
  }

  const openHoldModal = (alert: Alert) => {
    setSelectedAlert(alert)
    setHoldModalOpen(true)
  }

  const handleAssign = async (userId: string) => {
    if (!selectedAlert) return
    try {
      await assignAlert.mutateAsync({ alertId: selectedAlert.id, userId })
      toast.success('Alert assigned successfully')
    } catch {
      toast.error('Failed to assign alert')
    }
  }

  const handleEscalate = async (userId: string, reason?: string) => {
    if (!selectedAlert) return
    try {
      await escalateAlert.mutateAsync({ alertId: selectedAlert.id, userId, reason })
      toast.success('Alert escalated successfully')
    } catch {
      toast.error('Failed to escalate alert')
    }
  }

  const handleResolve = async (resolutionType: string, notes?: string) => {
    if (!selectedAlert) return
    try {
      await resolveAlert.mutateAsync({ alertId: selectedAlert.id, resolutionType, notes })
      toast.success('Alert resolved successfully')
    } catch {
      toast.error('Failed to resolve alert')
    }
  }

  const handleHold = async (reason: string) => {
    if (!selectedAlert) return
    try {
      await holdAlert.mutateAsync({ alertId: selectedAlert.id, reason })
      toast.success('Alert put on hold')
    } catch {
      toast.error('Failed to put alert on hold')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alert Stream</h1>
        <p className="text-muted-foreground">
          Monitor, investigate, and resolve compliance alerts
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Filter alerts by type, severity, and status</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertFilters filters={filters} onFiltersChange={setFilters} />
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Alert List</CardTitle>
            </div>
            {data && (
              <span className="text-sm text-muted-foreground">
                {data.total} total alerts
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <AlertTable
            alerts={data?.alerts ?? []}
            isLoading={isLoading}
            onRowClick={handleRowClick}
            onAssign={openAssignModal}
            onEscalate={openEscalateModal}
            onResolve={openResolveModal}
            onHold={openHoldModal}
          />
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <AlertDetailSheet
        alertId={selectedAlertId}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        onAssign={openAssignModal}
        onEscalate={openEscalateModal}
        onResolve={openResolveModal}
        onHold={openHoldModal}
      />

      {/* Action Modals */}
      <AssignModal
        open={assignModalOpen}
        onOpenChange={setAssignModalOpen}
        alert={selectedAlert}
        onSubmit={handleAssign}
        isSubmitting={assignAlert.isPending}
      />

      <EscalateModal
        open={escalateModalOpen}
        onOpenChange={setEscalateModalOpen}
        alert={selectedAlert}
        onSubmit={handleEscalate}
        isSubmitting={escalateAlert.isPending}
      />

      <ResolveModal
        open={resolveModalOpen}
        onOpenChange={setResolveModalOpen}
        alert={selectedAlert}
        onSubmit={handleResolve}
        isSubmitting={resolveAlert.isPending}
      />

      <HoldModal
        open={holdModalOpen}
        onOpenChange={setHoldModalOpen}
        alert={selectedAlert}
        onSubmit={handleHold}
        isSubmitting={holdAlert.isPending}
      />
    </div>
  )
}
