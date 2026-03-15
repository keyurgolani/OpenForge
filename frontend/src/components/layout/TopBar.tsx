/**
 * TopBar - Top navigation bar with global actions
 *
 * Displays the current section title, sidebar toggle, command palette,
 * new knowledge button, approval notifications, and theme toggle.
 */

import { PanelLeft, Plus, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface TopBarProps {
  title: string;
  description?: string;
  isConnected?: boolean;
  isAgnosticPage?: boolean;
  shortcutDisplay?: {
    commandPalette?: string;
    toggleSidebar?: string;
    newKnowledge?: string;
  };
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  onNewKnowledge?: () => void;
  /** Additional actions rendered in the actions area */
  actions?: ReactNode;
  /** Notification badge content (e.g., pending approvals) */
  notificationBadge?: ReactNode;
  /** Theme toggle component */
  themeToggle?: ReactNode;
  className?: string;
}

export function TopBar({
  title,
  description,
  isConnected = true,
  isAgnosticPage = false,
  shortcutDisplay = {},
  onToggleSidebar,
  onOpenCommandPalette,
  onNewKnowledge,
  actions,
  notificationBadge,
  themeToggle,
  className,
}: TopBarProps) {
  const { commandPalette = '⌘K', toggleSidebar = '⌘B', newKnowledge = '⌘N' } = shortcutDisplay;

  return (
    <header
      className={cn(
        'relative z-40 flex items-center gap-3 px-5 py-3',
        'border-b border-border/60 bg-card/40 backdrop-blur-md',
        'flex-shrink-0',
        className
      )}
    >
      {/* Sidebar toggle */}
      <button
        className="btn-ghost p-2 -ml-1 border border-border/60 bg-card/35"
        onClick={onToggleSidebar}
        title={`Toggle sidebar (${toggleSidebar})`}
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="w-4 h-4" />
      </button>

      {/* Section title */}
      <div className="min-w-0 max-w-[min(56vw,720px)] flex flex-col leading-tight">
        <p className="text-sm font-semibold truncate">{title}</p>
        {description && (
          <p className="hidden sm:block text-xs text-muted-foreground/90 truncate">
            {description}
          </p>
        )}
      </div>

      <div className="flex-1" />

      {/* Connection status indicator */}
      {!isAgnosticPage && !isConnected && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 glass-card px-3 py-1.5 animate-pulse">
          <WifiOff className="w-3 h-3" /> Reconnecting…
        </div>
      )}

      {/* Command palette button */}
      {onOpenCommandPalette && (
        <button
          className="btn-ghost p-2 text-xs gap-1.5 hidden sm:flex items-center border border-border/60 bg-card/35"
          onClick={onOpenCommandPalette}
          title={`Command palette (${commandPalette})`}
          aria-label="Open command palette"
        >
          <span className="text-muted-foreground font-mono">{commandPalette}</span>
        </button>
      )}

      {/* New knowledge button - only for workspace pages */}
      {!isAgnosticPage && onNewKnowledge && (
        <button
          className="bg-accent text-accent-foreground hover:bg-accent/90 px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
          onClick={onNewKnowledge}
          title={`New knowledge (${newKnowledge})`}
        >
          <Plus className="w-3.5 h-3.5" /> New Knowledge
        </button>
      )}

      {/* Additional actions */}
      {actions}

      {/* Notification badge (e.g., pending approvals) */}
      {notificationBadge}

      {/* Theme toggle */}
      {themeToggle}
    </header>
  );
}

export default TopBar;
