import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/**
 * Hook that connects to the alert SSE stream and automatically
 * refreshes the alerts query when new alerts arrive.
 */
export function useAlertStream() {
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true

    const connect = () => {
      if (!mounted) return

      // Close existing connection if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      const eventSource = new EventSource(`${API_BASE_URL}/stream/alerts`)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        if (mounted) {
          console.log('Alert stream connected')
        }
      }

      eventSource.onmessage = () => {
        if (!mounted) return

        // Invalidate alerts queries to trigger a refetch
        queryClient.invalidateQueries({ queryKey: ['alerts'] })
      }

      eventSource.onerror = () => {
        if (!mounted) return

        eventSource.close()

        // Reconnect after 5 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mounted) {
            console.log('Reconnecting to alert stream...')
            connect()
          }
        }, 5000)
      }
    }

    connect()

    return () => {
      mounted = false
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [queryClient])
}
