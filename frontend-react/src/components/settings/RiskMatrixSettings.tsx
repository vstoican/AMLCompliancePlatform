"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface RiskMatrixConfig {
  // Weights (should sum to ~80)
  geography_weight: number
  product_weight: number
  behavior_weight: number
  // Penalties
  pep_penalty: number
  sanctions_penalty: number
  adverse_media_penalty: number
  // Thresholds
  high_threshold: number
  medium_threshold: number
}

const defaultConfig: RiskMatrixConfig = {
  geography_weight: 30,
  product_weight: 20,
  behavior_weight: 30,
  pep_penalty: 10,
  sanctions_penalty: 15,
  adverse_media_penalty: 5,
  high_threshold: 70,
  medium_threshold: 40,
}

interface RiskMatrixSettingsProps {
  onSave?: (config: RiskMatrixConfig) => void
}

export function RiskMatrixSettings({ onSave }: RiskMatrixSettingsProps) {
  const [config, setConfig] = useState<RiskMatrixConfig>(defaultConfig)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem('riskMatrixConfig')
    if (saved) {
      try {
        setConfig(JSON.parse(saved))
      } catch {
        // Use defaults
      }
    }
  }, [])

  const totalWeight = config.geography_weight + config.product_weight + config.behavior_weight

  const handleChange = (field: keyof RiskMatrixConfig, value: number) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  const handleSave = () => {
    localStorage.setItem('riskMatrixConfig', JSON.stringify(config))
    setIsDirty(false)
    onSave?.(config)
  }

  const handleReset = () => {
    setConfig(defaultConfig)
    setIsDirty(true)
  }

  const formulaPreview = `(geo × ${config.geography_weight} + prod × ${config.product_weight} + behav × ${config.behavior_weight}) / ${totalWeight / 10}`

  return (
    <div className="space-y-6">
      {/* Formula Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Calculation Weights</CardTitle>
          <CardDescription>
            Configure the weights used in risk score calculation. Total weight should equal 80% (remainder is for penalty flags).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-primary/5 border border-border rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold">Current Formula:</span>
              <code className="text-sm text-primary">{formulaPreview}</code>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total Weight:</span>
              <span className={`text-lg font-bold ${totalWeight === 80 ? 'text-green-500' : 'text-yellow-500'}`}>
                {totalWeight}%
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Geography Risk Weight (%)</Label>
                  <Badge variant="outline" className="bg-primary/10 text-primary">
                    {config.geography_weight}%
                  </Badge>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={config.geography_weight}
                  onChange={(e) => handleChange('geography_weight', Number(e.target.value))}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Product Risk Weight (%)</Label>
                  <Badge variant="outline" className="bg-primary/10 text-primary">
                    {config.product_weight}%
                  </Badge>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={config.product_weight}
                  onChange={(e) => handleChange('product_weight', Number(e.target.value))}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Behavior Risk Weight (%)</Label>
                  <Badge variant="outline" className="bg-primary/10 text-primary">
                    {config.behavior_weight}%
                  </Badge>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={config.behavior_weight}
                  onChange={(e) => handleChange('behavior_weight', Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Penalty Points */}
      <Card>
        <CardHeader>
          <CardTitle>Penalty Points</CardTitle>
          <CardDescription>
            Points added to the risk score when flags are triggered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>PEP Flag Penalty</Label>
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">
                  +{config.pep_penalty}
                </Badge>
              </div>
              <Input
                type="number"
                min={0}
                max={50}
                value={config.pep_penalty}
                onChange={(e) => handleChange('pep_penalty', Number(e.target.value))}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Sanctions Hit Penalty</Label>
                <Badge variant="outline" className="bg-red-500/10 text-red-500">
                  +{config.sanctions_penalty}
                </Badge>
              </div>
              <Input
                type="number"
                min={0}
                max={50}
                value={config.sanctions_penalty}
                onChange={(e) => handleChange('sanctions_penalty', Number(e.target.value))}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Adverse Media Penalty</Label>
                <Badge variant="outline" className="bg-purple-500/10 text-purple-500">
                  +{config.adverse_media_penalty}
                </Badge>
              </div>
              <Input
                type="number"
                min={0}
                max={50}
                value={config.adverse_media_penalty}
                onChange={(e) => handleChange('adverse_media_penalty', Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Level Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Level Thresholds</CardTitle>
          <CardDescription>
            Define score thresholds for risk level classification (1-100 scale).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>High Risk Threshold</Label>
                <Badge variant="destructive">≥ {config.high_threshold}</Badge>
              </div>
              <Input
                type="number"
                min={1}
                max={100}
                value={config.high_threshold}
                onChange={(e) => handleChange('high_threshold', Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Scores at or above this threshold are classified as "high" risk
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Medium Risk Threshold</Label>
                <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                  ≥ {config.medium_threshold}
                </Badge>
              </div>
              <Input
                type="number"
                min={1}
                max={100}
                value={config.medium_threshold}
                onChange={(e) => handleChange('medium_threshold', Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Scores below this are classified as "low" risk
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button onClick={handleSave} disabled={!isDirty}>
              Save Risk Matrix
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
