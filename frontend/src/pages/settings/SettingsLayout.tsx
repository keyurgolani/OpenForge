/**
 * SettingsLayout - Shell with horizontal tab navigation
 *
 * Provides the layout for settings pages with a horizontal tab bar
 * and main content area below.
 */

import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  FolderOpen,
  Bot,
  Wrench,
  ArrowUpDown,
  Palette,
  Settings2,
} from 'lucide-react';
import { SETTINGS_LABELS, type SettingsSection } from '@/lib/productVocabulary';

interface SettingsNavItem {
  id: SettingsSection;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
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
    id: 'capabilities',
    route: '/settings/capabilities',
    icon: Wrench,
  },
  {
    id: 'data',
    route: '/settings/data',
    icon: ArrowUpDown,
  },
  {
    id: 'appearance',
    route: '/settings/appearance',
    icon: Palette,
  },
  {
    id: 'advanced',
    route: '/settings/advanced',
    icon: Settings2,
  },
];

export function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (route: string) =>
    location.pathname === route || location.pathname.startsWith(route + '/');

  return (
    <div className="flex flex-col h-full">
      {/* Horizontal tab bar */}
      <nav className="flex-shrink-0 px-6 pt-4 pb-2">
        <div className="glass-card rounded-2xl p-1.5 flex gap-1 w-fit">
          {SETTINGS_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.route);

            return (
              <button
                key={item.id}
                onClick={() => navigate(item.route)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300 whitespace-nowrap rounded-xl',
                  active
                    ? 'bg-accent/25 text-accent shadow-glass-inset ring-1 ring-accent/30'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{SETTINGS_LABELS[item.id]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default SettingsLayout;
