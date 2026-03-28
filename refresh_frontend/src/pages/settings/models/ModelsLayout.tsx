import { NavLink, Outlet } from 'react-router-dom'
import {
  Server,
  Brain,
  Eye,
  FileText,
  Mic,
  ImageIcon,
  FileType,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/lib/routes'

/* -------------------------------------------------------------------------- */
/* Sub-nav tabs                                                               */
/* -------------------------------------------------------------------------- */

interface SubNavTab {
  label: string
  to: string
  icon: LucideIcon
}

const SUB_NAV_TABS: SubNavTab[] = [
  { label: 'Providers', to: ROUTES.SETTINGS_MODELS_PROVIDERS, icon: Server },
  { label: 'Reasoning', to: ROUTES.SETTINGS_MODELS_REASONING, icon: Brain },
  { label: 'Vision', to: ROUTES.SETTINGS_MODELS_VISION, icon: Eye },
  { label: 'Embedding', to: ROUTES.SETTINGS_MODELS_EMBEDDING, icon: FileText },
  { label: 'Audio', to: ROUTES.SETTINGS_MODELS_AUDIO, icon: Mic },
  { label: 'CLIP', to: ROUTES.SETTINGS_MODELS_CLIP, icon: ImageIcon },
  { label: 'PDF', to: ROUTES.SETTINGS_MODELS_PDF, icon: FileType },
]

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function ModelsLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">Models</h2>
        <p className="text-sm text-fg-muted">
          Manage LLM providers and local model downloads
        </p>
      </div>

      {/* Sub-nav */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/40">
        {SUB_NAV_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 font-label text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-fg-muted hover:text-fg hover:border-border',
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </NavLink>
          )
        })}
      </div>

      {/* Outlet for selected model tab */}
      <Outlet />
    </div>
  )
}
