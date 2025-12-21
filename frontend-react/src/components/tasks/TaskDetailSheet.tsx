"use client"

import { useState, useRef } from 'react'
import {
  ClipboardList,
  Clock,
  Calendar,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  History,
  Send,
  Upload,
  Download,
  Trash2,
  FileText,
  Loader2,
  UserPlus,
  Link2,
  Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { StatusBadge, SeverityBadge } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  useTask,
  useTaskNotes,
  useCreateTaskNote,
  useTaskAttachments,
  useUploadTaskAttachment,
  useDeleteTaskAttachment,
  useTaskHistory,
  useAssignTask,
  useUpdateTaskStatus,
  useUsers
} from '@/hooks/queries'
import { formatDateTime, formatDate, formatDistanceToNow } from '@/lib/utils'
import type { Task } from '@/types/task'
import api from '@/lib/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface TaskDetailSheetProps {
  taskId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onClaim?: (task: Task) => void
  onRelease?: (task: Task) => void
  onComplete?: (task: Task) => void
  currentUserId?: string
}

export function TaskDetailSheet({
  taskId,
  open,
  onOpenChange,
  onClaim,
  onRelease,
  onComplete,
  currentUserId,
}: TaskDetailSheetProps) {
  const { data: task, isLoading } = useTask(taskId)
  const { data: notes, isLoading: notesLoading } = useTaskNotes(taskId)
  const { data: attachments, isLoading: attachmentsLoading } = useTaskAttachments(taskId)
  const { data: history, isLoading: historyLoading } = useTaskHistory(taskId)
  const { data: usersData } = useUsers()

  const createNote = useCreateTaskNote()
  const uploadAttachment = useUploadTaskAttachment()
  const deleteAttachment = useDeleteTaskAttachment()
  const assignTask = useAssignTask()
  const updateStatus = useUpdateTaskStatus()

  const [newNote, setNewNote] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const users = usersData?.users || []
  const isAssignedToMe = task?.assigned_to === currentUserId
  const canClaim = task && !task.assigned_to && task.status !== 'completed'
  const canRelease = task && isAssignedToMe && task.status !== 'completed'
  const canComplete = task && isAssignedToMe && task.status === 'in_progress'
  const isCompleted = task?.status === 'completed'

  const handleAddNote = async () => {
    if (!taskId || !newNote.trim() || !currentUserId) return
    try {
      await createNote.mutateAsync({ taskId, content: newNote.trim(), userId: currentUserId })
      setNewNote('')
      toast.success('Note added')
    } catch {
      toast.error('Failed to add note')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !taskId || !currentUserId) return

    try {
      await uploadAttachment.mutateAsync({ taskId, file, userId: currentUserId })
      toast.success('File uploaded')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      toast.error('Failed to upload file')
    }
  }

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!taskId) return
    try {
      await deleteAttachment.mutateAsync({ taskId, attachmentId, userId: currentUserId })
      toast.success('Attachment deleted')
    } catch {
      toast.error('Failed to delete attachment')
    }
  }

  const handleDownloadAttachment = async (attachmentId: number, filename: string) => {
    if (!taskId) return
    try {
      const response = await api.get(`/tasks/${taskId}/attachments/${attachmentId}/download`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download file')
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!taskId || !task) return
    try {
      await updateStatus.mutateAsync({ taskId, status: newStatus, changedBy: currentUserId })
      toast.success(`Status updated to ${newStatus}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handlePriorityChange = async (newPriority: string) => {
    if (!taskId || !task) return
    try {
      await updateStatus.mutateAsync({ taskId, priority: newPriority, changedBy: currentUserId })
      toast.success(`Priority updated to ${newPriority}`)
    } catch {
      toast.error('Failed to update priority')
    }
  }

  const handleDueDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!taskId || !task) return
    const newDueDate = e.target.value || null
    try {
      await updateStatus.mutateAsync({ taskId, dueDate: newDueDate, changedBy: currentUserId })
      toast.success(newDueDate ? `Due date updated to ${formatDate(newDueDate)}` : 'Due date cleared')
    } catch {
      toast.error('Failed to update due date')
    }
  }

  const handleAssignChange = async (userId: string) => {
    if (!taskId || !currentUserId) return
    try {
      await assignTask.mutateAsync({ taskId, assignedTo: userId, assignedBy: currentUserId })
      const user = users.find(u => u.id === userId)
      toast.success(`Task assigned to ${user?.full_name || 'user'}`)
    } catch {
      toast.error('Failed to assign task')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleCopyLink = async () => {
    if (!taskId) return
    const link = `${window.location.origin}/tasks?taskId=${taskId}`
    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[1100px] overflow-y-auto">
        <SheetHeader className="space-y-4">
          <SheetTitle>Task Details</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <TaskDetailSkeleton />
        ) : task ? (
          <div className="mt-6 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                <ClipboardList className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs text-muted-foreground font-mono">TASK-{task.id}</span>
                    <h3 className="text-lg font-semibold">{task.title}</h3>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                    className="flex-shrink-0"
                  >
                    {linkCopied ? (
                      <Check className="h-4 w-4 mr-2 text-green-500" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    {linkCopied ? 'Copied!' : 'Copy Link'}
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={task.status} />
                  <SeverityBadge severity={task.priority} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Task Controls */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Task Controls</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Status Control */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Status</label>
                  <Select
                    value={task.status}
                    onValueChange={handleStatusChange}
                    disabled={updateStatus.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Priority Control */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Priority</label>
                  <Select
                    value={task.priority}
                    onValueChange={handlePriorityChange}
                    disabled={updateStatus.isPending || isCompleted}
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

                {/* Due Date Control */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Due Date</label>
                  <Input
                    type="date"
                    value={task.due_date ? task.due_date.split('T')[0] : ''}
                    onChange={handleDueDateChange}
                    disabled={updateStatus.isPending || isCompleted}
                  />
                </div>

                {/* Assignment Control */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Assigned To</label>
                  <Select
                    value={task.assigned_to || 'unassigned'}
                    onValueChange={(value) => {
                      if (value !== 'unassigned') {
                        handleAssignChange(value)
                      }
                    }}
                    disabled={assignTask.isPending || isCompleted}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" disabled>
                        Unassigned
                      </SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name} ({user.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Task Info */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Task Information</h4>
              <div className="space-y-3">
                {task.due_date && (
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Due Date</span>
                    </div>
                    <span className="text-sm font-medium">
                      {formatDate(task.due_date)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Priority</span>
                  </div>
                  <SeverityBadge severity={task.priority} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Created</span>
                  </div>
                  <span className="text-sm">
                    {formatDateTime(task.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3">Description</h4>
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {task.description}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Related Alert */}
            {task.alert_id && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3">Related Alert</h4>
                  <div className="p-3 rounded-lg border">
                    <p className="text-sm">Alert #{task.alert_id}</p>
                    {task.alert_scenario && (
                      <p className="text-sm text-muted-foreground mt-1">{task.alert_scenario}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Completion Info */}
            {task.completed_at && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3">Completion</h4>
                  <div className="p-3 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Completed At</span>
                      <span className="text-sm">{formatDateTime(task.completed_at)}</span>
                    </div>
                    {task.resolution_notes && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm">{task.resolution_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Tabs for Notes, Attachments, History */}
            <Tabs defaultValue="notes" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="notes" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Notes {notes && notes.length > 0 && `(${notes.length})`}
                </TabsTrigger>
                <TabsTrigger value="attachments" className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Files {attachments && attachments.length > 0 && `(${attachments.length})`}
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  History
                </TabsTrigger>
              </TabsList>

              {/* Notes Tab */}
              <TabsContent value="notes" className="mt-4 space-y-4">
                {/* Add Note */}
                <div className="space-y-2">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    rows={3}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || createNote.isPending}
                  >
                    {createNote.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Add Note
                  </Button>
                </div>

                {/* Notes List */}
                {notesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : notes && notes.length > 0 ? (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div key={note.id} className="p-3 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{note.user_name || 'Unknown'}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(note.created_at)}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
                )}
              </TabsContent>

              {/* Attachments Tab */}
              <TabsContent value="attachments" className="mt-4 space-y-4">
                {/* Upload */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadAttachment.isPending}
                  >
                    {uploadAttachment.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload File
                  </Button>
                </div>

                {/* Attachments List */}
                {attachmentsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : attachments && attachments.length > 0 ? (
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{att.original_filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(att.file_size)} • {att.user_name || 'Unknown'} • {formatDistanceToNow(att.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDownloadAttachment(att.id, att.original_filename)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteAttachment(att.id)}
                            disabled={deleteAttachment.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No attachments yet.</p>
                )}
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="mt-4">
                {historyLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : history && history.length > 0 ? (
                  <div className="space-y-3">
                    {history.map((entry) => {
                      const isAction = ['note_added', 'attachment_uploaded', 'attachment_deleted', 'assigned', 'unassigned'].includes(entry.new_status)
                      const isPriorityChange = entry.new_status.startsWith('priority_')
                      const isDueDateChange = entry.new_status.startsWith('due_date_')
                      const actionLabels: Record<string, string> = {
                        note_added: 'Added a note',
                        attachment_uploaded: 'Uploaded a file',
                        attachment_deleted: 'Deleted a file',
                        assigned: 'Task assigned',
                        unassigned: 'Task unassigned',
                      }
                      const actionIcons: Record<string, React.ReactNode> = {
                        note_added: <MessageSquare className="h-4 w-4 text-muted-foreground" />,
                        attachment_uploaded: <Paperclip className="h-4 w-4 text-muted-foreground" />,
                        attachment_deleted: <Trash2 className="h-4 w-4 text-muted-foreground" />,
                        assigned: <UserPlus className="h-4 w-4 text-muted-foreground" />,
                      }

                      return (
                        <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                            {isDueDateChange ? <Calendar className="h-4 w-4 text-muted-foreground" /> : actionIcons[entry.new_status] || <History className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {isAction ? (
                                <span className="text-sm font-medium">{actionLabels[entry.new_status] || entry.new_status}</span>
                              ) : isDueDateChange ? (
                                <>
                                  <span className="text-sm font-medium">Due date changed:</span>
                                  <span className="text-sm">{entry.previous_status || 'not set'}</span>
                                  <span className="text-muted-foreground">→</span>
                                  <span className="text-sm">{entry.new_status === 'due_date_cleared' ? 'cleared' : entry.new_status.replace('due_date_', '')}</span>
                                </>
                              ) : isPriorityChange ? (
                                <>
                                  <span className="text-sm font-medium">Priority changed:</span>
                                  <SeverityBadge severity={entry.previous_status || 'unknown'} />
                                  <span className="text-muted-foreground">→</span>
                                  <SeverityBadge severity={entry.new_status.replace('priority_', '')} />
                                </>
                              ) : entry.previous_status ? (
                                <>
                                  <StatusBadge status={entry.previous_status} />
                                  <span className="text-muted-foreground">→</span>
                                  <StatusBadge status={entry.new_status} />
                                </>
                              ) : (
                                <>
                                  <span className="text-sm">Created as</span>
                                  <StatusBadge status={entry.new_status} />
                                </>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {entry.changed_by_name || 'System'} • {formatDistanceToNow(entry.created_at)}
                            </p>
                            {(entry.reason || entry.notes) && (
                              <p className="text-sm mt-1 text-muted-foreground">{entry.reason || entry.notes}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No history available.</p>
                )}
              </TabsContent>
            </Tabs>

            <Separator />

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-4">
              {canClaim && (
                <Button onClick={() => onClaim?.(task)}>
                  Claim Task
                </Button>
              )}
              {canRelease && (
                <Button variant="outline" onClick={() => onRelease?.(task)}>
                  Release Task
                </Button>
              )}
              {canComplete && (
                <Button onClick={() => onComplete?.(task)}>
                  Mark Complete
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 text-center text-muted-foreground">
            Task not found.
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function TaskDetailSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      </div>
      <Separator />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
