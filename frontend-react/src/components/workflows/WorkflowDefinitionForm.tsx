"use client"

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { WorkflowDefinition, WorkflowDefinitionCreate } from '@/types/workflow'

const workflowDefinitionSchema = z.object({
  code: z
    .string()
    .min(3, 'Code must be at least 3 characters')
    .max(50, 'Code must be at most 50 characters')
    .regex(/^[a-z0-9_]+$/, 'Code must be lowercase letters, numbers, and underscores only'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500),
  workflow_type: z.enum(['kyc_refresh', 'sanctions_screening', 'document_request', 'sar_filing']),
  schedule_type: z.enum(['cron', 'event', 'manual']),
  cron_expression: z.string(),
  trigger_event: z.string(),
  create_alert: z.boolean(),
  alert_severity: z.enum(['low', 'medium', 'high', 'critical']),
  create_task: z.boolean(),
  task_type: z.string(),
  task_priority: z.enum(['low', 'medium', 'high', 'critical']),
  timeout_seconds: z.number().min(60).max(86400),
  retry_max_attempts: z.number().min(0).max(10),
  retry_backoff_seconds: z.number().min(10).max(3600),
  enabled: z.boolean(),
  days_before_expiry: z.number().min(1).max(730),
})

type WorkflowDefinitionFormData = z.infer<typeof workflowDefinitionSchema>

interface WorkflowDefinitionFormProps {
  definition?: WorkflowDefinition | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: WorkflowDefinitionCreate) => void
  isLoading?: boolean
}

const workflowTypeOptions = [
  { value: 'kyc_refresh', label: 'KYC Refresh' },
  { value: 'sanctions_screening', label: 'Sanctions Screening' },
  { value: 'document_request', label: 'Document Request' },
  { value: 'sar_filing', label: 'SAR Filing' },
]

const scheduleTypeOptions = [
  { value: 'cron', label: 'Scheduled (Cron)' },
  { value: 'event', label: 'Event-triggered' },
  { value: 'manual', label: 'Manual' },
]

const triggerEventOptions = [
  { value: 'customer.created', label: 'Customer Created' },
  { value: 'customer.updated', label: 'Customer Updated' },
  { value: 'customer.risk_changed', label: 'Customer Risk Changed' },
  { value: 'transaction.high_risk', label: 'High Risk Transaction' },
  { value: 'document.expiring', label: 'Document Expiring' },
  { value: 'alert.created', label: 'Alert Created' },
]

const cronPresets = [
  { value: '0 2 * * *', label: 'Daily at 2:00 AM' },
  { value: '0 0 * * 0', label: 'Weekly on Sunday' },
  { value: '0 0 1 * *', label: 'Monthly on 1st' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
  { value: '0 8 * * 1-5', label: 'Weekdays at 8 AM' },
]

export function WorkflowDefinitionForm({
  definition,
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
}: WorkflowDefinitionFormProps) {
  const isEditing = !!definition

  const form = useForm<WorkflowDefinitionFormData>({
    resolver: zodResolver(workflowDefinitionSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      workflow_type: 'kyc_refresh',
      schedule_type: 'manual',
      cron_expression: '',
      trigger_event: '',
      create_alert: false,
      alert_severity: 'medium',
      create_task: false,
      task_type: '',
      task_priority: 'medium',
      timeout_seconds: 3600,
      retry_max_attempts: 3,
      retry_backoff_seconds: 60,
      enabled: true,
      days_before_expiry: 365,
    },
  })

  const scheduleType = form.watch('schedule_type')
  const workflowType = form.watch('workflow_type')
  const createAlert = form.watch('create_alert')
  const createTask = form.watch('create_task')

  useEffect(() => {
    if (open) {
      if (definition) {
        const daysBeforeExpiry = (definition.parameters as Record<string, number | undefined>)?.days_before_expiry
        form.reset({
          code: definition.code,
          name: definition.name,
          description: definition.description || '',
          workflow_type: definition.workflow_type,
          schedule_type: definition.schedule_type,
          cron_expression: definition.cron_expression || '',
          trigger_event: definition.trigger_event || '',
          create_alert: definition.create_alert,
          alert_severity: definition.alert_severity,
          create_task: definition.create_task,
          task_type: definition.task_type || '',
          task_priority: definition.task_priority,
          timeout_seconds: definition.timeout_seconds,
          retry_max_attempts: definition.retry_max_attempts,
          retry_backoff_seconds: definition.retry_backoff_seconds,
          enabled: definition.enabled,
          days_before_expiry: daysBeforeExpiry || 365,
        })
      } else {
        form.reset({
          code: '',
          name: '',
          description: '',
          workflow_type: 'kyc_refresh',
          schedule_type: 'manual',
          cron_expression: '',
          trigger_event: '',
          create_alert: false,
          alert_severity: 'medium',
          create_task: false,
          task_type: '',
          task_priority: 'medium',
          timeout_seconds: 3600,
          retry_max_attempts: 3,
          retry_backoff_seconds: 60,
          enabled: true,
          days_before_expiry: 365,
        })
      }
    }
  }, [definition, open, form])

  const handleFormSubmit = (data: WorkflowDefinitionFormData) => {
    const parameters: Record<string, unknown> = {}

    if (data.workflow_type === 'kyc_refresh') {
      parameters.days_before_expiry = data.days_before_expiry
      parameters.check_fields = ['document_date_of_expire']
    }

    const submitData: WorkflowDefinitionCreate = {
      code: data.code,
      name: data.name,
      description: data.description || undefined,
      workflow_type: data.workflow_type,
      schedule_type: data.schedule_type,
      cron_expression: data.schedule_type === 'cron' ? data.cron_expression : undefined,
      trigger_event: data.schedule_type === 'event' ? data.trigger_event : undefined,
      parameters,
      create_alert: data.create_alert,
      alert_severity: data.alert_severity,
      create_task: data.create_task,
      task_type: data.task_type || undefined,
      task_priority: data.task_priority,
      timeout_seconds: data.timeout_seconds,
      retry_max_attempts: data.retry_max_attempts,
      retry_backoff_seconds: data.retry_backoff_seconds,
      enabled: data.enabled,
    }

    onSubmit(submitData)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[1100px] overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Workflow' : 'New Workflow'}</SheetTitle>
          <SheetDescription>
            {isEditing ? 'Update the workflow configuration.' : 'Define a new workflow with schedule and actions.'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-4">
          <Form {...form}>
            <form id="workflow-form" onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6 pb-4">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Basic Information</h3>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="KYC Refresh - Monthly" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input placeholder="kyc_refresh_monthly" {...field} disabled={isEditing} />
                      </FormControl>
                      <FormDescription>Unique identifier (lowercase, underscores only)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Describe what this workflow does..." rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="workflow_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workflow Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {workflowTypeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Schedule Configuration */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Schedule</h3>

                <FormField
                  control={form.control}
                  name="schedule_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Schedule Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select schedule" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {scheduleTypeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {scheduleType === 'cron' && (
                  <FormField
                    control={form.control}
                    name="cron_expression"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cron Expression</FormLabel>
                        <Select onValueChange={field.onChange} value={cronPresets.find((p) => p.value === field.value)?.value || ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select preset" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {cronPresets.map((preset) => (
                              <SelectItem key={preset.value} value={preset.value}>
                                {preset.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormControl>
                          <Input placeholder="0 2 * * *" {...field} className="mt-2 font-mono" />
                        </FormControl>
                        <FormDescription>Format: minute hour day month weekday</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {scheduleType === 'event' && (
                  <FormField
                    control={form.control}
                    name="trigger_event"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trigger Event</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select event" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {triggerEventOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <Separator />

              {/* Workflow Parameters */}
              {workflowType === 'kyc_refresh' && (
                <>
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium">KYC Parameters</h3>

                    <FormField
                      control={form.control}
                      name="days_before_expiry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Days Before Expiry</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={730}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 365)}
                            />
                          </FormControl>
                          <FormDescription>Trigger KYC refresh this many days before document expiry</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Separator />
                </>
              )}

              {/* Actions Configuration */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Actions</h3>

                <FormField
                  control={form.control}
                  name="create_alert"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Create Alert</FormLabel>
                        <FormDescription>Generate alert when workflow triggers</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {createAlert && (
                  <FormField
                    control={form.control}
                    name="alert_severity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alert Severity</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="create_task"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Create Task</FormLabel>
                        <FormDescription>Create a task for analysts to follow up</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {createTask && (
                  <>
                    <FormField
                      control={form.control}
                      name="task_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select task type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="kyc_review">KYC Review</SelectItem>
                              <SelectItem value="document_verification">Document Verification</SelectItem>
                              <SelectItem value="investigation">Investigation</SelectItem>
                              <SelectItem value="escalation_review">Escalation Review</SelectItem>
                              <SelectItem value="sar_review">SAR Review</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="task_priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Priority</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </div>

              <Separator />

              {/* Execution Settings */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Execution Settings</h3>

                <FormField
                  control={form.control}
                  name="timeout_seconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timeout (seconds)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={60}
                          max={86400}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 3600)}
                        />
                      </FormControl>
                      <FormDescription>Maximum execution time (60s - 24h)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="retry_max_attempts"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Retries</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 3)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="retry_backoff_seconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Retry Backoff (s)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={10}
                            max={3600}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 60)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Enabled</FormLabel>
                        <FormDescription>Workflow will run according to its schedule</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </ScrollArea>

        <SheetFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="workflow-form" disabled={isLoading}>
            {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Workflow'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
