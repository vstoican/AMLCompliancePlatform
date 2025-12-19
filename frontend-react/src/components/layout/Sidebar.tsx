import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  AlertTriangle,
  ClipboardList,
  Shield,
  ShieldCheck,
  GitBranch,
  History,
  FileText,
  Settings,
  Bot,
  ChevronDown,
  Globe,
  UserCog,
  Key,
  Webhook,
  Download,
} from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  title: string
  items: NavItem[]
  defaultOpen?: boolean
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    defaultOpen: true,
    items: [
      { title: 'Dashboard', href: '/', icon: LayoutDashboard },
      { title: 'AI Assistant', href: '/ai-assistant', icon: Bot },
    ],
  },
  {
    title: 'Case Management',
    defaultOpen: true,
    items: [
      { title: 'Customers', href: '/customers', icon: Users },
      { title: 'Transactions', href: '/transactions', icon: CreditCard },
      { title: 'Tasks', href: '/tasks', icon: ClipboardList },
      { title: 'Alert Stream', href: '/alerts', icon: AlertTriangle },
    ],
  },
  {
    title: 'Rules & Automation',
    defaultOpen: true,
    items: [
      { title: 'Alert Definitions', href: '/alert-definitions', icon: Shield },
      { title: 'Workflows', href: '/workflows', icon: GitBranch },
      { title: 'Workflow History', href: '/workflow-history', icon: History },
    ],
  },
  {
    title: 'Analytics',
    defaultOpen: false,
    items: [
      { title: 'Reports', href: '/reports', icon: FileText },
      { title: 'Country Risk', href: '/country-risk', icon: Globe },
    ],
  },
  {
    title: 'Administration',
    defaultOpen: false,
    items: [
      { title: 'Users', href: '/users', icon: UserCog },
      { title: 'Roles & Permissions', href: '/roles', icon: ShieldCheck },
      { title: 'API Keys', href: '/api-keys', icon: Key },
      { title: 'Webhooks', href: '/webhooks', icon: Webhook },
      { title: 'Data Export', href: '/data-export', icon: Download },
      { title: 'Settings', href: '/settings', icon: Settings },
    ],
  },
]

function NavSection({ section }: { section: NavSection }) {
  const [isOpen, setIsOpen] = useState(section.defaultOpen ?? true)
  const location = useLocation()

  // Check if any item in this section is active
  const hasActiveItem = section.items.some(
    (item) => location.pathname === item.href
  )

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors',
          hasActiveItem && 'text-foreground'
        )}
      >
        {section.title}
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="mt-1 space-y-1">
          {section.items.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <span className="font-semibold text-foreground">TrustRelay</span>
            <span className="text-xs text-muted-foreground block">AML Compliance</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        {navSections.map((section, index) => (
          <div key={section.title}>
            <NavSection section={section} />
            {index < navSections.length - 1 && (
              <Separator className="my-2" />
            )}
          </div>
        ))}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <div className="text-xs text-muted-foreground text-center">
          <p>AML Compliance Platform</p>
          <p className="mt-1">v2.0 (React)</p>
        </div>
      </div>
    </aside>
  )
}
