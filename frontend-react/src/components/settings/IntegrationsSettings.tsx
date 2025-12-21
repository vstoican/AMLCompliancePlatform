"use client"

import { useState, useEffect } from 'react'
import { Link2, Key, Download, ExternalLink, Shield, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface IntegrationCardProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick?: () => void
}

function IntegrationCard({ icon, title, description, onClick }: IntegrationCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-2xl">
            {icon}
          </div>
          <div>
            <h4 className="font-semibold">{title}</h4>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface ServiceStatus {
  connected: boolean
  checking: boolean
  lastChecked?: Date
  error?: string
}

export function IntegrationsSettings() {
  const [sanctionsApiStatus, setSanctionsApiStatus] = useState<ServiceStatus>({
    connected: false,
    checking: true,
  })

  const checkSanctionsApi = async () => {
    setSanctionsApiStatus(prev => ({ ...prev, checking: true }))
    try {
      // Try to hit the sanctions API health or search endpoint
      const response = await fetch('/api/sanctions/health', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      setSanctionsApiStatus({
        connected: response.ok,
        checking: false,
        lastChecked: new Date(),
      })
    } catch {
      setSanctionsApiStatus({
        connected: false,
        checking: false,
        lastChecked: new Date(),
        error: 'Service unavailable',
      })
    }
  }

  useEffect(() => {
    checkSanctionsApi()
  }, [])

  const handleWebhooks = () => {
    // TODO: Implement webhooks configuration
    alert('Webhooks configuration coming soon')
  }

  const handleApiKeys = () => {
    // TODO: Implement API keys management
    alert('API keys management coming soon')
  }

  const handleDataExports = () => {
    // TODO: Implement data exports
    alert('Data exports coming soon')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>External Integrations</CardTitle>
          <CardDescription>
            Connect external services and manage data flows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <IntegrationCard
              icon={<Link2 className="h-6 w-6 text-primary" />}
              title="Webhooks"
              description="Configure webhook endpoints for event notifications"
              onClick={handleWebhooks}
            />
            <IntegrationCard
              icon={<Key className="h-6 w-6 text-primary" />}
              title="API Keys"
              description="Manage API keys for external integrations"
              onClick={handleApiKeys}
            />
            <IntegrationCard
              icon={<Download className="h-6 w-6 text-primary" />}
              title="Data Exports"
              description="Export data for compliance and reporting"
              onClick={handleDataExports}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Services</CardTitle>
          <CardDescription>
            Status of integrated external services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <div>
                  <p className="font-medium">Temporal Workflows</p>
                  <p className="text-sm text-muted-foreground">Connected</p>
                </div>
              </div>
              <a
                href="http://localhost:8080"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Open UI <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <div>
                  <p className="font-medium">NATS JetStream</p>
                  <p className="text-sm text-muted-foreground">Connected - Event streaming</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">Port 4222</span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <div>
                  <p className="font-medium">MinIO Object Storage</p>
                  <p className="text-sm text-muted-foreground">Connected - Document storage</p>
                </div>
              </div>
              <a
                href="http://localhost:9001"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Open Console <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <div>
                  <p className="font-medium">MCP Database Server</p>
                  <p className="text-sm text-muted-foreground">Connected - AI database access</p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">Port 3100</span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${
                  sanctionsApiStatus.checking
                    ? 'bg-yellow-500 animate-pulse'
                    : sanctionsApiStatus.connected
                      ? 'bg-green-500'
                      : 'bg-red-500'
                }`} />
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Sanctions Screening API</p>
                    <p className="text-sm text-muted-foreground">
                      {sanctionsApiStatus.checking
                        ? 'Checking connection...'
                        : sanctionsApiStatus.connected
                          ? 'Connected - OFAC, EU, UN sanctions lists'
                          : 'Disconnected - Service unavailable'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={checkSanctionsApi}
                  disabled={sanctionsApiStatus.checking}
                >
                  <RefreshCw className={`h-4 w-4 ${sanctionsApiStatus.checking ? 'animate-spin' : ''}`} />
                </Button>
                <span className="text-sm text-muted-foreground">Port 8081</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Documentation</CardTitle>
          <CardDescription>
            Access the API documentation for integration development
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium">Swagger UI</span>
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href="http://localhost:8000/redoc"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium">ReDoc</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
