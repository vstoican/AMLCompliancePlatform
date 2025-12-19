import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex gap-3 p-4',
        isUser ? 'bg-muted/50' : 'bg-background'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary' : 'bg-primary/20'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium">
          {isUser ? 'You' : 'AI Assistant'}
        </p>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  )
}
