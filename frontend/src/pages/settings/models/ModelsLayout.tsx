/**
 * ModelsLayout - Layout for AI Models settings
 *
 * Provides sub-navigation for different model types, organized into
 * logical groups: Text, Image, and Audio.
 */

import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Bot, Eye, Grid3X3, Music, Image, FileText } from 'lucide-react';
import { SETTINGS_MODEL_LABELS, type SettingsModelSubsection } from '@/lib/productVocabulary';

interface ModelNavItem {
  id: SettingsModelSubsection;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ModelNavGroup {
  label: string | null;
  items: ModelNavItem[];
}

const MODEL_NAV_GROUPS: ModelNavGroup[] = [
  {
    label: null,
    items: [
      { id: 'providers', route: '/settings/models/providers', icon: Bot },
    ],
  },
  {
    label: 'Text',
    items: [
      { id: 'reasoning', route: '/settings/models/reasoning', icon: Bot },
      { id: 'embedding', route: '/settings/models/embedding', icon: Grid3X3 },
      { id: 'pdf', route: '/settings/models/pdf', icon: FileText },
    ],
  },
  {
    label: 'Image',
    items: [
      { id: 'vision', route: '/settings/models/vision', icon: Eye },
      { id: 'clip', route: '/settings/models/clip', icon: Image },
    ],
  },
  {
    label: 'Audio',
    items: [
      { id: 'audio', route: '/settings/models/audio', icon: Music },
    ],
  },
];

export function ModelsLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (route: string) => location.pathname === route || location.pathname.startsWith(route + '/');

  return (
    <div className="flex h-full gap-4">
      {/* Sub-navigation */}
      <nav className="w-48 flex-shrink-0 overflow-y-auto pr-2">
        <div className="space-y-1">
          {MODEL_NAV_GROUPS.map((group, gi) => (
            <div key={group.label ?? 'ungrouped'}>
              {group.label && (
                <div className={cn('flex items-center gap-2 px-3 py-1.5', gi > 0 && 'mt-3')}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border/30" />
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.route);

                return (
                  <button
                    key={item.id}
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
                      {SETTINGS_MODEL_LABELS[item.id]}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default ModelsLayout;
