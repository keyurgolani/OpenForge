import { NavLink, Outlet } from 'react-router-dom'
import {
  FolderOpen,
  Cpu,
  Wrench,
  Database,
  Settings2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/lib/routes'

/* -------------------------------------------------------------------------- */
/* Nav items                                                                  */
/* -------------------------------------------------------------------------- */

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Workspaces', to: ROUTES.SETTINGS_WORKSPACES, icon: FolderOpen },
  { label: 'Models', to: ROUTES.SETTINGS_MODELS, icon: Cpu },
  { label: 'Tools & Connections', to: ROUTES.SETTINGS_TOOLS, icon: Wrench },
  { label: 'Data', to: ROUTES.SETTINGS_DATA, icon: Database },
  { label: 'Advanced', to: ROUTES.SETTINGS_ADVANCED, icon: Settings2 },
]

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function SettingsLayout() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">Settings</h1>
        <p className="mt-1 font-body text-sm text-fg-muted">
          Manage your instance configuration, models, tools, and data
        </p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar nav */}
        <nav className="w-full shrink-0 lg:w-56">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === ROUTES.SETTINGS}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5',
                      'font-label text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-fg-muted hover:text-fg hover:bg-bg-sunken',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
