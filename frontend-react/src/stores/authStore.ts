import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

export interface User {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean

  // Actions
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshAccessToken: () => Promise<boolean>
  fetchUser: () => Promise<void>
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password })
        const { access_token, refresh_token } = response.data

        set({
          accessToken: access_token,
          refreshToken: refresh_token,
          isAuthenticated: true,
        })

        // Fetch user info
        await get().fetchUser()
      },

      logout: async () => {
        const { refreshToken } = get()

        try {
          if (refreshToken) {
            await api.post('/auth/logout', { refresh_token: refreshToken })
          }
        } catch {
          // Ignore logout errors
        }

        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        })
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return false

        try {
          const response = await api.post('/auth/refresh', {
            refresh_token: refreshToken,
          })

          set({
            accessToken: response.data.access_token,
            isAuthenticated: true,
          })

          return true
        } catch {
          // Refresh failed, logout
          get().logout()
          return false
        }
      },

      fetchUser: async () => {
        try {
          const response = await api.get('/auth/me')
          set({ user: response.data })
        } catch {
          // Failed to fetch user, logout
          get().logout()
        }
      },

      setLoading: (loading: boolean) => set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After rehydration, validate the token
        if (state?.accessToken) {
          state.fetchUser().finally(() => state.setLoading(false))
        } else {
          state?.setLoading(false)
        }
      },
    }
  )
)
