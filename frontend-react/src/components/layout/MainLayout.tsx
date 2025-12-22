import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useThemeStore } from '@/stores/uiStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  AlertTriangle,
  ClipboardList,
  Shield,
  GitBranch,
  History,
  FileText,
  Settings,
  Bot,
  Globe,
  UserCog,
  Key,
  Webhook,
  Download,
} from 'lucide-react'

// Mobile navigation items (simplified)
const mobileNavItems = [
  { title: 'Dashboard', href: '/', icon: LayoutDashboard },
  { title: 'AI Assistant', href: '/ai-assistant', icon: Bot },
  { title: 'Customers', href: '/customers', icon: Users },
  { title: 'Transactions', href: '/transactions', icon: CreditCard },
  { title: 'Tasks', href: '/tasks', icon: ClipboardList },
  { title: 'Alerts', href: '/alerts', icon: AlertTriangle },
  { title: 'Alert Definitions', href: '/alert-definitions', icon: Shield },
  { title: 'Workflows', href: '/workflows', icon: GitBranch },
  { title: 'Workflow History', href: '/workflow-history', icon: History },
  { title: 'Reports', href: '/reports', icon: FileText },
  { title: 'Country Risk', href: '/country-risk', icon: Globe },
  { title: 'Users', href: '/users', icon: UserCog },
  { title: 'API Keys', href: '/api-keys', icon: Key },
  { title: 'Webhooks', href: '/webhooks', icon: Webhook },
  { title: 'Data Export', href: '/data-export', icon: Download },
  { title: 'Settings', href: '/settings', icon: Settings },
]

function MobileNav() {
  const location = useLocation()
  const { setMobileMenuOpen } = useThemeStore()

  return (
    <ScrollArea className="h-[calc(100vh-8rem)]">
      <div className="space-y-1 p-4">
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            onClick={() => setMobileMenuOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              location.pathname === item.href
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.title}
          </NavLink>
        ))}
      </div>
    </ScrollArea>
  )
}

export function MainLayout() {
  const { mobileMenuOpen, setMobileMenuOpen } = useThemeStore()

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Sidebar */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <div className="flex h-16 items-center px-6 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <span className="font-semibold">Sentry</span>
                <span className="text-xs text-muted-foreground block">by TrustRelay</span>
              </div>
            </div>
          </div>
          <MobileNav />
          <Separator />
          <div className="p-4 text-xs text-muted-foreground text-center">
            Sentry v2.0
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="lg:pl-64">
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
