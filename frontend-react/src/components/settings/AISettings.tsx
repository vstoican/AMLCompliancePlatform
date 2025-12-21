"use client"

import { useState, useEffect } from 'react'
import { Bot, Eye, EyeOff, Database, Info, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import api from '@/lib/api'

interface AIConfig {
  provider: 'anthropic' | 'openai'
  model: string
  api_key: string
}

interface ModelInfo {
  id: string
  name: string
  created?: number
}

const defaultConfig: AIConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  api_key: '',
}

interface AISettingsProps {
  onSave?: (config: AIConfig) => void
}

export function AISettings({ onSave }: AISettingsProps) {
  const [config, setConfig] = useState<AIConfig>(defaultConfig)
  const [showApiKey, setShowApiKey] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  // Load saved config
  useEffect(() => {
    const saved = localStorage.getItem('trustrelayAIConfig')
    if (saved) {
      try {
        setConfig(JSON.parse(saved))
      } catch {
        // Use defaults
      }
    }
  }, [])

  // Fetch models when provider changes
  useEffect(() => {
    fetchModels(config.provider)
  }, [config.provider])

  const fetchModels = async (provider: string) => {
    setLoadingModels(true)
    setModelsError(null)
    try {
      const { data } = await api.get(`/ai/models/${provider}`)
      setModels(data.models || [])
    } catch (error) {
      console.error('Failed to fetch models:', error)
      setModelsError('Failed to load models')
      // Set fallback models
      if (provider === 'openai') {
        setModels([
          { id: 'gpt-4o', name: 'GPT-4o' },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        ])
      } else {
        setModels([
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        ])
      }
    } finally {
      setLoadingModels(false)
    }
  }

  const handleProviderChange = (provider: 'anthropic' | 'openai') => {
    const defaultModel = provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'
    setConfig((prev) => ({ ...prev, provider, model: defaultModel }))
    setIsDirty(true)
  }

  const handleModelChange = (model: string) => {
    setConfig((prev) => ({ ...prev, model }))
    setIsDirty(true)
  }

  const handleApiKeyChange = (api_key: string) => {
    setConfig((prev) => ({ ...prev, api_key }))
    setIsDirty(true)
  }

  const handleSave = () => {
    localStorage.setItem('trustrelayAIConfig', JSON.stringify(config))
    setIsDirty(false)
    onSave?.(config)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Assistant Configuration
          </CardTitle>
          <CardDescription>
            Configure the AI model and API credentials for the assistant
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>AI Provider</Label>
            <Select value={config.provider} onValueChange={handleProviderChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="openai">OpenAI (GPT)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select your AI provider
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Model</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fetchModels(config.provider)}
                disabled={loadingModels}
                className="h-6 px-2 text-xs"
              >
                {loadingModels ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                <span className="ml-1">Refresh</span>
              </Button>
            </div>
            <Select value={config.model} onValueChange={handleModelChange} disabled={loadingModels}>
              <SelectTrigger>
                <SelectValue placeholder={loadingModels ? "Loading models..." : "Select a model"} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>
                    {config.provider === 'anthropic' ? 'Anthropic Models' : 'OpenAI Models'}
                    {models.length > 0 && ` (${models.length})`}
                  </SelectLabel>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {modelsError ? (
                <span className="text-destructive">{modelsError}</span>
              ) : (
                "Select the AI model to use for analysis"
              )}
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={config.api_key}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="Enter your API key..."
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your API key is stored locally and never shared
            </p>
          </div>

          <Button onClick={handleSave} disabled={!isDirty}>
            Save AI Settings
          </Button>
        </CardContent>
      </Card>

      {/* Database Access Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              The AI Assistant has <strong>read-only access</strong> to your compliance database via MCP (Model Context Protocol).
              It can query customers, transactions, alerts, and tasks to help with compliance analysis, but cannot modify any data.
            </AlertDescription>
          </Alert>

          <div className="mt-4 space-y-2">
            <h4 className="font-medium text-sm">Available Capabilities:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Query customer profiles and risk assessments</li>
              <li>Analyze transaction patterns and anomalies</li>
              <li>Review alert history and resolution patterns</li>
              <li>Generate compliance insights and recommendations</li>
              <li>Search for specific data points across the database</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Usage Tips */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div>
              <h4 className="font-medium">Example Queries:</h4>
              <ul className="text-muted-foreground space-y-1 mt-1">
                <li>"Show me all high-risk customers from the past month"</li>
                <li>"Analyze the transaction patterns for customer X"</li>
                <li>"What are the most common alert types?"</li>
                <li>"Summarize recent PEP-flagged customer activities"</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium">Best Practices:</h4>
              <ul className="text-muted-foreground space-y-1 mt-1">
                <li>Be specific about time ranges when asking about historical data</li>
                <li>Use customer IDs or email addresses for precise lookups</li>
                <li>Ask follow-up questions to drill down into details</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
