import { Bot, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
        {isUser ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground
            prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
            prose-p:my-2 prose-p:leading-relaxed
            prose-ul:my-2 prose-ul:pl-4 prose-li:my-1
            prose-ol:my-2 prose-ol:pl-4
            prose-strong:text-foreground prose-strong:font-semibold
            prose-table:text-sm prose-th:px-3 prose-th:py-2 prose-th:bg-muted prose-td:px-3 prose-td:py-2 prose-td:border
            prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
            prose-pre:bg-muted prose-pre:p-3 prose-pre:rounded-lg">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
