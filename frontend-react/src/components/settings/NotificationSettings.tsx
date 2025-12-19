"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'

interface NotificationPreferences {
  email_alerts: boolean
  email_tasks: boolean
  email_reports: boolean
  browser_alerts: boolean
  browser_tasks: boolean
}

interface NotificationSettingsProps {
  onSave?: (preferences: NotificationPreferences) => void
}

export function NotificationSettings({ onSave }: NotificationSettingsProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email_alerts: true,
    email_tasks: true,
    email_reports: false,
    browser_alerts: true,
    browser_tasks: false,
  })

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences({ ...preferences, [key]: !preferences[key] })
  }

  const handleSave = () => {
    onSave?.(preferences)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
          <CardDescription>
            Configure when to receive email notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>New Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Receive emails when new alerts are generated
              </p>
            </div>
            <Switch
              checked={preferences.email_alerts}
              onCheckedChange={() => handleToggle('email_alerts')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Task Assignments</Label>
              <p className="text-sm text-muted-foreground">
                Receive emails when tasks are assigned to you
              </p>
            </div>
            <Switch
              checked={preferences.email_tasks}
              onCheckedChange={() => handleToggle('email_tasks')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Daily Reports</Label>
              <p className="text-sm text-muted-foreground">
                Receive daily summary reports via email
              </p>
            </div>
            <Switch
              checked={preferences.email_reports}
              onCheckedChange={() => handleToggle('email_reports')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Browser Notifications</CardTitle>
          <CardDescription>
            Configure in-app browser notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Real-time Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Show browser notifications for new alerts
              </p>
            </div>
            <Switch
              checked={preferences.browser_alerts}
              onCheckedChange={() => handleToggle('browser_alerts')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Task Updates</Label>
              <p className="text-sm text-muted-foreground">
                Show notifications for task status changes
              </p>
            </div>
            <Switch
              checked={preferences.browser_tasks}
              onCheckedChange={() => handleToggle('browser_tasks')}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave}>Save Preferences</Button>
    </div>
  )
}
