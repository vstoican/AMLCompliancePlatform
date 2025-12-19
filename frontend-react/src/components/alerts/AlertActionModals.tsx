"use client"

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useUsers } from '@/hooks/queries'
import type { Alert } from '@/types/alert'

// Assign Modal
interface AssignModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: Alert | null
  onSubmit: (userId: string) => Promise<void>
  isSubmitting?: boolean
}

export function AssignModal({
  open,
  onOpenChange,
  alert,
  onSubmit,
  isSubmitting = false,
}: AssignModalProps) {
  const [selectedUser, setSelectedUser] = useState('')
  const { data: usersData } = useUsers()

  const handleSubmit = async () => {
    if (selectedUser) {
      await onSubmit(selectedUser)
      setSelectedUser('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Assign Alert</DialogTitle>
          <DialogDescription>
            Assign alert #{alert?.id} to a team member.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger>
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              {usersData?.users?.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name} ({user.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedUser || isSubmitting}>
            {isSubmitting ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Escalate Modal
const escalateSchema = z.object({
  userId: z.string().min(1, 'Select a user'),
  reason: z.string().optional(),
})

interface EscalateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: Alert | null
  onSubmit: (userId: string, reason?: string) => Promise<void>
  isSubmitting?: boolean
}

export function EscalateModal({
  open,
  onOpenChange,
  alert,
  onSubmit,
  isSubmitting = false,
}: EscalateModalProps) {
  const { data: usersData } = useUsers()
  const form = useForm({
    resolver: zodResolver(escalateSchema),
    defaultValues: { userId: '', reason: '' },
  })

  const handleSubmit = async (data: { userId: string; reason?: string }) => {
    await onSubmit(data.userId, data.reason)
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Escalate Alert</DialogTitle>
          <DialogDescription>
            Escalate alert #{alert?.id} to a supervisor or senior analyst.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Escalate To</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {usersData?.users?.filter(u => u.role === 'admin' || u.role === 'manager' || u.role === 'senior_analyst').map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name} ({user.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why is this alert being escalated?"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Escalating...' : 'Escalate'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// Resolve Modal
const resolveSchema = z.object({
  resolutionType: z.string().min(1, 'Select resolution type'),
  notes: z.string().optional(),
})

interface ResolveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: Alert | null
  onSubmit: (resolutionType: string, notes?: string) => Promise<void>
  isSubmitting?: boolean
}

export function ResolveModal({
  open,
  onOpenChange,
  alert,
  onSubmit,
  isSubmitting = false,
}: ResolveModalProps) {
  const form = useForm({
    resolver: zodResolver(resolveSchema),
    defaultValues: { resolutionType: '', notes: '' },
  })

  const handleSubmit = async (data: { resolutionType: string; notes?: string }) => {
    await onSubmit(data.resolutionType, data.notes)
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Resolve Alert</DialogTitle>
          <DialogDescription>
            Mark alert #{alert?.id} as resolved.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="resolutionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resolution Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select resolution type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="false_positive">False Positive</SelectItem>
                      <SelectItem value="true_positive">True Positive</SelectItem>
                      <SelectItem value="suspicious_activity_report">Suspicious Activity Report (SAR)</SelectItem>
                      <SelectItem value="no_action_required">No Action Required</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resolution Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add notes about the resolution..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Resolving...' : 'Resolve'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// Hold Modal
const holdSchema = z.object({
  reason: z.string().min(1, 'Please provide a reason'),
})

interface HoldModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: Alert | null
  onSubmit: (reason: string) => Promise<void>
  isSubmitting?: boolean
}

export function HoldModal({
  open,
  onOpenChange,
  alert,
  onSubmit,
  isSubmitting = false,
}: HoldModalProps) {
  const form = useForm({
    resolver: zodResolver(holdSchema),
    defaultValues: { reason: '' },
  })

  const handleSubmit = async (data: { reason: string }) => {
    await onSubmit(data.reason)
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Put Alert On Hold</DialogTitle>
          <DialogDescription>
            Put alert #{alert?.id} on hold for later review.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why is this alert being put on hold?"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Put On Hold'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
