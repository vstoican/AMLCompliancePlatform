import { ClipboardList } from 'lucide-react'
import { TaskCard } from './TaskCard'
import { EmptyState, LoadingOverlay } from '@/components/shared'
import type { Task } from '@/types/task'

interface TaskListProps {
  tasks: Task[]
  isLoading?: boolean
  onClaim?: (task: Task) => void
  onRelease?: (task: Task) => void
  onComplete?: (task: Task) => void
  onClick?: (task: Task) => void
  currentUserId?: string
}

export function TaskList({
  tasks,
  isLoading = false,
  onClaim,
  onRelease,
  onComplete,
  onClick,
  currentUserId,
}: TaskListProps) {
  if (isLoading) {
    return <LoadingOverlay message="Loading tasks..." />
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No tasks found"
        description="There are no tasks matching your filters."
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onClaim={onClaim}
          onRelease={onRelease}
          onComplete={onComplete}
          onClick={onClick}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  )
}
