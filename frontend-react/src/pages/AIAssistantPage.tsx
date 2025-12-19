"use client"

import { Bot } from 'lucide-react'
import { AIChat } from '@/components/ai'
import { PageHeader } from '@/components/shared'

export default function AIAssistantPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Assistant"
        description="AI-powered compliance analysis and insights"
        icon={Bot}
      />

      <AIChat />
    </div>
  )
}
