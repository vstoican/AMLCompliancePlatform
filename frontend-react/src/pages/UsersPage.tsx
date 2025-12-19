"use client"

import { useState, useMemo } from 'react'
import { Users, Plus, RefreshCw, Search, Shield, UserCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserTable, UserForm, ResetPasswordModal } from '@/components/users'
import { PageHeader, ConfirmDialog, StatsCard } from '@/components/shared'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useResetPassword } from '@/hooks/queries'
import { useAuthStore } from '@/stores/authStore'
import type { User } from '@/types/user'

export default function UsersPage() {
  const currentUser = useAuthStore((state) => state.user)

  const [formOpen, setFormOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data, isLoading, refetch } = useUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUserMutation = useDeleteUser()
  const resetPassword = useResetPassword()

  // Calculate stats
  const stats = useMemo(() => {
    const users = data?.users || []
    return {
      total: users.length,
      active: users.filter(u => u.is_active).length,
      admins: users.filter(u => u.role === 'admin').length,
      disabled: users.filter(u => !u.is_active).length,
    }
  }, [data?.users])

  // Filter users
  const filteredUsers = useMemo(() => {
    let users = data?.users || []

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      users = users.filter(u =>
        u.full_name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
      )
    }

    if (roleFilter && roleFilter !== 'all') {
      users = users.filter(u => u.role === roleFilter)
    }

    if (statusFilter && statusFilter !== 'all') {
      users = users.filter(u =>
        statusFilter === 'active' ? u.is_active : !u.is_active
      )
    }

    return users
  }, [data?.users, searchQuery, roleFilter, statusFilter])

  const handleCreateNew = () => {
    setSelectedUser(null)
    setFormOpen(true)
  }

  const handleEdit = (user: User) => {
    setSelectedUser(user)
    setFormOpen(true)
  }

  const handleFormSubmit = async (formData: Partial<User> & { password?: string }) => {
    try {
      if (selectedUser) {
        await updateUser.mutateAsync({
          id: selectedUser.id,
          ...formData,
        })
        toast.success('User updated', {
          description: `${formData.full_name} has been updated successfully.`,
        })
      } else {
        await createUser.mutateAsync(formData as Partial<User> & { password: string })
        toast.success('User created', {
          description: `${formData.full_name} has been created successfully.`,
        })
      }
      setFormOpen(false)
      setSelectedUser(null)
    } catch (error) {
      toast.error(selectedUser ? 'Failed to update user' : 'Failed to create user')
    }
  }

  const handleResetPassword = async (userId: string, newPassword: string) => {
    try {
      await resetPassword.mutateAsync({ userId, newPassword })
      toast.success('Password reset', {
        description: `Password for ${resetPasswordUser?.full_name} has been reset.`,
      })
      setResetPasswordUser(null)
    } catch (error) {
      toast.error('Failed to reset password')
    }
  }

  const handleDelete = async () => {
    if (!deleteUser) return

    try {
      await deleteUserMutation.mutateAsync(deleteUser.id)
      toast.success('User deleted', {
        description: `${deleteUser.full_name} has been deleted.`,
      })
      setDeleteUser(null)
    } catch (error) {
      toast.error('Failed to delete user')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage system users, roles, and access controls"
        icon={Users}
      >
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button size="sm" onClick={handleCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard
          title="Total Users"
          value={stats.total}
          icon={Users}
        />
        <StatsCard
          title="Active Users"
          value={stats.active}
          icon={UserCheck}
          trend={{ value: stats.active, isPositive: true }}
        />
        <StatsCard
          title="Administrators"
          value={stats.admins}
          icon={Shield}
        />
        <StatsCard
          title="Disabled Accounts"
          value={stats.disabled}
          icon={UserX}
          trend={stats.disabled > 0 ? { value: stats.disabled, isPositive: false } : undefined}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="senior_analyst">Senior Analyst</SelectItem>
                <SelectItem value="analyst">Analyst</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Users</CardTitle>
            <span className="text-sm text-muted-foreground">
              {filteredUsers.length} of {stats.total} users
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <UserTable
            users={filteredUsers}
            isLoading={isLoading}
            onEdit={handleEdit}
            onResetPassword={setResetPasswordUser}
            onDelete={setDeleteUser}
            currentUserId={currentUser?.id}
          />
        </CardContent>
      </Card>

      <UserForm
        user={selectedUser}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleFormSubmit}
        isLoading={createUser.isPending || updateUser.isPending}
      />

      <ResetPasswordModal
        user={resetPasswordUser}
        open={!!resetPasswordUser}
        onOpenChange={(open) => !open && setResetPasswordUser(null)}
        onSubmit={handleResetPassword}
        isLoading={resetPassword.isPending}
      />

      <ConfirmDialog
        open={!!deleteUser}
        onOpenChange={(open) => !open && setDeleteUser(null)}
        title="Delete User"
        description={`Are you sure you want to delete ${deleteUser?.full_name}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteUserMutation.isPending}
      />
    </div>
  )
}
