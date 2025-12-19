import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useEffect } from 'react'

// Layout
import { MainLayout } from '@/components/layout'

// Pages
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import CustomersPage from '@/pages/CustomersPage'
import TransactionsPage from '@/pages/TransactionsPage'
import AlertsPage from '@/pages/AlertsPage'
import TasksPage from '@/pages/TasksPage'
import UsersPage from '@/pages/UsersPage'
import AlertDefinitionsPage from '@/pages/AlertDefinitionsPage'
import WorkflowsPage from '@/pages/WorkflowsPage'
import WorkflowHistoryPage from '@/pages/WorkflowHistoryPage'
import ReportsPage from '@/pages/ReportsPage'
import SettingsPage from '@/pages/SettingsPage'
import ProfilePage from '@/pages/ProfilePage'
import AIAssistantPage from '@/pages/AIAssistantPage'
import CountryRiskPage from '@/pages/CountryRiskPage'
import ApiKeysPage from '@/pages/ApiKeysPage'
import WebhooksPage from '@/pages/WebhooksPage'
import DataExportPage from '@/pages/DataExportPage'
import NotFoundPage from '@/pages/NotFoundPage'

// Stores
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/uiStore'

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

// Theme initialization component
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useThemeStore()

  useEffect(() => {
    // Apply theme on mount
    const savedTheme = localStorage.getItem('ui-storage')
    if (savedTheme) {
      try {
        const { state } = JSON.parse(savedTheme)
        if (state?.theme) {
          setTheme(state.theme)
          return
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Default to dark theme
    if (!document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.add('dark')
      setTheme('dark')
    }
  }, [setTheme])

  // Keep theme in sync
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  return <>{children}</>
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected routes with layout */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* Overview */}
              <Route path="/" element={<DashboardPage />} />
              <Route path="/ai-assistant" element={<AIAssistantPage />} />

              {/* Case Management */}
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/alerts" element={<AlertsPage />} />

              {/* Rules & Automation */}
              <Route path="/alert-definitions" element={<AlertDefinitionsPage />} />
              <Route path="/workflows" element={<WorkflowsPage />} />
              <Route path="/workflow-history" element={<WorkflowHistoryPage />} />

              {/* Analytics */}
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/country-risk" element={<CountryRiskPage />} />

              {/* Administration */}
              <Route path="/users" element={<UsersPage />} />
              <Route path="/api-keys" element={<ApiKeysPage />} />
              <Route path="/webhooks" element={<WebhooksPage />} />
              <Route path="/data-export" element={<DataExportPage />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* User */}
              <Route path="/profile" element={<ProfilePage />} />

              {/* 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
