import { MoreHorizontal, Pencil, Key, Trash2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'
import type { User } from '@/types/user'

interface UserTableProps {
  users: User[]
  isLoading?: boolean
  onEdit?: (user: User) => void
  onResetPassword?: (user: User) => void
  onDelete?: (user: User) => void
  currentUserId?: string
}

const roleLabels: Record<string, string> = {
  analyst: 'Analyst',
  senior_analyst: 'Senior Analyst',
  manager: 'Manager',
  admin: 'Admin',
}

const roleColors: Record<string, string> = {
  analyst: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  senior_analyst: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  manager: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  admin: 'bg-red-500/10 text-red-500 border-red-500/20',
}

export function UserTable({
  users,
  isLoading = false,
  onEdit,
  onResetPassword,
  onDelete,
  currentUserId,
}: UserTableProps) {
  if (isLoading) {
    return <UserTableSkeleton />
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No users found.
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">
                {user.full_name}
                {user.id === currentUserId && (
                  <span className="ml-2 text-xs text-muted-foreground">(You)</span>
                )}
              </TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant="outline" className={roleColors[user.role]}>
                  {roleLabels[user.role] || user.role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={user.is_active ? 'default' : 'secondary'}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {user.last_login ? formatDateTime(user.last_login) : 'Never'}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit?.(user)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onResetPassword?.(user)}>
                      <Key className="h-4 w-4 mr-2" />
                      Reset Password
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDelete?.(user)}
                      disabled={user.id === currentUserId}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function UserTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-4 w-40" /></TableCell>
              <TableCell><Skeleton className="h-6 w-20" /></TableCell>
              <TableCell><Skeleton className="h-6 w-16" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-8 w-8" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
