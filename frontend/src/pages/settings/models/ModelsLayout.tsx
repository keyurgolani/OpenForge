/**
 * ModelsLayout - Layout for AI Models settings
 *
 * Provides horizontal tab navigation for different model types, organized
 * into logical groups matching the pattern used by other settings pages.
 */

import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SETTINGS_MODEL_LABELS, type SettingsModelSubsection } from '@/lib/productVocabulary';

interface ModelTab {
  id: SettingsModelSubsection;
  route: string;
}

const MODEL_TABS: ModelTab[] = [
  { id: 'providers', route: '/settings/models/providers' },
  { id: 'reasoning', route: '/settings/models/reasoning' },
  { id: 'vision', route: '/settings/models/vision' },
  { id: 'embedding', route: '/settings/models/embedding' },
  { id: 'audio', route: '/settings/models/audio' },
  { id: 'clip', route: '/settings/models/clip' },
  { id: 'pdf', route: '/settings/models/pdf' },
];

export function ModelsLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (route: string) => location.pathname === route || location.pathname.startsWith(route + '/');

  return (
    <div className="p-6 space-y-6">
      <div className="flex gap-1 border-b border-border/25">
        {MODEL_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.route)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              isActive(tab.route)
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {SETTINGS_MODEL_LABELS[tab.id]}
          </button>
        ))}
      </div>
      <Outlet />
    </div>
  );
}

export default ModelsLayout;
