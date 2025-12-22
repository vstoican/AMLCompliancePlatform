import { create } from 'zustand'

export interface Notification {
  id: string
  type: 'alert' | 'task' | 'system'
  title: string
  message: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  timestamp: string
  read: boolean
  data?: Record<string, unknown>
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  isConnected: boolean
  isLoading: boolean
  lastFetchedIds: Set<string>

  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'read'>) => void
  setNotifications: (notifications: Notification[]) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
  clearAll: () => void
  setConnected: (connected: boolean) => void
  setLoading: (loading: boolean) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isConnected: false,
  isLoading: false,
  lastFetchedIds: new Set(),

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: notification.data?.alertId
        ? `alert-${notification.data.alertId}`
        : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      read: false,
    }

    set((state) => {
      // Avoid duplicates by checking ID
      if (state.notifications.some((n) => n.id === newNotification.id)) {
        return state
      }
      return {
        notifications: [newNotification, ...state.notifications].slice(0, 50),
        unreadCount: state.unreadCount + 1,
      }
    })
  },

  setNotifications: (notifications) => {
    const ids = new Set(notifications.map((n) => n.id))
    set({
      notifications: notifications.slice(0, 50),
      unreadCount: notifications.filter((n) => !n.read).length,
      lastFetchedIds: ids,
    })
  },

  markAsRead: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id)
      if (notification && !notification.read) {
        return {
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }
      }
      return state
    })
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  removeNotification: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id)
      const unreadDecrement = notification && !notification.read ? 1 : 0
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: Math.max(0, state.unreadCount - unreadDecrement),
      }
    })
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0, lastFetchedIds: new Set() })
  },

  setConnected: (connected) => {
    set({ isConnected: connected })
  },

  setLoading: (loading) => {
    set({ isLoading: loading })
  },
}))
