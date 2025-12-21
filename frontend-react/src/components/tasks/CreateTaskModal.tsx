"use client"

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateTask, useUsers } from '@/hooks/queries'
import { useAuthStore } from '@/stores/authStore'

interface CreateTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const taskTypes = [
  { value: 'investigation', label: 'Investigation' },
  { value: 'kyc_review', label: 'KYC Review' },
  { value: 'document_review', label: 'Document Review' },
  { value: 'customer_outreach', label: 'Customer Outreach' },
  { value: 'sar_filing', label: 'SAR Filing' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'other', label: 'Other' },
]

export function CreateTaskModal({ open, onOpenChange }: CreateTaskModalProps) {
  const user = useAuthStore((state) => state.user)
  const createTask = useCreateTask()
  const { data: usersData } = useUsers()
  const users = usersData?.users || []

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    task_type: 'investigation',
    priority: 'medium',
    due_date: '',
    assigned_to: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      toast.error('Title is required')
      return
    }

    try {
      await createTask.mutateAsync({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        task_type: formData.task_type,
        priority: formData.priority as 'low' | 'medium' | 'high' | 'critical',
        due_date: formData.due_date || undefined,
        assigned_to: formData.assigned_to || undefined,
        created_by: user?.id,
      })

      toast.success('Task created successfully')
      onOpenChange(false)

      // Reset form
      setFormData({
        title: '',
        description: '',
        task_type: 'investigation',
        priority: 'medium',
        due_date: '',
        assigned_to: '',
      })
    } catch {
      toast.error('Failed to create task')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>
              Create a new task for investigation or review.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Enter task title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Enter task description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task_type">Type</Label>
                <Select
                  value={formData.task_type}
                  onValueChange={(value) => setFormData({ ...formData, task_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="assigned_to">Assign To</Label>
                <Select
                  value={formData.assigned_to}
                  onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
