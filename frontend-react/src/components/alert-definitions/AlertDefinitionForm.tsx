"use client"

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import type { AlertDefinition } from '@/types/alert'

const formSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  category: z.enum(['transaction_monitoring', 'workflow', 'customer_risk', 'sanctions']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  threshold_amount: z.string().optional(),
  window_minutes: z.string().optional(),
  enabled: z.boolean(),
})

type FormData = z.infer<typeof formSchema>

export interface AlertDefinitionFormData {
  code: string
  name: string
  description?: string
  category: 'transaction_monitoring' | 'workflow' | 'customer_risk' | 'sanctions'
  severity: 'low' | 'medium' | 'high' | 'critical'
  threshold_amount?: number | null
  window_minutes?: number | null
  enabled: boolean
}

interface AlertDefinitionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  definition?: AlertDefinition | null
  onSubmit: (data: AlertDefinitionFormData) => Promise<void>
  isSubmitting?: boolean
}

export function AlertDefinitionForm({
  open,
  onOpenChange,
  definition,
  onSubmit,
  isSubmitting = false,
}: AlertDefinitionFormProps) {
  const isEditing = !!definition

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      category: 'transaction_monitoring',
      severity: 'medium',
      threshold_amount: '',
      window_minutes: '',
      enabled: true,
    },
  })

  useEffect(() => {
    if (definition) {
      form.reset({
        code: definition.code,
        name: definition.name,
        description: definition.description || '',
        category: definition.category as FormData['category'],
        severity: definition.severity,
        threshold_amount: definition.threshold_amount?.toString() || '',
        window_minutes: definition.window_minutes?.toString() || '',
        enabled: definition.enabled,
      })
    } else {
      form.reset({
        code: '',
        name: '',
        description: '',
        category: 'transaction_monitoring',
        severity: 'medium',
        threshold_amount: '',
        window_minutes: '',
        enabled: true,
      })
    }
  }, [definition, form])

  const handleSubmit = async (data: FormData) => {
    try {
      // Convert string fields to numbers
      const submitData: AlertDefinitionFormData = {
        code: data.code,
        name: data.name,
        description: data.description || undefined,
        category: data.category,
        severity: data.severity,
        threshold_amount: data.threshold_amount ? Number(data.threshold_amount) : null,
        window_minutes: data.window_minutes ? Number(data.window_minutes) : null,
        enabled: data.enabled,
      }
      await onSubmit(submitData)
      onOpenChange(false)
    } catch {
      // Error handled by parent
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[1100px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? 'Edit Alert Definition' : 'Create Alert Definition'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Update the alert definition settings'
              : 'Create a new alert monitoring rule'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 mt-6">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="CASH_OVER_10K_EUR"
                      {...field}
                      disabled={isEditing}
                    />
                  </FormControl>
                  <FormDescription>
                    Unique identifier for this alert rule
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Cash Transaction Over €10,000" {...field} />
                  </FormControl>
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
                    <Textarea
                      placeholder="Describe what this alert monitors..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="transaction_monitoring">
                          Transaction Monitoring
                        </SelectItem>
                        <SelectItem value="workflow">Workflow</SelectItem>
                        <SelectItem value="customer_risk">Customer Risk</SelectItem>
                        <SelectItem value="sanctions">Sanctions</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Severity</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select severity" />
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="threshold_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Threshold Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="10000"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Amount in EUR</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="window_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Window (minutes)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="60"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Detection window</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enabled</FormLabel>
                    <FormDescription>
                      Whether this alert rule is actively monitoring
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
