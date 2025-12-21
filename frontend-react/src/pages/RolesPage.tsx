"use client"

import { useState } from 'react'
import { Shield, Users, Pencil, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  FormDescription,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared'
import { ConfirmDialog } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { useUsers, useRoles, useCreateRole, useUpdateRole, useDeleteRole, type Role } from '@/hooks/queries'

// Color options for roles
const colorOptions = [
  { value: 'red', label: 'Red', class: 'bg-red-500/10 text-red-500 border-red-500/20' },
  { value: 'amber', label: 'Amber', class: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  { value: 'blue', label: 'Blue', class: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  { value: 'green', label: 'Green', class: 'bg-green-500/10 text-green-500 border-green-500/20' },
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' },
]

const getColorClass = (color: string) => {
  return colorOptions.find(c => c.value === color)?.class || colorOptions[3].class
}

// Available permissions
const availablePermissions = [
  { value: 'read:customers', label: 'Read Customers' },
  { value: 'write:customers', label: 'Write Customers' },
  { value: 'read:alerts', label: 'Read Alerts' },
  { value: 'write:alerts', label: 'Write Alerts' },
  { value: 'read:transactions', label: 'Read Transactions' },
  { value: 'write:transactions', label: 'Write Transactions' },
  { value: 'read:reports', label: 'Read Reports' },
  { value: 'write:reports', label: 'Write Reports' },
  { value: 'read:tasks', label: 'Read Tasks' },
  { value: 'write:tasks', label: 'Write Tasks' },
  { value: 'read:users', label: 'Read Users' },
  { value: 'write:users', label: 'Write Users' },
  { value: 'admin:*', label: 'Admin Access' },
]

// Permission matrix data
const permissionResources = [
  { resource: 'Customers', admin: 'Full', manager: 'Full', senior_analyst: 'Read', analyst: 'Read' },
  { resource: 'Alerts', admin: 'Full', manager: 'Full', senior_analyst: 'Full', analyst: 'Full' },
  { resource: 'Transactions', admin: 'Full', manager: 'Read', senior_analyst: 'Read', analyst: 'Read' },
  { resource: 'Reports', admin: 'Full', manager: 'Full', senior_analyst: 'Read', analyst: 'Read' },
  { resource: 'Tasks', admin: 'Full', manager: 'Full', senior_analyst: 'Full', analyst: 'Full' },
  { resource: 'User Management', admin: 'Full', manager: 'None', senior_analyst: 'None', analyst: 'None' },
  { resource: 'Settings', admin: 'Full', manager: 'Read', senior_analyst: 'None', analyst: 'None' },
  { resource: 'Integrations', admin: 'Full', manager: 'Read', senior_analyst: 'None', analyst: 'None' },
]

const permissionBadgeColor: Record<string, string> = {
  Full: 'bg-green-500/10 text-green-500 border-green-500/20',
  Read: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  None: 'bg-red-500/10 text-red-500 border-red-500/20',
}

// Form schema
const roleSchema = z.object({
  id: z.string().min(1, 'Role ID is required').regex(/^[a-z_]+$/, 'ID must be lowercase letters and underscores only'),
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  permissions: z.array(z.string()),
  color: z.string(),
})

type RoleFormData = z.infer<typeof roleSchema>

export default function RolesPage() {
  const { data: usersData } = useUsers()
  const { data: roles, isLoading } = useRoles()
  const createRole = useCreateRole()
  const updateRole = useUpdateRole()
  const deleteRole = useDeleteRole()

  const [formOpen, setFormOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null)

  const users = usersData?.users || []

  // Count users per role
  const userCountByRole = users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      id: '',
      name: '',
      description: '',
      permissions: [],
      color: 'blue',
    },
  })

  const handleAddNew = () => {
    setEditingRole(null)
    form.reset({
      id: '',
      name: '',
      description: '',
      permissions: [],
      color: 'blue',
    })
    setFormOpen(true)
  }

  const handleEdit = (role: Role) => {
    setEditingRole(role)
    form.reset({
      id: role.id,
      name: role.name,
      description: role.description || '',
      permissions: role.permissions,
      color: role.color,
    })
    setFormOpen(true)
  }

  const handleDelete = (role: Role) => {
    setRoleToDelete(role)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!roleToDelete) return
    try {
      await deleteRole.mutateAsync(roleToDelete.id)
      toast.success('Role deleted successfully')
      setDeleteDialogOpen(false)
      setRoleToDelete(null)
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to delete role')
    }
  }

  const handleSubmit = async (data: RoleFormData) => {
    try {
      if (editingRole) {
        await updateRole.mutateAsync({
          id: editingRole.id,
          name: data.name,
          description: data.description,
          permissions: data.permissions,
          color: data.color,
        })
        toast.success('Role updated successfully')
      } else {
        await createRole.mutateAsync(data)
        toast.success('Role created successfully')
      }
      setFormOpen(false)
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || (editingRole ? 'Failed to update role' : 'Failed to create role'))
    }
  }

  const togglePermission = (permission: string) => {
    const current = form.getValues('permissions')
    if (current.includes(permission)) {
      form.setValue('permissions', current.filter(p => p !== permission))
    } else {
      form.setValue('permissions', [...current, permission])
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Roles & Permissions"
          description="Configure role-based access controls"
          icon={Shield}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">System Roles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="Configure role-based access controls"
        icon={Shield}
      >
        <Button size="sm" onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Role
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* System Roles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Roles</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {roles?.map((role) => (
                <div key={role.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{role.name}</span>
                      {role.is_system && (
                        <Badge variant="outline" className="text-xs">System</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{role.description}</div>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.slice(0, 4).map((perm) => (
                        <Badge key={perm} variant="outline" className="text-xs">
                          {perm}
                        </Badge>
                      ))}
                      {role.permissions.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{role.permissions.length - 4} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={getColorClass(role.color)}>
                      <Users className="h-3 w-3 mr-1" />
                      {userCountByRole[role.id] || 0} users
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(role)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!role.is_system && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(role)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Permission Matrix */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permission Matrix</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead className="text-center">Admin</TableHead>
                    <TableHead className="text-center">Manager</TableHead>
                    <TableHead className="text-center">Sr. Analyst</TableHead>
                    <TableHead className="text-center">Analyst</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionResources.map((row) => (
                    <TableRow key={row.resource}>
                      <TableCell className="font-medium">{row.resource}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={permissionBadgeColor[row.admin]}>
                          {row.admin}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={permissionBadgeColor[row.manager]}>
                          {row.manager}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={permissionBadgeColor[row.senior_analyst]}>
                          {row.senior_analyst}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={permissionBadgeColor[row.analyst]}>
                          {row.analyst}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
            <DialogDescription>
              {editingRole
                ? 'Update the role settings and permissions.'
                : 'Create a new role with custom permissions.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., compliance_officer"
                        {...field}
                        disabled={!!editingRole}
                      />
                    </FormControl>
                    <FormDescription>
                      Lowercase letters and underscores only. Cannot be changed after creation.
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
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Compliance Officer" {...field} />
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
                        placeholder="Describe the role's responsibilities..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a color" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {colorOptions.map((color) => (
                          <SelectItem key={color.value} value={color.value}>
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full bg-${color.value}-500`} />
                              {color.label}
                            </div>
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
                name="permissions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Permissions</FormLabel>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {availablePermissions.map((perm) => (
                        <Button
                          key={perm.value}
                          type="button"
                          variant={field.value.includes(perm.value) ? "default" : "outline"}
                          size="sm"
                          className="justify-start text-xs"
                          onClick={() => togglePermission(perm.value)}
                        >
                          {perm.label}
                        </Button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createRole.isPending || updateRole.isPending}>
                  {(createRole.isPending || updateRole.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingRole ? 'Update Role' : 'Create Role'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Role"
        description={`Are you sure you want to delete "${roleToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isLoading={deleteRole.isPending}
      />
    </div>
  )
}
