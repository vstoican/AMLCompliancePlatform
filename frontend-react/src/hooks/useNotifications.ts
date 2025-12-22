import { useEffect, useRef, useCallback } from 'react'
import { useNotificationStore } from '@/stores/notificationStore'
import type { Notification } from '@/stores/notificationStore'
import { toast } from 'sonner'
import api from '@/lib/api'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface ApiNotification {
  id: string
  type: string
  title: string
  message: string
  severity: string
  timestamp: string
  read: boolean
  data?: Record<string, unknown>
}

interface NotificationsResponse {
  notifications: ApiNotification[]
  count: number
  unread_count: number
}

export function useNotifications() {
  const {
    addNotification,
    setNotifications,
    setConnected,
    setLoading,
    markAsRead: storeMarkAsRead,
    markAllAsRead: storeMarkAllAsRead,
    isConnected,
    isLoading,
    notifications,
    unreadCount,
  } = useNotificationStore()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasFetchedRef = useRef(false)

  // Fetch notifications from API (NATS JetStream - last 24 hours)
  const fetchNotifications = useCallback(async (force = false) => {
    if (hasFetchedRef.current && !force) return

    setLoading(true)
    try {
      const response = await api.get<NotificationsResponse>('/notifications', {
        params: { limit: 50 },
      })

      const apiNotifications: Notification[] = response.data.notifications.map((n) => ({
        id: n.id,
        type: n.type as 'alert' | 'task' | 'system',
        title: n.title,
        message: n.message,
        severity: n.severity as 'low' | 'medium' | 'high' | 'critical',
        timestamp: n.timestamp,
        read: n.read, // Use read status from API
        data: n.data,
      }))

      setNotifications(apiNotifications)
      hasFetchedRef.current = true
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [setNotifications, setLoading])

  // Mark single notification as read (persists to backend)
  const markAsRead = useCallback(async (id: string) => {
    // Optimistically update UI
    storeMarkAsRead(id)

    try {
      await api.post(`/notifications/${id}/read`)
    } catch (error) {
      console.error('Error marking notification as read:', error)
      // Refetch to sync state on error
      fetchNotifications(true)
    }
  }, [storeMarkAsRead, fetchNotifications])

  // Mark all notifications as read (persists to backend)
  const markAllAsRead = useCallback(async () => {
    // Optimistically update UI
    storeMarkAllAsRead()

    try {
      await api.post('/notifications/read-all')
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      // Refetch to sync state on error
      fetchNotifications(true)
    }
  }, [storeMarkAllAsRead, fetchNotifications])

  useEffect(() => {
    let mounted = true

    // Fetch existing notifications from API on mount
    fetchNotifications()

    const connect = () => {
      if (!mounted) return

      // Close existing connection if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      // Connect to NATS-based notification stream for real-time push
      const eventSource = new EventSource(`${API_BASE_URL}/stream/notifications`)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        if (mounted) {
          setConnected(true)
          console.log('Connected to NATS notification stream')
        }
      }

      eventSource.onmessage = (event) => {
        if (!mounted) return

        try {
          // Notification is already formatted by the backend
          const notification = JSON.parse(event.data)

          // Add notification (will be deduplicated by store)
          addNotification({
            type: notification.type || 'alert',
            title: notification.title,
            message: notification.message,
            severity: notification.severity as 'low' | 'medium' | 'high' | 'critical',
            timestamp: notification.timestamp,
            data: notification.data,
          })

          // Show toast for high/critical alerts
          if (notification.severity === 'high' || notification.severity === 'critical') {
            toast.warning(`${notification.title}: ${notification.data?.scenario || notification.message}`, {
              description: `Requires attention`,
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
  }, [addNotification, setConnected, fetchNotifications])

  return {
    notifications,
    unreadCount,
    isConnected,
    isLoading,
    refetch: () => fetchNotifications(true),
    markAsRead,
    markAllAsRead,
  }
}
