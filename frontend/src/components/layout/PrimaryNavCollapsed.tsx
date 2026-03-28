/**
 * PrimaryNavCollapsed - Collapsed sidebar navigation with icons only
 *
 * Displays navigation icons in a compact format when the sidebar is collapsed.
 */

import { Link } from 'react-router-dom';
import {
  Home,
  MessageSquare,
  Folder,
  Bot,
  FileText,
  Settings,
  Zap,
  Rocket,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectionStatus } from './ConnectionStatus';

interface PrimaryNavCollapsedProps {
  workspaceId: string;
  isConnected: boolean;
  isAgnosticPage: boolean;
  activePath: string;
  routes: {
    workspace: string;
    knowledge: string;
    search: string;
    chat: string;
    agents: string;
    automations: string;
    deployments: string;
    runs: string;
    outputs: string;
    settings: string;
  };
  onExpand?: () => void;
  workspaceIcon?: React.ReactNode;
  className?: string;
}

export function PrimaryNavCollapsed({
  workspaceId,
  isConnected,
  isAgnosticPage,
  activePath,
  routes,
  onExpand,
  workspaceIcon,
  className,
}: PrimaryNavCollapsedProps) {
  const isActive = (path: string) => activePath.includes(path);

  return (
    <div className={cn('flex flex-col h-full gap-3', className)}>
      {/* Top section */}
      <div className={cn(isAgnosticPage ? 'flex-1' : 'h-1/2', 'flex flex-col items-center py-3 gap-1 glass-card')} style={{ boxShadow: 'none' }}>
        {isAgnosticPage ? (
          <button
            type="button"
            onClick={onExpand}
            title="Workspaces"
            className="w-9 h-9 rounded-lg bg-accent/12 border border-accent/25 flex items-center justify-center mb-1 hover:bg-accent/25 transition-colors"
          >
            <Home className="w-4 h-4 text-accent" />
          </button>
        ) : (
          <>
            {/* Workspace icon */}
            <button
              type="button"
              onClick={onExpand}
              title="Open sidebar"
              className="w-9 h-9 rounded-lg bg-accent/12 border border-accent/25 flex items-center justify-center mb-1 hover:bg-accent/25 transition-colors relative"
            >
              {workspaceIcon || <Home className="w-4 h-4 text-accent" />}
              <ConnectionStatus
                isConnected={isConnected}
                className="absolute -top-0.5 -right-0.5 border border-background"
              />
            </button>

            {/* Nav icons */}
            <nav className="flex flex-col gap-1 w-full items-center mt-1">
              <NavIcon
                to={routes.workspace}
                title="Workspace"
                isActive={activePath === routes.workspace}
                icon={<Home className="w-4 h-4" />}
              />
              <NavIcon
                to={routes.knowledge}
                title="Knowledge"
                isActive={activePath === routes.knowledge}
                icon={<Folder className="w-4 h-4" />}
              />
              <NavIcon
                to={routes.search}
                title="Search"
                isActive={activePath.includes('/search')}
                icon={<Search className="w-4 h-4" />}
              />
              <NavIcon
                to={routes.chat}
                title="Chat"
                isActive={isActive('/chat')}
                icon={<MessageSquare className="w-4 h-4" />}
              />
            </nav>
          </>
        )}
      </div>

      {/* Bottom section: global and workspace-scoped */}
      <div className="h-1/2 flex flex-col items-center py-3 gap-1 glass-card" style={{ boxShadow: 'none' }}>
            <NavIcon
              to={routes.agents}
              title="Agents"
              isActive={isActive('/agents')}
              icon={<Bot className="w-4 h-4" />}
            />
            <NavIcon
              to={routes.automations}
              title="Automations"
              isActive={isActive('/automations')}
              icon={<Zap className="w-4 h-4" />}
            />
            <NavIcon
              to={routes.deployments}
              title="Deployments"
              isActive={isActive('/deployments')}
              icon={<Rocket className="w-4 h-4" />}
            />
            <NavIcon
              to={routes.outputs}
              title="Outputs"
              isActive={isActive('/outputs')}
              icon={<FileText className="w-4 h-4" />}
            />

        <div className="flex-1" />

        {/* Settings */}
        <NavIcon
          to={routes.settings}
          title="Settings"
          isActive={isActive('/settings')}
          icon={<Settings className="w-4 h-4" />}
        />
      </div>
    </div>
  );
}

interface NavIconProps {
  to: string;
  title: string;
  isActive: boolean;
  icon: React.ReactNode;
}

function NavIcon({ to, title, isActive, icon }: NavIconProps) {
  return (
    <Link
      to={to}
      title={title}
      className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
        isActive
          ? 'bg-accent/15 text-accent'
          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
      )}
    >
      {icon}
    </Link>
  );
}

export default PrimaryNavCollapsed;
