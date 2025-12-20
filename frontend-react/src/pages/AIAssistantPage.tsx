"use client"

import { useState } from 'react'
import { Bot } from 'lucide-react'
import { AIChat } from '@/components/ai'
import { PageHeader } from '@/components/shared'
import api from '@/lib/api'

export default function AIAssistantPage() {
  const [conversationId, setConversationId] = useState<string | null>(null)

  const handleSendMessage = async (message: string): Promise<string> => {
    try {
      const { data } = await api.post('/ai/chat', {
        message,
        conversation_id: conversationId,
      })

      // Store conversation ID for follow-up messages
      if (data.conversation_id) {
        setConversationId(data.conversation_id)
      }

      return data.response
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      if (err.response?.data?.detail) {
        throw new Error(err.response.data.detail)
      }
      throw new Error('Failed to get AI response. Please check your settings.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Assistant"
        description="AI-powered compliance analysis and insights"
        icon={Bot}
      />

      <AIChat onSendMessage={handleSendMessage} />
    </div>
  )
}
