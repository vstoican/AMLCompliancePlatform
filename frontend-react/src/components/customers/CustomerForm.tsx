"use client"

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
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
import type { Customer } from '@/types/customer'

const customerSchema = z.object({
  // Basic Info
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone_number: z.string().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED']),
  country: z.string().optional(),

  // Personal Info
  birth_date: z.string().optional(),
  identity_number: z.string().optional(),
  place_of_birth: z.string().optional(),
  country_of_birth: z.string().optional(),
  employer_name: z.string().optional(),

  // Address
  address_county: z.string().optional(),
  address_city: z.string().optional(),
  address_street: z.string().optional(),
  address_house_number: z.string().optional(),
  address_block_number: z.string().optional(),
  address_entrance: z.string().optional(),
  address_apartment: z.string().optional(),

  // Document Info
  document_type: z.enum(['PERSONAL_ID', 'PASSPORT', 'DRIVING_LICENSE']).optional(),
  document_id: z.string().optional(),
  document_issuer: z.string().optional(),
  document_date_of_issue: z.string().optional(),
  document_date_of_expire: z.string().optional(),

  // Risk Flags
  pep_flag: z.boolean(),
  sanctions_hit: z.boolean(),
  risk_override: z.string().optional(),

  // Consent & Validation
  data_validated: z.enum(['VALIDATED', 'NOT VALIDATED', 'PENDING']).optional(),
  marketing_consent: z.enum(['ACCEPTED', 'REJECTED', 'NOT SET']).optional(),
  kyc_motion_consent_given: z.boolean().optional(),
})

type CustomerFormData = z.infer<typeof customerSchema>

interface CustomerFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: Customer | null
  onSubmit: (data: Partial<Customer>) => Promise<void>
  isSubmitting?: boolean
}

export function CustomerForm({
  open,
  onOpenChange,
  customer,
  onSubmit,
  isSubmitting = false,
}: CustomerFormProps) {
  const isEditing = !!customer

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone_number: '',
      status: 'PENDING',
      country: '',
      birth_date: '',
      identity_number: '',
      place_of_birth: '',
      country_of_birth: '',
      employer_name: '',
      address_county: '',
      address_city: '',
      address_street: '',
      address_house_number: '',
      address_block_number: '',
      address_entrance: '',
      address_apartment: '',
      document_type: undefined,
      document_id: '',
      document_issuer: '',
      document_date_of_issue: '',
      document_date_of_expire: '',
      pep_flag: false,
      sanctions_hit: false,
      risk_override: '',
      data_validated: 'NOT VALIDATED',
      marketing_consent: 'NOT SET',
      kyc_motion_consent_given: false,
    },
  })

  // Reset form when customer prop changes or dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        first_name: customer?.first_name || '',
        last_name: customer?.last_name || '',
        email: customer?.email || '',
        phone_number: customer?.phone_number || '',
        status: customer?.status || 'PENDING',
        country: customer?.country || '',
        birth_date: customer?.birth_date?.split('T')[0] || '',
        identity_number: customer?.identity_number || '',
        place_of_birth: customer?.place_of_birth || '',
        country_of_birth: customer?.country_of_birth || '',
        employer_name: customer?.employer_name || '',
        address_county: customer?.address_county || '',
        address_city: customer?.address_city || '',
        address_street: customer?.address_street || '',
        address_house_number: customer?.address_house_number || '',
        address_block_number: customer?.address_block_number || '',
        address_entrance: customer?.address_entrance || '',
        address_apartment: customer?.address_apartment || '',
        document_type: customer?.document_type || undefined,
        document_id: customer?.document_id || '',
        document_issuer: customer?.document_issuer || '',
        document_date_of_issue: customer?.document_date_of_issue?.split('T')[0] || '',
        document_date_of_expire: customer?.document_date_of_expire?.split('T')[0] || '',
        pep_flag: customer?.pep_flag || false,
        sanctions_hit: customer?.sanctions_hit || false,
        risk_override: customer?.risk_override || '',
        data_validated: customer?.data_validated || 'NOT VALIDATED',
        marketing_consent: customer?.marketing_consent || 'NOT SET',
        kyc_motion_consent_given: customer?.kyc_motion_consent_given || false,
      })
    }
  }, [customer, open, form])

  const handleSubmit = async (data: CustomerFormData) => {
    // Clean up empty strings and convert to proper format for Customer type
    const cleanedData: Partial<Customer> = {}
    for (const [key, value] of Object.entries(data)) {
      if (value !== '' && value !== undefined) {
        (cleanedData as Record<string, unknown>)[key] = value
      }
    }
    await onSubmit(cleanedData)
    form.reset()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[1100px]" hideCloseButton>
        <SheetHeader>
          <SheetTitle>
            {isEditing ? 'Edit Customer' : 'Add New Customer'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Update customer information below.'
              : 'Enter the details for the new customer.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-6 py-4 pl-1 pr-4">
                {/* Basic Information */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Basic Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="John" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 234 567 890" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="PENDING">Pending</SelectItem>
                              <SelectItem value="ACTIVE">Active</SelectItem>
                              <SelectItem value="INACTIVE">Inactive</SelectItem>
                              <SelectItem value="BLOCKED">Blocked</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country</FormLabel>
                          <FormControl>
                            <Input placeholder="Romania" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* Personal Information */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Personal Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="birth_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="identity_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Identity Number</FormLabel>
                          <FormControl>
                            <Input placeholder="ID123456789" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="place_of_birth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Place of Birth</FormLabel>
                          <FormControl>
                            <Input placeholder="Bucharest" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="country_of_birth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country of Birth</FormLabel>
                          <FormControl>
                            <Input placeholder="Romania" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="employer_name"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Employer</FormLabel>
                          <FormControl>
                            <Input placeholder="Company Name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* Address */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Address</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="address_street"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Street</FormLabel>
                          <FormControl>
                            <Input placeholder="Main Street" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_house_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>House Number</FormLabel>
                          <FormControl>
                            <Input placeholder="123" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_block_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Block</FormLabel>
                          <FormControl>
                            <Input placeholder="A" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_entrance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Entrance</FormLabel>
                          <FormControl>
                            <Input placeholder="1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_apartment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Apartment</FormLabel>
                          <FormControl>
                            <Input placeholder="12" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Bucharest" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_county"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>County/Region</FormLabel>
                          <FormControl>
                            <Input placeholder="Ilfov" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* Document Information */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Document Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="document_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Document Type</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(value === '__none__' ? undefined : value)}
                            value={field.value || '__none__'}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">Not specified</SelectItem>
                              <SelectItem value="PERSONAL_ID">Personal ID</SelectItem>
                              <SelectItem value="PASSPORT">Passport</SelectItem>
                              <SelectItem value="DRIVING_LICENSE">Driving License</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="document_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Document ID</FormLabel>
                          <FormControl>
                            <Input placeholder="AB123456" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="document_issuer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Issuer</FormLabel>
                          <FormControl>
                            <Input placeholder="SPCLEP" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="document_date_of_issue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Issue</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="document_date_of_expire"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Expiry</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* Risk & Compliance */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Risk & Compliance</h4>
                  <div className="space-y-4">
                    <div className="flex gap-6">
                      <FormField
                        control={form.control}
                        name="pep_flag"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">PEP Flag</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="sanctions_hit"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="font-normal">Sanctions Hit</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="risk_override"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Risk Override</FormLabel>
                          <FormControl>
                            <Input placeholder="Manual override reason" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* Consent & Validation */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Consent & Validation</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="data_validated"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data Validated</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || 'NOT VALIDATED'}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="VALIDATED">Validated</SelectItem>
                              <SelectItem value="NOT VALIDATED">Not Validated</SelectItem>
                              <SelectItem value="PENDING">Pending</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="marketing_consent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Marketing Consent</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || 'NOT SET'}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ACCEPTED">Accepted</SelectItem>
                              <SelectItem value="REJECTED">Rejected</SelectItem>
                              <SelectItem value="NOT SET">Not Set</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="kyc_motion_consent_given"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0 col-span-2">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="font-normal">KYC Motion Consent Given</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>

            <SheetFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Customer'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
