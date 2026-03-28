import { Link } from 'react-router-dom'
import {
  FolderOpen,
  Cpu,
  Wrench,
  Database,
  Settings2,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/lib/routes'

/* -------------------------------------------------------------------------- */
/* Section tiles                                                              */
/* -------------------------------------------------------------------------- */

interface SectionTile {
  label: string
  description: string
  to: string
  icon: LucideIcon
}

const SECTIONS: SectionTile[] = [
  {
    label: 'Workspaces',
    description: 'Create, edit, merge, and delete workspaces that organize your knowledge and conversations.',
    to: ROUTES.SETTINGS_WORKSPACES,
    icon: FolderOpen,
  },
  {
    label: 'Models',
    description: 'Manage LLM providers, reasoning models, vision, embedding, audio, CLIP, and PDF models.',
    to: ROUTES.SETTINGS_MODELS,
    icon: Cpu,
  },
  {
    label: 'Tools & Connections',
    description: 'Configure tool permissions, MCP servers, and installed skills for your agents.',
    to: ROUTES.SETTINGS_TOOLS,
    icon: Wrench,
  },
  {
    label: 'Data',
    description: 'Import and export data for backups, migration, or analysis.',
    to: ROUTES.SETTINGS_DATA,
    icon: Database,
  },
  {
    label: 'Advanced',
    description: 'Scheduled jobs, audit logs, tool call history, and HITL approval history.',
    to: ROUTES.SETTINGS_ADVANCED,
    icon: Settings2,
  },
]

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function SettingsIndex() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {SECTIONS.map((section) => {
        const Icon = section.icon
        return (
          <Link
            key={section.to}
            to={section.to}
            className={cn(
              'group flex flex-col gap-3 rounded-lg border border-border/40 bg-bg-elevated p-5',
              'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5',
            )}
          >
            <div className="flex items-center justify-between">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  'bg-primary/10 text-primary',
                  'transition-colors group-hover:bg-primary/15',
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <ChevronRight className="h-4 w-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-fg">{section.label}</h3>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">{section.description}</p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
