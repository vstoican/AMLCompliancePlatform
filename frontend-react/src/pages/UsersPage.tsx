"use client"

import { useState } from 'react'
import { Users, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { UserTable, UserForm, ResetPasswordModal } from '@/components/users'
import { PageHeader, ConfirmDialog } from '@/components/shared'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useResetPassword } from '@/hooks/queries'
import { useAuthStore } from '@/stores/authStore'
import type { User } from '@/types/user'

export default function UsersPage() {
  const currentUser = useAuthStore((state) => state.user)

  const [formOpen, setFormOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)

  const { data, isLoading, refetch } = useUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUserMutation = useDeleteUser()
  const resetPassword = useResetPassword()

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
        title="Users"
        description="Manage system users and their roles"
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

      <UserTable
        users={data?.users || []}
        isLoading={isLoading}
        onEdit={handleEdit}
        onResetPassword={setResetPasswordUser}
        onDelete={setDeleteUser}
        currentUserId={currentUser?.id}
      />

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
