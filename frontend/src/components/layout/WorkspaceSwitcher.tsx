/**
 * WorkspaceSwitcher - Workspace selector dropdown
 *
 * Displays the current workspace and allows switching between workspaces.
 * Shows connection status and provides quick access to workspace creation.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, ChevronDown, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WorkspaceInfo {
  id: string;
  name: string;
  icon: string | null;
  color?: string;
}

interface WorkspaceSwitcherProps {
  currentWorkspaceId: string | undefined;
  workspaces: WorkspaceInfo[];
  isConnected: boolean;
  className?: string;
  onCreateWorkspace?: () => void;
}

export function WorkspaceSwitcher({
  currentWorkspaceId,
  workspaces,
  isConnected,
  className,
  onCreateWorkspace,
}: WorkspaceSwitcherProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);

  const filteredWorkspaces = useMemo(() => {
    const searchQuery = query.trim().toLowerCase();
    if (!searchQuery) return workspaces;
    return workspaces.filter((w) => w.name.toLowerCase().includes(searchQuery));
  }, [workspaces, query]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  // Reset state when workspace changes
  useEffect(() => {
    setMenuOpen(false);
    setQuery('');
  }, [currentWorkspaceId]);

  const handleWorkspaceSelect = (workspaceId: string) => {
    setMenuOpen(false);
    setQuery('');
    if (workspaceId !== currentWorkspaceId) {
      // Preserve the current sub-path when switching workspaces
      const prefix = `/w/${currentWorkspaceId}`;
      const subPath = location.pathname.startsWith(prefix)
        ? location.pathname.slice(prefix.length)
        : '';
      // Drop workspace-specific IDs
      const keepPath = subPath.startsWith('/chat/')
        ? '/chat'
        : subPath.startsWith('/knowledge/')
        ? '/knowledge'
        : subPath;
      navigate(`/w/${workspaceId}${keepPath}`);
    }
  };

  const handleCreateWorkspace = () => {
    setMenuOpen(false);
    setQuery('');
    if (onCreateWorkspace) {
      onCreateWorkspace();
    } else {
      navigate('/settings?tab=workspaces&newWorkspace=1');
    }
  };

  return (
    <div ref={menuRef} className={cn('relative z-[180]', className)}>
      <button
        type="button"
        className="w-full border-b border-border/60 bg-card/45 px-4 py-3 text-left transition-colors hover:bg-card/60"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-expanded={menuOpen}
        aria-label="Choose workspace"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/12 border border-accent/25 flex items-center justify-center flex-shrink-0">
            {currentWorkspace ? (
              getWorkspaceIcon(currentWorkspace.icon)
            ) : (
              <Home className="w-4 h-4 text-accent" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {currentWorkspace?.name ?? 'Select workspace'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2 pl-1">
            <span
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                isConnected ? 'bg-emerald-400' : 'bg-amber-400'
              )}
              title={isConnected ? 'Connected' : 'Reconnecting…'}
            />
            <ChevronDown
              className={cn(
                'w-4 h-4 text-muted-foreground transition-transform',
                menuOpen && 'rotate-180'
              )}
            />
          </div>
        </div>
      </button>

      {menuOpen && (
        <div className="absolute top-full left-2 right-2 mt-2 z-[180] glass-card p-2 rounded-xl">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              className="input h-8 pl-8 text-xs"
              placeholder="Search workspace..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
            {filteredWorkspaces.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">No workspaces found.</p>
            ) : (
              filteredWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  className={cn(
                    'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                    workspace.id === currentWorkspaceId
                      ? 'bg-accent/14 border border-accent/35'
                      : 'hover:bg-muted/45 border border-transparent'
                  )}
                  onClick={() => handleWorkspaceSelect(workspace.id)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                      {getWorkspaceIcon(workspace.icon)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{workspace.name}</p>
                    </div>
                    {workspace.id === currentWorkspaceId && (
                      <span className="chip-accent text-[10px]">Current</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="mt-2 border-t border-border/60 pt-2">
            <button
              type="button"
              className="w-full rounded-lg border border-transparent px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-muted/45 hover:border-border/60"
              onClick={handleCreateWorkspace}
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" />
                Add Workspace
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Get icon component for workspace icon type
 */
export function getWorkspaceIcon(icon: string | null): React.ReactNode {
  switch (icon) {
    case 'home':
      return <Home className="w-4 h-4 text-accent" />;
    case 'briefcase':
      return <span className="text-sm">💼</span>;
    case 'rocket':
      return <span className="text-sm">🚀</span>;
    case 'lightbulb':
      return <span className="text-sm">💡</span>;
    case 'code':
      return <span className="text-sm">💻</span>;
    case 'folder':
      return <span className="text-sm">📁</span>;
    default:
      return <Home className="w-4 h-4 text-accent" />;
  }
}

export default WorkspaceSwitcher;
