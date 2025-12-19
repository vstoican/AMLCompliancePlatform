"use client"

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage } from './ChatMessage'
import type { Message } from './ChatMessage'
import { SuggestionChips } from './SuggestionChips'

interface AIChatProps {
  onSendMessage?: (message: string) => Promise<string>
}

const defaultSuggestions = [
  'What are the highest risk customers?',
  'Summarize today\'s alerts',
  'Explain suspicious activity indicators',
  'What transactions need review?',
]

export function AIChat({ onSendMessage }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // If no onSendMessage provided, use mock response
      const response = onSendMessage
        ? await onSendMessage(userMessage.content)
        : await mockResponse(userMessage.content)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion)
    textareaRef.current?.focus()
  }

  const handleClear = () => {
    setMessages([])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] border rounded-lg bg-card">
      {/* Messages Area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 mb-4">
              <Send className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">AI Compliance Assistant</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Ask questions about customers, transactions, alerts, or compliance regulations.
              The AI assistant can help analyze patterns and provide insights.
            </p>
            <SuggestionChips
              suggestions={defaultSuggestions}
              onSelect={handleSuggestion}
            />
          </div>
        ) : (
          <div className="divide-y">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isLoading && (
              <div className="flex gap-3 p-4 bg-background">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">AI Assistant</p>
                  <p className="text-sm text-muted-foreground">Thinking...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Ask a question about compliance, customers, or alerts..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="min-h-[44px] max-h-32 resize-none"
          />
          <div className="flex flex-col gap-1">
            <Button onClick={handleSend} disabled={!input.trim() || isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" onClick={handleClear}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Mock response for demo purposes
async function mockResponse(question: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 1500))

  const lowerQuestion = question.toLowerCase()

  if (lowerQuestion.includes('risk') && lowerQuestion.includes('customer')) {
    return `Based on current data, here are the highest risk customers:

1. **ABC Corporation** - Risk Score: 8.5/10
   - Multiple large transactions to high-risk jurisdictions
   - Recent sanctions screening hits

2. **XYZ Holdings** - Risk Score: 7.8/10
   - Unusual transaction patterns detected
   - Incomplete KYC documentation

3. **Global Trade Ltd** - Risk Score: 7.2/10
   - High volume of cash transactions
   - Complex ownership structure

I recommend prioritizing reviews for these customers.`
  }

  if (lowerQuestion.includes('alert')) {
    return `Here's a summary of today's alerts:

**Total Alerts:** 24
- Critical: 2
- High: 5
- Medium: 12
- Low: 5

**Key Issues:**
- 3 potential structuring patterns detected
- 2 sanctions screening matches requiring review
- 5 unusual geographic transaction patterns

Would you like me to provide details on any specific alert category?`
  }

  if (lowerQuestion.includes('suspicious') || lowerQuestion.includes('indicator')) {
    return `Common suspicious activity indicators in AML compliance include:

1. **Structuring** - Breaking large transactions into smaller amounts to avoid reporting thresholds

2. **Rapid Movement of Funds** - Quick transfers across multiple accounts or jurisdictions

3. **Unusual Geographic Patterns** - Transactions with high-risk countries without clear business rationale

4. **Round Dollar Amounts** - Frequent transactions in exact round numbers

5. **Inconsistent Business Activity** - Transaction volumes that don't match the customer's stated business

Would you like me to explain any of these in more detail?`
  }

  return `I understand you're asking about "${question}".

As an AI compliance assistant, I can help you with:
- Customer risk analysis
- Transaction monitoring insights
- Alert investigation support
- Regulatory compliance questions

Could you please provide more specific details about what you'd like to know?`
}
