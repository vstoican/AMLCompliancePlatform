import { useEffect, useRef } from 'react'
import { useNotificationStore } from '@/stores/notificationStore'
import { toast } from 'sonner'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface AlertEvent {
  id: number
  customer_id: string | null
  type: string
  status: string
  severity: string
  scenario: string
  details: Record<string, unknown>
  alert_definition_id: number | null
  created_at: string
}

export function useNotifications() {
  const { addNotification, setConnected, isConnected, notifications, unreadCount } =
    useNotificationStore()
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
          setConnected(true)
          console.log('Connected to notification stream')
        }
      }

      eventSource.onmessage = (event) => {
        if (!mounted) return

        try {
          const alert: AlertEvent = JSON.parse(event.data)

          // Add notification
          addNotification({
            type: 'alert',
            title: `New ${alert.severity} Alert`,
            message: alert.scenario || `Alert #${alert.id} created`,
            severity: alert.severity as 'low' | 'medium' | 'high' | 'critical',
            timestamp: alert.created_at,
            data: {
              alertId: alert.id,
              customerId: alert.customer_id,
              status: alert.status,
              details: alert.details,
            },
          })

          // Show toast for high/critical alerts
          if (alert.severity === 'high' || alert.severity === 'critical') {
            toast.warning(`${alert.severity.toUpperCase()} Alert: ${alert.scenario}`, {
              description: `Alert #${alert.id} requires attention`,
              duration: 5000,
            })
          }
        } catch (error) {
          console.error('Error parsing notification:', error)
        }
      }

      eventSource.onerror = () => {
        if (!mounted) return

        setConnected(false)
        eventSource.close()

        // Reconnect after 5 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mounted) {
            console.log('Reconnecting to notification stream...')
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
      setConnected(false)
    }
  }, [addNotification, setConnected])

  return {
    notifications,
    unreadCount,
    isConnected,
  }
}
