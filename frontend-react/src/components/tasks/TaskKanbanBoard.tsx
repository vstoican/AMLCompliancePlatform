import { useMemo } from 'react'
import { ClipboardList, Circle, UserCheck, Play, CheckCircle2, XCircle } from 'lucide-react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { TaskKanbanCard } from './TaskKanbanCard'
import { EmptyState, LoadingOverlay } from '@/components/shared'
import type { Task } from '@/types/task'

interface TaskKanbanBoardProps {
  tasks: Task[]
  isLoading?: boolean
  onClick?: (task: Task) => void
}

interface KanbanColumn {
  id: Task['status']
  title: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}

const columns: KanbanColumn[] = [
  {
    id: 'pending',
    title: 'Pending',
    icon: Circle,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
  },
  {
    id: 'claimed',
    title: 'Claimed',
    icon: UserCheck,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    icon: Play,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    id: 'completed',
    title: 'Completed',
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    id: 'cancelled',
    title: 'Cancelled',
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
]

export function TaskKanbanBoard({ tasks, isLoading = false, onClick }: TaskKanbanBoardProps) {
  const tasksByStatus = useMemo(() => {
    const grouped: Record<Task['status'], Task[]> = {
      pending: [],
      claimed: [],
      in_progress: [],
      completed: [],
      cancelled: [],
    }

    tasks.forEach((task) => {
      if (grouped[task.status]) {
        grouped[task.status].push(task)
      }
    })

    return grouped
  }, [tasks])

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
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4 min-w-max">
        {columns.map((column) => {
          const columnTasks = tasksByStatus[column.id]
          const Icon = column.icon

          return (
            <div
              key={column.id}
              className="flex flex-col w-[300px] min-w-[300px] shrink-0"
            >
              {/* Column Header */}
              <div className={cn(
                'flex items-center gap-2 p-3 rounded-t-lg border border-b-0',
                column.bgColor
              )}>
                <Icon className={cn('h-4 w-4', column.color)} />
                <h3 className={cn('font-semibold text-sm', column.color)}>
                  {column.title}
                </h3>
                <span className={cn(
                  'ml-auto text-xs font-medium px-2 py-0.5 rounded-full',
                  column.bgColor,
                  column.color
                )}>
                  {columnTasks.length}
                </span>
              </div>

              {/* Column Content */}
              <div className="flex-1 bg-muted/30 border rounded-b-lg p-2 min-h-[500px]">
                <ScrollArea className="h-[calc(100vh-320px)]">
                  <div className="space-y-2 pr-2">
                    {columnTasks.length === 0 ? (
                      <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                        No tasks
                      </div>
                    ) : (
                      columnTasks.map((task) => (
                        <TaskKanbanCard
                          key={task.id}
                          task={task}
                          onClick={onClick}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
