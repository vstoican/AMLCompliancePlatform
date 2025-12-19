"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface RiskThresholds {
  low: number
  medium: number
  high: number
}

interface RiskSettingsProps {
  onSave?: (thresholds: RiskThresholds) => void
}

export function RiskSettings({ onSave }: RiskSettingsProps) {
  const [thresholds, setThresholds] = useState<RiskThresholds>({
    low: 3,
    medium: 5,
    high: 7,
  })

  const handleSave = () => {
    onSave?.(thresholds)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Risk Score Thresholds</CardTitle>
          <CardDescription>
            Configure the thresholds for risk categorization (1-10 scale)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Low Risk (up to)</Label>
                <span className="text-sm font-medium text-green-500">{thresholds.low}</span>
              </div>
              <Slider
                value={[thresholds.low]}
                onValueChange={(values: number[]) => setThresholds({ ...thresholds, low: values[0] })}
                max={10}
                min={1}
                step={1}
                className="[&_[role=slider]]:bg-green-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Medium Risk (up to)</Label>
                <span className="text-sm font-medium text-yellow-500">{thresholds.medium}</span>
              </div>
              <Slider
                value={[thresholds.medium]}
                onValueChange={(values: number[]) => setThresholds({ ...thresholds, medium: values[0] })}
                max={10}
                min={1}
                step={1}
                className="[&_[role=slider]]:bg-yellow-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>High Risk (up to)</Label>
                <span className="text-sm font-medium text-orange-500">{thresholds.high}</span>
              </div>
              <Slider
                value={[thresholds.high]}
                onValueChange={(values: number[]) => setThresholds({ ...thresholds, high: values[0] })}
                max={10}
                min={1}
                step={1}
                className="[&_[role=slider]]:bg-orange-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Critical Risk</Label>
                <span className="text-sm font-medium text-red-500">Above {thresholds.high}</span>
              </div>
            </div>
          </div>

          <Button onClick={handleSave}>Save Thresholds</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk Factor Weights</CardTitle>
          <CardDescription>
            Adjust the weight of each risk factor in the overall score calculation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Risk factor configuration will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
