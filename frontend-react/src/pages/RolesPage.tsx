"use client"

import { Shield, Users, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared'
import { useUsers } from '@/hooks/queries'

// System roles configuration - matches backend USER_ROLES
const systemRoles = [
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full system access and configuration',
    permissions: ['read:*', 'write:*', 'admin:*'],
    color: 'bg-red-500/10 text-red-500 border-red-500/20',
  },
  {
    id: 'manager',
    name: 'Compliance Manager',
    description: 'Manage alerts, customers, and reports',
    permissions: ['read:customers', 'write:alerts', 'read:reports'],
    color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  },
  {
    id: 'senior_analyst',
    name: 'Senior Analyst',
    description: 'Review alerts, escalate issues, and mentor analysts',
    permissions: ['read:customers', 'read:alerts', 'write:alerts', 'read:transactions'],
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  },
  {
    id: 'analyst',
    name: 'AML Analyst',
    description: 'Review alerts and customer profiles',
    permissions: ['read:customers', 'read:alerts', 'write:alerts'],
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  },
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

export default function RolesPage() {
  const { data } = useUsers()
  const users = data?.users || []

  // Count users per role
  const userCountByRole = users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="Configure role-based access controls"
        icon={Shield}
      >
        <Button size="sm" disabled>
          New Role
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* System Roles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System Roles</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {systemRoles.map((role) => (
                <div key={role.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="font-medium">{role.name}</div>
                    <div className="text-sm text-muted-foreground">{role.description}</div>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map((perm) => (
                        <Badge key={perm} variant="outline" className="text-xs">
                          {perm}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={role.color}>
                      <Users className="h-3 w-3 mr-1" />
                      {userCountByRole[role.id] || 0} users
                    </Badge>
                    <Button variant="ghost" size="sm" disabled>
                      <Pencil className="h-4 w-4" />
                    </Button>
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

      {/* Role Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <div className="font-medium text-red-500">Administrator</div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Full system configuration</li>
                <li>- User management</li>
                <li>- Alert definitions</li>
                <li>- Workflow management</li>
                <li>- API & integrations</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium text-amber-500">Compliance Manager</div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Manage all alerts</li>
                <li>- View all customers</li>
                <li>- Generate reports</li>
                <li>- Escalation handling</li>
                <li>- Task assignment</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium text-purple-500">Senior Analyst</div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Review alerts</li>
                <li>- Escalate to manager</li>
                <li>- View transactions</li>
                <li>- Mentor analysts</li>
                <li>- Quality review</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="font-medium text-blue-500">AML Analyst</div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Review assigned alerts</li>
                <li>- View customer profiles</li>
                <li>- Add notes & comments</li>
                <li>- Request escalation</li>
                <li>- Complete tasks</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
