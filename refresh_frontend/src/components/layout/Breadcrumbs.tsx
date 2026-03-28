import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import type { Workspace } from '@/stores/uiStore'
import { cn } from '@/lib/cn'

/**
 * Readable labels for route segments.
 */
const segmentLabels: Record<string, string> = {
  v2: '',
  w: '',
  knowledge: 'Knowledge',
  search: 'Search',
  chat: 'Chat',
  agents: 'Agents',
  automations: 'Automations',
  deployments: 'Deployments',
  outputs: 'Outputs',
  settings: 'Settings',
  workspaces: 'Workspaces',
  models: 'Models',
  providers: 'Providers',
  reasoning: 'Reasoning',
  vision: 'Vision',
  embedding: 'Embedding',
  audio: 'Audio',
  clip: 'CLIP',
  pdf: 'PDF',
  tools: 'Tools & Connections',
  data: 'Data',
  advanced: 'Advanced',
  new: 'New',
  runs: 'Runs',
}

interface Crumb {
  label: string
  path: string
}

/** Truncate long labels (e.g. UUIDs) */
function truncate(str: string, max: number = 20): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '\u2026'
}

/** Check if a segment looks like a UUID */
function isUuid(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
}

export default function Breadcrumbs() {
  const location = useLocation()
  const workspaces = useUIStore((s) => s.workspaces)

  const crumbs = useMemo<Crumb[]>(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    const result: Crumb[] = []
    let accumulated = ''

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      accumulated += `/${segment}`

      // Skip the "v2" prefix segment
      if (segment === 'v2') continue

      // Skip the "w" segment (workspace prefix indicator)
      if (segment === 'w') continue

      // Resolve workspace IDs to names
      if (i > 0 && segments[i - 1] === 'w') {
        const ws = workspaces.find((w: Workspace) => w.id === segment)
        const label = ws ? ws.name : truncate(segment, 12)
        result.push({ label, path: accumulated })
        continue
      }

      // Known labels
      const known = segmentLabels[segment]
      if (known !== undefined) {
        if (known === '') continue // suppress empty labels
        result.push({ label: known, path: accumulated })
        continue
      }

      // UUID-looking segments get truncated
      if (isUuid(segment)) {
        result.push({ label: truncate(segment, 12), path: accumulated })
        continue
      }

      // Fallback: capitalize
      result.push({
        label: truncate(segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')),
        path: accumulated,
      })
    }

    return result
  }, [location.pathname, workspaces])

  if (crumbs.length === 0) {
    return (
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 font-label text-sm">
        <Home className="h-4 w-4 text-fg-muted" />
        <span className="text-fg-muted">Dashboard</span>
      </nav>
    )
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 font-label text-sm">
      <Link
        to="/v2"
        className="flex items-center text-fg-muted transition-colors duration-150 hover:text-fg"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        return (
          <span key={crumb.path} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-fg-subtle" />
            {isLast ? (
              <span className="font-medium text-fg">{crumb.label}</span>
            ) : (
              <Link
                to={crumb.path}
                className={cn(
                  'text-fg-muted transition-colors duration-150 hover:text-fg',
                  'max-w-[140px] truncate',
                )}
              >
                {crumb.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
