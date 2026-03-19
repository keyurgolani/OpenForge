/**
 * Settings Index - Redirect handler
 *
 * Redirects /settings to the default settings page (workspaces).
 */

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

function resolveLegacySettingsRoute(searchParams: URLSearchParams): string {
  const tab = searchParams.get('tab');
  const newWorkspace = searchParams.get('newWorkspace') === '1';

  const tabToRoute: Record<string, string> = {
    workspaces: '/settings/workspaces',
    llm: '/settings/models/providers',
    jobs: '/settings/pipelines',
    tools: '/settings/tools',
    skills: '/settings/skills',
    mcp: '/settings/mcp',
    audit: '/settings/audit',
    export: '/settings/export',
    import: '/settings/import',
  };

  const route = tab ? tabToRoute[tab] : null;
  if (route) {
    if (route === '/settings/workspaces' && newWorkspace) {
      return `${route}?newWorkspace=1`;
    }
    return route;
  }

  if (newWorkspace) {
    return '/settings/workspaces?newWorkspace=1';
  }

  return '/settings/workspaces';
}

export function SettingsIndex() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    navigate(resolveLegacySettingsRoute(searchParams), { replace: true });
  }, [navigate, searchParams]);

  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default SettingsIndex;
