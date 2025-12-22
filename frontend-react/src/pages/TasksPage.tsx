"use client"

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardList, Plus, RefreshCw, LayoutGrid, List } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TaskFilters, TaskList, TaskDetailSheet, TaskKanbanBoard, CreateTaskModal } from '@/components/tasks'
import { PageHeader } from '@/components/shared'
import { useTasks, useClaimTask, useReleaseTask, useCompleteTask } from '@/hooks/queries'
import { useAuthStore } from '@/stores/authStore'
import type { Task, TaskFilters as Filters } from '@/types/task'

type ViewMode = 'list' | 'board'

export default function TasksPage() {
  const user = useAuthStore((state) => state.user)
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<Filters>({})
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('tasks-view-mode')
    return (saved === 'list' || saved === 'board') ? saved : 'list'
  })

  const { data, isLoading, refetch } = useTasks(filters)

  // Persist view mode preference
  useEffect(() => {
    localStorage.setItem('tasks-view-mode', viewMode)
  }, [viewMode])

  // Open task detail panel if taskId is in URL
  useEffect(() => {
    const taskIdParam = searchParams.get('taskId')
    if (taskIdParam) {
      const taskId = parseInt(taskIdParam, 10)
      if (!isNaN(taskId)) {
        setSelectedTaskId(taskId)
        setDetailOpen(true)
        // Clear the URL param after opening
        setSearchParams({}, { replace: true })
      }
    }
  }, [searchParams, setSearchParams])

  const claimTask = useClaimTask()
  const releaseTask = useReleaseTask()
  const completeTask = useCompleteTask()

  const handleClaim = async (task: Task) => {
    if (!user?.id) {
      toast.error('You must be logged in to claim a task')
      return
    }
    try {
      await claimTask.mutateAsync({ taskId: task.id, userId: user.id })
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
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value: string) => value && setViewMode(value as ViewMode)}
          className="bg-muted rounded-lg p-1"
        >
          <ToggleGroupItem value="board" aria-label="Board view" className="px-3">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view" className="px-3">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button size="sm" onClick={() => setCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </PageHeader>

      <TaskFilters filters={filters} onFiltersChange={setFilters} />

      {viewMode === 'board' ? (
        <TaskKanbanBoard
          tasks={data?.tasks || []}
          isLoading={isLoading}
          onClick={handleTaskClick}
        />
      ) : (
        <TaskList
          tasks={data?.tasks || []}
          isLoading={isLoading}
          onClaim={handleClaim}
          onRelease={handleRelease}
          onComplete={handleComplete}
          onClick={handleTaskClick}
          currentUserId={user?.id}
        />
      )}

      <TaskDetailSheet
        taskId={selectedTaskId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onClaim={handleClaim}
        onRelease={handleRelease}
        onComplete={handleComplete}
        currentUserId={user?.id}
      />

      <CreateTaskModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
      />
    </div>
  )
}
