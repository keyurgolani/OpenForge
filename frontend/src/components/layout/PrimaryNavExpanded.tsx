/**
 * PrimaryNavExpanded - Expanded sidebar navigation with full labels
 *
 * Displays the full navigation with labels, sub-navigation for Chat/Runs,
 * and pinned knowledge items.
 */

import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Home,
  MessageSquare,
  Folder,
  Bot,
  Activity,
  FileText,
  Settings,
  Pin,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { ConnectionStatus } from './ConnectionStatus';
import { WorkspaceSwitcher, getWorkspaceIcon, type WorkspaceInfo } from './WorkspaceSwitcher';

interface Conversation {
  id: string;
  title: string | null;
  message_count?: number;
  updated_at?: string;
  last_message_at?: string | null;
}

interface Run {
  id: string;
  workspace_id: string;
  run_type: string;
  status: string;
  started_at?: string | null;
}

interface KnowledgeItem {
  id: string;
  title: string;
  ai_title: string;
  type: string;
  is_pinned: boolean;
}

interface PrimaryNavExpandedProps {
  workspaceId: string;
  workspaces: WorkspaceInfo[];
  currentWorkspace: WorkspaceInfo | undefined;
  isConnected: boolean;
  isAgnosticPage: boolean;
  activePath: string;
  conversations: Conversation[];
  runs: Run[];
  pinnedKnowledge: KnowledgeItem[];
  routes: {
    workspace: string;
    knowledge: string;
    knowledgeItem: (id: string) => string;
    chat: string;
    chatConversation: (id: string) => string;
    agents: string;
    automations: string;
    runs: string;
    outputs: string;
    settings: string;
  };
  onCreateWorkspace?: () => void;
  onRenameConversation?: (id: string, newTitle: string) => Promise<void>;
  onDeleteConversation?: (id: string) => Promise<void>;
  onPermanentDeleteConversation?: (id: string) => Promise<void>;
  className?: string;
}

export function PrimaryNavExpanded({
  workspaceId,
  workspaces,
  currentWorkspace,
  isConnected,
  isAgnosticPage,
  activePath,
  conversations,
  runs,
  pinnedKnowledge,
  routes,
  onCreateWorkspace,
  onRenameConversation,
  onDeleteConversation,
  onPermanentDeleteConversation,
  className,
}: PrimaryNavExpandedProps) {
  const navigate = useNavigate();
  const [chatSublistOpen, setChatSublistOpen] = useState(true);
  const [runsSublistOpen, setRunsSublistOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isActive = (path: string) => activePath.includes(path);

  // Filter recent conversations (last 24 hours)
  const recentConversations = conversations.filter((c) => {
    const ts = c.last_message_at ?? c.updated_at;
    if (!ts) return false;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return new Date(ts).getTime() >= cutoff;
  });

  // Filter ongoing runs
  const ongoingRuns = runs.filter((run) =>
    ['pending', 'queued', 'running', 'waiting_approval', 'interrupted', 'retrying', 'paused'].includes(run.status)
  ).slice(0, 10);

  // Focus rename input when renaming
  useEffect(() => {
    if (!renamingId) return;
    const rafId = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(rafId);
  }, [renamingId]);

  const beginRename = (id: string, currentTitle: string | null) => {
    setRenamingId(id);
    setRenameDraft(currentTitle ?? '');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const commitRename = async () => {
    if (!renamingId || !onRenameConversation) return;
    const currentTitle = recentConversations.find((c) => c.id === renamingId)?.title ?? '';
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === currentTitle) {
      cancelRename();
      return;
    }
    try {
      await onRenameConversation(renamingId, trimmed);
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    } finally {
      cancelRename();
    }
  };

  return (
    <div className={cn('h-full flex flex-col gap-3', className)}>
      {/* Top section: workspace context */}
      <div className={cn(isAgnosticPage ? 'flex-1' : 'h-1/2', 'flex flex-col glass-card overflow-hidden')} style={{ boxShadow: 'none' }}>
        {isAgnosticPage ? (
          <AgnosticWorkspaceList
            workspaces={workspaces}
            onSelect={(id) => navigate(`/w/${id}`)}
          />
        ) : (
          <>
            {/* Workspace switcher */}
            <WorkspaceSwitcher
              currentWorkspaceId={workspaceId}
              workspaces={workspaces}
              isConnected={isConnected}
              onCreateWorkspace={onCreateWorkspace}
            />

            {/* Navigation */}
            <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-3">
              <nav className="flex flex-col flex-1 min-h-0 gap-1">
                <NavItem
                  to={routes.workspace}
                  icon={<Home className="w-4 h-4" />}
                  label="Workspace"
                  isActive={activePath === routes.workspace}
                />
                <NavItem
                  to={routes.knowledge}
                  icon={<Folder className="w-4 h-4" />}
                  label="Knowledge"
                  isActive={activePath === routes.knowledge}
                />

                {/* Chat with expandable recent conversations */}
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="flex items-center">
                    <Link
                      to={routes.chat}
                      className={cn(
                        'sidebar-item flex-1',
                        isActive('/chat') ? 'active' : ''
                      )}
                    >
                      <MessageSquare className="w-4 h-4" /> Chat
                    </Link>
                    {recentConversations.length > 0 && (
                      <button
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
                        onClick={() => setChatSublistOpen((p) => !p)}
                      >
                        {chatSublistOpen ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {chatSublistOpen && recentConversations.length > 0 && (
                    <SubList label="Recent Chats">
                      {recentConversations.map((c) => (
                        <ConversationItem
                          key={c.id}
                          conversation={c}
                          isRenaming={renamingId === c.id}
                          renameDraft={renameDraft}
                          renameInputRef={renameInputRef}
                          isActive={isActive(`/chat/${c.id}`)}
                          to={routes.chatConversation(c.id)}
                          onRename={() => beginRename(c.id, c.title)}
                          onRenameChange={setRenameDraft}
                          onRenameCommit={commitRename}
                          onRenameCancel={cancelRename}
                          onDelete={onDeleteConversation}
                          onPermanentDelete={onPermanentDeleteConversation}
                        />
                      ))}
                    </SubList>
                  )}
                </div>
              </nav>
            </div>

            {/* Pinned knowledge */}
            {pinnedKnowledge.length > 0 && (
              <div className="flex-shrink-0 overflow-y-auto px-3 pb-4 space-y-4 max-h-[30%]">
                <div>
                  <div className="flex items-center gap-1 px-2 mb-1">
                    <Pin className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                      Pinned
                    </span>
                  </div>
                  {pinnedKnowledge.slice(0, 5).map((item) => (
                    <Link
                      key={item.id}
                      to={routes.knowledgeItem(item.id)}
                      className={cn(
                        'sidebar-item text-xs',
                        isActive(`/knowledge/${item.id}`) ? 'active' : ''
                      )}
                    >
                      <KnowledgeTypeIcon type={item.type} />
                      <span className="truncate">{item.title || item.ai_title || 'Untitled'}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom section: global and workspace-scoped navigation */}
      <div className="h-1/2 flex flex-col glass-card overflow-hidden" style={{ boxShadow: 'none' }}>
          <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-2">
            <nav className="flex flex-col flex-1 min-h-0 gap-1">
              <NavItem
                to={routes.agents}
                icon={<Bot className="w-4 h-4" />}
                label="Agents"
                isActive={isActive('/agents')}
              />
              <NavItem
                to={routes.automations}
                icon={<Zap className="w-4 h-4" />}
                label="Automations"
                isActive={isActive('/automations')}
              />

              {/* Runs with expandable active runs */}
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center">
                  <Link
                    to={routes.runs}
                    className={cn(
                      'sidebar-item flex-1',
                      isActive('/runs') ? 'active' : ''
                    )}
                  >
                    <Activity className="w-4 h-4" /> Runs
                  </Link>
                  {ongoingRuns.length > 0 && (
                    <button
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
                      onClick={() => setRunsSublistOpen((p) => !p)}
                    >
                      {runsSublistOpen ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {runsSublistOpen && ongoingRuns.length > 0 && (
                  <SubList label="Active Runs">
                    {ongoingRuns.map((run) => (
                      <Link
                        key={run.id}
                        to={routes.runs}
                        className={cn(
                          'sidebar-item text-xs',
                          isActive('/runs') ? 'active' : ''
                        )}
                      >
                        <Activity className="w-3 h-3" />
                        <span className="truncate">
                          {run.run_type} {run.id.slice(0, 8)}
                        </span>
                        {run.status === 'running' && (
                          <span className="relative flex h-1.5 w-1.5 ml-auto flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                          </span>
                        )}
                        {run.status === 'paused' && (
                          <span className="flex h-1.5 w-1.5 rounded-full bg-amber-400 ml-auto flex-shrink-0" />
                        )}
                      </Link>
                    ))}
                  </SubList>
                )}
              </div>

              <NavItem
                to={routes.outputs}
                icon={<FileText className="w-4 h-4" />}
                label="Outputs"
                isActive={isActive('/outputs')}
              />
            </nav>
          </div>

        {/* Settings */}
        <div className="flex-shrink-0 border-t border-border/60">
          <Link
            to={routes.settings}
            className={cn(
              'flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-card/60',
              isActive('/settings') ? 'bg-card/55' : 'bg-card/45'
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0',
                isActive('/settings')
                  ? 'bg-accent/15 border-accent/30'
                  : 'bg-muted/40 border-border/50'
              )}
            >
              <Settings
                className={cn('w-4 h-4', isActive('/settings') ? 'text-accent' : 'text-muted-foreground')}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm font-semibold truncate',
                  isActive('/settings') ? 'text-accent' : ''
                )}
              >
                Settings
              </p>
              <p className="text-[11px] text-muted-foreground truncate">Providers, tools & more</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

// Helper components

function AgnosticWorkspaceList({
  workspaces,
  onSelect,
}: {
  workspaces: WorkspaceInfo[];
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="flex-shrink-0 border-b border-border/60 bg-card/45 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/12 border border-accent/25 flex items-center justify-center flex-shrink-0">
            <Home className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">Workspaces</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {workspaces.map((workspace) => (
          <Link
            key={workspace.id}
            to={`/w/${workspace.id}`}
            className="sidebar-item text-xs"
          >
            <div className="w-6 h-6 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
              {getWorkspaceIcon(workspace.icon)}
            </div>
            <span className="truncate">{workspace.name}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function NavItem({
  to,
  icon,
  label,
  isActive,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link to={to} className={cn('sidebar-item flex-shrink-0', isActive ? 'active' : '')}>
      {icon} {label}
    </Link>
  );
}

function SubList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ml-3 mt-1 flex items-stretch overflow-hidden flex-1 min-h-0">
      <span
        className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/40 select-none flex-shrink-0 pt-0.5"
        style={{ writingMode: 'vertical-lr' }}
      >
        {label}
      </span>
      <div className="pl-1.5 space-y-0.5 flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}

function ConversationItem({
  conversation,
  isRenaming,
  renameDraft,
  renameInputRef,
  isActive,
  to,
  onRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onPermanentDelete,
}: {
  conversation: Conversation;
  isRenaming: boolean;
  renameDraft: string;
  renameInputRef: React.RefObject<HTMLInputElement>;
  isActive: boolean;
  to: string;
  onRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onDelete?: (id: string) => Promise<void>;
  onPermanentDelete?: (id: string) => Promise<void>;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {isRenaming ? (
          <div className={cn('sidebar-item text-xs', isActive ? 'active' : '')}>
            <MessageSquare className="w-3 h-3" />
            <input
              ref={renameInputRef}
              className="w-full bg-transparent text-xs outline-none border-b border-accent/45"
              value={renameDraft}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={() => onRenameCommit()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onRenameCommit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onRenameCancel();
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : (
          <Link to={to} className={cn('sidebar-item text-xs', isActive ? 'active' : '')}>
            <MessageSquare className="w-3 h-3" />
            <span className="truncate">{conversation.title ?? 'New Chat'}</span>
          </Link>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={(e) => { e.preventDefault(); onRename(); }} className="gap-2">
          <Pencil className="w-4 h-4" /> Rename Chat
        </ContextMenuItem>
        <ContextMenuSeparator />
        {onDelete && (
          <ContextMenuItem
            onSelect={(e) => { e.preventDefault(); onDelete(conversation.id); }}
            className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" /> Move to Trash
          </ContextMenuItem>
        )}
        {onPermanentDelete && (
          <ContextMenuItem
            onSelect={(e) => { e.preventDefault(); onPermanentDelete(conversation.id); }}
            className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" /> Delete Permanently
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function KnowledgeTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'bookmark':
      return <span className="w-3 h-3 flex-shrink-0">🔖</span>;
    case 'gist':
      return <span className="w-3 h-3 flex-shrink-0">💻</span>;
    case 'fleeting':
      return <Zap className="w-3 h-3 flex-shrink-0" />;
    default:
      return <FileText className="w-3 h-3 flex-shrink-0" />;
  }
}

export default PrimaryNavExpanded;
