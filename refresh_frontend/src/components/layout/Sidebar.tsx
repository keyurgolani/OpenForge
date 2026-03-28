import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  Search,
  Bot,
  Workflow,
  Rocket,
  FileOutput,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import ROUTES, {
  dashboardRoute,
  knowledgeRoute,
  searchRoute,
  globalChatRoute,
} from '@/lib/routes'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Navigation definition                                                      */
/* -------------------------------------------------------------------------- */

interface NavItem {
  label: string
  icon: LucideIcon
  path: string | ((workspaceId: string) => string)
  /** Whether this item requires a workspace context */
  workspaceScoped?: boolean
}

interface NavGroup {
  title?: string
  /** If true, the group title includes the workspace name */
  workspaceTitle?: boolean
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: (wsId: string) => dashboardRoute(wsId) },
      { label: 'Chat', icon: MessageSquare, path: globalChatRoute() },
    ],
  },
  {
    workspaceTitle: true,
    items: [
      { label: 'Knowledge', icon: BookOpen, path: (wsId: string) => knowledgeRoute(wsId), workspaceScoped: true },
      { label: 'Search', icon: Search, path: (wsId: string) => searchRoute(wsId), workspaceScoped: true },
    ],
  },
  {
    title: 'Build',
    items: [
      { label: 'Agents', icon: Bot, path: ROUTES.AGENTS },
      { label: 'Automations', icon: Workflow, path: ROUTES.AUTOMATIONS },
      { label: 'Deployments', icon: Rocket, path: ROUTES.DEPLOYMENTS },
      { label: 'Outputs', icon: FileOutput, path: ROUTES.OUTPUTS },
    ],
  },
]

const bottomItems: NavItem[] = [
  { label: 'Settings', icon: Settings, path: ROUTES.SETTINGS },
]

/* -------------------------------------------------------------------------- */
/* Sidebar widths & animation                                                 */
/* -------------------------------------------------------------------------- */

const EXPANDED_WIDTH = 256
const COLLAPSED_WIDTH = 64

const sidebarVariants = {
  expanded: { width: EXPANDED_WIDTH },
  collapsed: { width: COLLAPSED_WIDTH },
}

/* -------------------------------------------------------------------------- */
/* Brand mark (anvil-inspired)                                                */
/* -------------------------------------------------------------------------- */

function BrandMark({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to="/v2"
      className="group flex items-center gap-2.5 px-3 py-1"
      aria-label="OpenForge home"
    >
      {/* Custom anvil/forge SVG icon */}
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7"
          aria-hidden="true"
        >
          {/* Anvil body */}
          <path
            d="M6 20h20v3c0 1.5-1 3-3 3H9c-2 0-3-1.5-3-3v-3z"
            className="fill-primary"
          />
          {/* Anvil horn */}
          <path
            d="M4 20h2v-2c0-1 .5-2 2-2h16c1.5 0 2 1 2 2v2h2c1 0 1 1 0 1H4c-1 0-1-1 0-1z"
            className="fill-primary/80"
          />
          {/* Hammer */}
          <path
            d="M15 6h2v10h-2z"
            className="fill-fg-muted"
          />
          <rect
            x="11"
            y="4"
            width="10"
            height="4"
            rx="1"
            className="fill-primary-600"
          />
          {/* Spark accents */}
          <circle cx="10" cy="14" r="1" className="fill-primary-300 opacity-80" />
          <circle cx="22" cy="12" r="0.8" className="fill-primary-300 opacity-60" />
          <circle cx="8" cy="11" r="0.6" className="fill-primary-200 opacity-70" />
        </svg>
      </div>
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="font-display text-lg font-semibold tracking-tight text-fg"
          >
            Open<span className="text-primary">Forge</span>
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  )
}

/* -------------------------------------------------------------------------- */
/* NavLink with tooltip for collapsed mode                                    */
/* -------------------------------------------------------------------------- */

interface NavLinkProps {
  item: NavItem
  collapsed: boolean
  active: boolean
  resolvedPath: string
}

function NavLink({ item, collapsed, active, resolvedPath }: NavLinkProps) {
  const Icon = item.icon

  const linkContent = (
    <Link
      to={resolvedPath}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium',
        'transition-all duration-200',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-fg-muted hover:bg-fg/5 hover:text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      {/* Active indicator bar */}
      {active && (
        <motion.div
          layoutId="sidebar-active-indicator"
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors duration-200',
          active ? 'text-primary' : 'text-fg-muted group-hover:text-fg',
        )}
      />
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15 }}
            className="truncate whitespace-nowrap"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{linkContent}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={10}
            className="z-50 rounded-md bg-bg-overlay px-2.5 py-1.5 font-label text-xs font-medium text-fg shadow-lg border border-border/40 animate-scale-in"
          >
            {item.label}
            <Tooltip.Arrow className="fill-bg-overlay" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    )
  }

  return linkContent
}

/* -------------------------------------------------------------------------- */
/* Sidebar component                                                          */
/* -------------------------------------------------------------------------- */

export default function Sidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId)
  const workspaces = useUIStore((s) => s.workspaces)
  const location = useLocation()

  const collapsed = !sidebarOpen

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId),
    [workspaces, activeWorkspaceId],
  )

  /** Resolve a path that may be workspace-scoped */
  function resolvePath(item: NavItem): string {
    if (typeof item.path === 'function') {
      return item.path(activeWorkspaceId ?? '')
    }
    return item.path
  }

  /** Check if a nav item is active based on current location */
  function isActive(item: NavItem): boolean {
    const resolved = resolvePath(item)
    if (!resolved) return false
    // Exact match for dashboard, prefix match for others
    if (item.label === 'Dashboard') {
      return location.pathname === resolved
    }
    return location.pathname.startsWith(resolved)
  }

  return (
    <Tooltip.Provider delayDuration={300}>
      <motion.aside
        initial={false}
        animate={collapsed ? 'collapsed' : 'expanded'}
        variants={sidebarVariants}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          'flex h-full shrink-0 flex-col border-r border-border/40 bg-bg-elevated',
          'overflow-hidden',
        )}
      >
        {/* Brand */}
        <div className="flex h-14 items-center border-b border-border/20 px-2.5">
          <BrandMark collapsed={collapsed} />
        </div>

        {/* Workspace switcher */}
        <div className={cn('px-2.5 pt-3 pb-1', collapsed && 'px-1.5')}>
          <WorkspaceSwitcher collapsed={collapsed} />
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-2" role="navigation">
          {navGroups.map((group, gi) => (
            <div key={gi} className={cn(gi > 0 && 'mt-3')}>
              {/* Group header */}
              {(group.title || group.workspaceTitle) && !collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-1.5 px-2.5"
                >
                  <span className="font-label text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                    {group.workspaceTitle
                      ? `Workspace${activeWorkspace ? `: ${activeWorkspace.name}` : ''}`
                      : group.title}
                  </span>
                </motion.div>
              )}
              {collapsed && gi > 0 && (
                <div className="mx-3 mb-2 border-t border-border/20" />
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const resolved = resolvePath(item)
                  // Don't render workspace-scoped items if no workspace selected
                  if (item.workspaceScoped && !activeWorkspaceId) return null

                  return (
                    <NavLink
                      key={item.label}
                      item={item}
                      collapsed={collapsed}
                      active={isActive(item)}
                      resolvedPath={resolved}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col gap-0.5 border-t border-border/20 px-2.5 py-2">
          {bottomItems.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              collapsed={collapsed}
              active={isActive(item)}
              resolvedPath={resolvePath(item)}
            />
          ))}

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium',
              'text-fg-muted transition-colors duration-200 hover:bg-fg/5 hover:text-fg',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft className="h-[18px] w-[18px]" />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px]" />
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="truncate"
                >
                  Collapse
                </motion.span>
              </>
            )}
          </button>
        </div>
      </motion.aside>
    </Tooltip.Provider>
  )
}
