"use client"

import { useState } from 'react'
import { ClipboardList, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TaskFilters, TaskList, TaskDetailSheet } from '@/components/tasks'
import { PageHeader } from '@/components/shared'
import { useTasks, useClaimTask, useReleaseTask, useCompleteTask } from '@/hooks/queries'
import { useAuthStore } from '@/stores/authStore'
import type { Task, TaskFilters as Filters } from '@/types/task'

export default function TasksPage() {
  const user = useAuthStore((state) => state.user)
  const [filters, setFilters] = useState<Filters>({})
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { data, isLoading, refetch } = useTasks(filters)
  const claimTask = useClaimTask()
  const releaseTask = useReleaseTask()
  const completeTask = useCompleteTask()

  const handleClaim = async (task: Task) => {
    try {
      await claimTask.mutateAsync(task.id)
      toast.success('Task claimed', {
        description: `You are now assigned to "${task.title}"`,
      })
    } catch (error) {
      toast.error('Failed to claim task')
    }
  }

  const handleRelease = async (task: Task) => {
    try {
      await releaseTask.mutateAsync(task.id)
      toast.success('Task released', {
        description: `"${task.title}" is now unassigned`,
      })
    } catch (error) {
      toast.error('Failed to release task')
    }
  }

  const handleComplete = async (task: Task) => {
    try {
      await completeTask.mutateAsync({ taskId: task.id })
      toast.success('Task completed', {
        description: `"${task.title}" has been marked as complete`,
      })
      setDetailOpen(false)
    } catch (error) {
      toast.error('Failed to complete task')
    }
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTaskId(task.id)
    setDetailOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Manage investigation tasks and workflow items"
        icon={ClipboardList}
      >
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </PageHeader>

      <TaskFilters filters={filters} onFiltersChange={setFilters} />

      <TaskList
        tasks={data?.tasks || []}
        isLoading={isLoading}
        onClaim={handleClaim}
        onRelease={handleRelease}
        onComplete={handleComplete}
        onClick={handleTaskClick}
        currentUserId={user?.id}
      />

      <TaskDetailSheet
        taskId={selectedTaskId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onClaim={handleClaim}
        onRelease={handleRelease}
        onComplete={handleComplete}
        currentUserId={user?.id}
      />
    </div>
  )
}
