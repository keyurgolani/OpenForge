/**
 * SettingsLayout - Shell with subsection navigation
 *
 * Provides the layout for settings pages with a left navigation sidebar
 * and main content area.
 */

import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  FolderOpen,
  Bot,
  Sliders,
  Settings2,
  Hammer,
  ShieldAlert,
  Timer,
  Wrench,
  Layers,
  History,
  Upload,
  Download,
  Package,
} from 'lucide-react';
import { SETTINGS_LABELS, SETTINGS_DESCRIPTIONS, type SettingsSection } from '@/lib/productVocabulary';

interface SettingsNavItem {
  id: SettingsSection;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { id: string; route: string; label: string }[];
}

const SETTINGS_NAV: SettingsNavItem[] = [
  {
    id: 'workspaces',
    route: '/settings/workspaces',
    icon: FolderOpen,
  },
  {
    id: 'models',
    route: '/settings/models',
    icon: Bot,
  },
  {
    id: 'prompts',
    route: '/settings/prompts',
    icon: Sliders,
  },
  {
    id: 'policies',
    route: '/settings/policies',
    icon: Settings2,
  },
  {
    id: 'tools',
    route: '/settings/tools',
    icon: Hammer,
  },
  {
    id: 'bundles',
    route: '/settings/bundles',
    icon: Package,
  },
  {
    id: 'approvals',
    route: '/settings/approvals',
    icon: ShieldAlert,
  },
  {
    id: 'pipelines',
    route: '/settings/pipelines',
    icon: Timer,
  },
  {
    id: 'skills',
    route: '/settings/skills',
    icon: Wrench,
  },
  {
    id: 'mcp',
    route: '/settings/mcp',
    icon: Layers,
  },
  {
    id: 'audit',
    route: '/settings/audit',
    icon: History,
  },
  {
    id: 'import',
    route: '/settings/import',
    icon: Upload,
  },
  {
    id: 'export',
    route: '/settings/export',
    icon: Download,
  },
];

export function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (route: string) => location.pathname === route || location.pathname.startsWith(route + '/');
  const isChildActive = (parent: SettingsNavItem) => {
    if (isActive(parent.route)) return true;
    if (parent.children) {
      return parent.children.some((child) => isActive(child.route));
    }
    return false;
  };

  return (
    <div className="flex h-full gap-4">
      {/* Left navigation */}
      <nav className="w-56 flex-shrink-0 overflow-y-auto pr-2">
        <div className="space-y-1">
          {SETTINGS_NAV.map((item) => {
            const Icon = item.icon;
            const active = isChildActive(item);
            const hasChildren = item.children && item.children.length > 0;

            return (
              <div key={item.id}>
                <button
                  onClick={() => navigate(item.route)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors',
                    active
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {SETTINGS_LABELS[item.id]}
                  </span>
                </button>

                {/* Sub-navigation */}
                {hasChildren && active && (
                  <div className="ml-4 mt-1 space-y-0.5 border-l border-border/40 pl-3">
                    {item.children!.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => navigate(child.route)}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors text-xs',
                          isActive(child.route)
                            ? 'bg-accent/10 text-accent'
                            : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                        )}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default SettingsLayout;
