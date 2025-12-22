"use client"

import { useState, useMemo } from 'react'
import { Key, Plus, RefreshCw, Copy, Check, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader, StatsCard } from '@/components/shared'
import { useApiKeys, useCreateApiKey, useUpdateApiKey, useDeleteApiKey, useToggleApiKey } from '@/hooks/queries'
import type { ApiKey, ApiKeyCreateRequest, ApiKeyCreateResponse } from '@/types/api-key'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDistanceToNow } from 'date-fns'

export default function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyData, setNewKeyData] = useState<ApiKeyCreateResponse | null>(null)
  const [deleteKey, setDeleteKey] = useState<ApiKey | null>(null)
  const [copied, setCopied] = useState(false)

  // Form state
  const [keyName, setKeyName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read'])

  const { data, isLoading, refetch } = useApiKeys()
  const createApiKey = useCreateApiKey()
  const updateApiKey = useUpdateApiKey()
  const deleteApiKeyMutation = useDeleteApiKey()
  const toggleApiKey = useToggleApiKey()

  // Calculate stats
  const stats = useMemo(() => {
    const keys = data?.apiKeys || []
    return {
      total: keys.length,
      active: keys.filter(k => k.is_active).length,
      inactive: keys.filter(k => !k.is_active).length,
    }
  }, [data?.apiKeys])

  const handleCreateNew = () => {
    setKeyName('')
    setSelectedScopes(['read'])
    setCreateOpen(true)
  }

  const handleCreateSubmit = async () => {
    if (!keyName.trim()) {
      toast.error('Please enter a name for the API key')
      return
    }

    try {
      const result = await createApiKey.mutateAsync({
        name: keyName.trim(),
        scopes: selectedScopes,
      })
      setNewKeyData(result)
      setCreateOpen(false)
      toast.success('API key created', {
        description: 'Make sure to copy your key - you won\'t be able to see it again!',
      })
    } catch (error) {
      toast.error('Failed to create API key')
    }
  }

  const handleToggleScope = (scope: string) => {
    setSelectedScopes(prev =>
      prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    )
  }

  const handleCopyKey = async () => {
    if (!newKeyData?.key) return
    await navigator.clipboard.writeText(newKeyData.key)
    setCopied(true)
    toast.success('API key copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleToggleActive = async (key: ApiKey) => {
    try {
      await toggleApiKey.mutateAsync({
        id: key.id,
        is_active: !key.is_active,
      })
      toast.success(key.is_active ? 'API key disabled' : 'API key enabled')
    } catch (error) {
      toast.error('Failed to update API key')
    }
  }

  const handleDelete = async () => {
    if (!deleteKey) return

    try {
      await deleteApiKeyMutation.mutateAsync(deleteKey.id)
      toast.success('API key deleted')
      setDeleteKey(null)
    } catch (error) {
      toast.error('Failed to delete API key')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Manage API access credentials for programmatic access"
        icon={Key}
      >
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button size="sm" onClick={handleCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Total Keys"
          value={stats.total}
          icon={Key}
        />
        <StatsCard
          title="Active Keys"
          value={stats.active}
          icon={ToggleRight}
        />
        <StatsCard
          title="Disabled Keys"
          value={stats.inactive}
          icon={ToggleLeft}
        />
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Authentication</CardTitle>
          <CardDescription>
            Use API keys to authenticate programmatic requests to the Sentry API.
            Include the key in your request headers as:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block bg-muted p-3 rounded-md text-sm font-mono">
            X-API-Key: sk_live_your_key_here
          </code>
          <p className="text-sm text-muted-foreground mt-2">
            Or use Bearer authentication:
          </p>
          <code className="block bg-muted p-3 rounded-md text-sm font-mono mt-2">
            Authorization: Bearer sk_live_your_key_here
          </code>
        </CardContent>
      </Card>

      {/* API Keys Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Your API Keys</CardTitle>
            <span className="text-sm text-muted-foreground">
              {stats.total} key{stats.total !== 1 ? 's' : ''}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data?.apiKeys?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No API keys yet</p>
              <p className="text-sm">Create your first API key to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.apiKeys?.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {key.key_prefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="secondary" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(key.last_used_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(key.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.is_active ? 'default' : 'secondary'}>
                        {key.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleActive(key)}
                          title={key.is_active ? 'Disable' : 'Enable'}
                        >
                          {key.is_active ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteKey(key)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create API Key Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for programmatic access to the Sentry API.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Key Name</Label>
              <Input
                id="name"
                placeholder="e.g., Production Integration"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="scope-read"
                    checked={selectedScopes.includes('read')}
                    onCheckedChange={() => handleToggleScope('read')}
                  />
                  <Label htmlFor="scope-read" className="font-normal">
                    Read - Access to read data
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="scope-write"
                    checked={selectedScopes.includes('write')}
                    onCheckedChange={() => handleToggleScope('write')}
                  />
                  <Label htmlFor="scope-write" className="font-normal">
                    Write - Access to create and update data
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="scope-admin"
                    checked={selectedScopes.includes('admin')}
                    onCheckedChange={() => handleToggleScope('admin')}
                  />
                  <Label htmlFor="scope-admin" className="font-normal">
                    Admin - Full administrative access
                  </Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createApiKey.isPending || !keyName.trim()}
            >
              {createApiKey.isPending ? 'Creating...' : 'Create Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show New API Key Dialog */}
      <Dialog open={!!newKeyData} onOpenChange={(open) => !open && setNewKeyData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Your new API key has been created. Make sure to copy it now - you won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Your API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={newKeyData?.key || ''}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyKey}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                <strong>Important:</strong> This is the only time you'll see this key.
                Store it securely - you won't be able to retrieve it later.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKeyData(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteKey} onOpenChange={(open) => !open && setDeleteKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the API key "{deleteKey?.name}"?
              This action cannot be undone and any applications using this key will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteApiKeyMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
