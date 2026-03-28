import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Tabs from '@radix-ui/react-tabs'
import {
  MessageSquare,
  Bot,
  Send as SendIcon,
  Search,
  Plus,
  Trash2,
  Pencil,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDistanceToNow } from 'date-fns'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ConversationCategory = 'chats' | 'delegated' | 'trash'

export interface ConversationItem {
  id: string
  title?: string
  agentName?: string
  agentIcon?: string
  lastMessage?: string
  updatedAt: string
  category: ConversationCategory
  isDelegated?: boolean
}

interface ConversationListProps {
  conversations: ConversationItem[]
  activeConversationId?: string
  loading?: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, newTitle: string) => void
  onRestore?: (id: string) => void
  onBulkTrash?: (category: ConversationCategory) => void
  onBulkRestore?: () => void
  onBulkPermanentDelete?: () => void
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ConversationList({
  conversations,
  activeConversationId,
  loading = false,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onRestore,
  onBulkTrash,
  onBulkRestore,
  onBulkPermanentDelete,
  className,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ConversationCategory>('chats')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  /* Filtered conversations ------------------------------------------------- */
  const filtered = useMemo(() => {
    let list = conversations.filter((c) => c.category === activeTab)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (c) =>
          (c.title ?? 'New conversation').toLowerCase().includes(q) ||
          c.lastMessage?.toLowerCase().includes(q) ||
          c.agentName?.toLowerCase().includes(q),
      )
    }
    return list.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  }, [conversations, activeTab, searchQuery])

  /* Rename handlers -------------------------------------------------------- */
  function startRename(conv: ConversationItem) {
    setRenamingId(conv.id)
    setRenameValue(conv.title ?? '')
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameValue('')
  }

  /* Trash tab count -------------------------------------------------------- */
  const trashCount = conversations.filter((c) => c.category === 'trash').length

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* New chat button */}
      <div className="shrink-0 p-3 pb-0">
        <button
          type="button"
          onClick={onNew}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5',
            'bg-primary text-fg-on-primary font-label text-sm font-semibold',
            'hover:bg-primary-hover active:bg-primary-600',
            'transition-colors duration-150 focus-ring shadow-sm',
          )}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className={cn(
              'w-full rounded-md border border-border/60 bg-bg-sunken py-1.5 pl-8 pr-3',
              'text-xs text-fg placeholder:text-fg-subtle',
              'outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20',
              'transition-all duration-200 font-body',
            )}
          />
        </div>
      </div>

      {/* Category tabs */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ConversationCategory)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <Tabs.List className="flex shrink-0 border-b border-border/30 px-3 pt-3">
          {(['chats', 'delegated', 'trash'] as const).map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className={cn(
                'relative flex-1 px-1 pb-2 font-label text-xs font-medium capitalize',
                'text-fg-subtle transition-colors duration-150',
                'hover:text-fg-muted',
                'data-[state=active]:text-primary',
              )}
            >
              <span className="flex items-center justify-center gap-1">
                {tab}
                {tab === 'trash' && trashCount > 0 && (
                  <span className="rounded-full bg-danger/10 px-1.5 py-0.5 font-mono text-[9px] text-danger">
                    {trashCount}
                  </span>
                )}
              </span>
              {activeTab === tab && (
                <motion.div
                  layoutId="conversation-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* Bulk actions for trash */}
          {activeTab === 'trash' && trashCount > 0 && (
            <div className="flex items-center gap-2 px-3 pb-2">
              {onBulkRestore && (
                <button
                  type="button"
                  onClick={onBulkRestore}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5',
                    'font-label text-[11px] font-medium border border-border/60',
                    'text-fg-muted hover:bg-bg-sunken transition-colors',
                  )}
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore all
                </button>
              )}
              {onBulkPermanentDelete && (
                <button
                  type="button"
                  onClick={onBulkPermanentDelete}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5',
                    'font-label text-[11px] font-medium border border-danger/30',
                    'text-danger hover:bg-danger/10 transition-colors',
                  )}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete all
                </button>
              )}
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-1 px-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg px-3 py-3">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-bg-sunken" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-bg-sunken" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <MessageSquare className="h-6 w-6 text-fg-subtle" />
              <p className="text-xs text-fg-muted">
                {searchQuery.trim()
                  ? 'No conversations match your search'
                  : activeTab === 'trash'
                    ? 'Trash is empty'
                    : 'No conversations yet'}
              </p>
            </div>
          )}

          {/* Conversation items */}
          <AnimatePresence mode="popLayout">
            {filtered.map((conv) => (
              <ContextMenu.Root key={conv.id}>
                <ContextMenu.Trigger asChild>
                  <motion.button
                    type="button"
                    onClick={() => onSelect(conv.id)}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'group mx-2 flex w-[calc(100%-16px)] items-start gap-2.5 rounded-lg px-3 py-2.5 text-left',
                      'transition-colors duration-150',
                      conv.id === activeConversationId
                        ? 'bg-primary/8 border border-primary/15'
                        : 'hover:bg-fg/[0.03] border border-transparent',
                    )}
                  >
                    {/* Agent icon */}
                    <div
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md mt-0.5',
                        conv.id === activeConversationId
                          ? 'bg-primary/10'
                          : 'bg-bg-sunken',
                      )}
                    >
                      {conv.isDelegated ? (
                        <SendIcon
                          className={cn(
                            'h-3.5 w-3.5',
                            conv.id === activeConversationId
                              ? 'text-primary'
                              : 'text-fg-subtle',
                          )}
                        />
                      ) : (
                        <Bot
                          className={cn(
                            'h-3.5 w-3.5',
                            conv.id === activeConversationId
                              ? 'text-primary'
                              : 'text-fg-subtle',
                          )}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {renamingId === conv.id ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') cancelRename()
                          }}
                          onBlur={commitRename}
                          autoFocus
                          className={cn(
                            'w-full rounded-md border border-primary/50 bg-bg-elevated px-1.5 py-0.5',
                            'text-xs text-fg outline-none focus:ring-1 focus:ring-primary/20',
                            'font-label font-medium',
                          )}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <p
                          className={cn(
                            'truncate font-label text-xs font-medium',
                            conv.id === activeConversationId
                              ? 'text-primary'
                              : 'text-fg',
                          )}
                        >
                          {conv.title || 'New conversation'}
                        </p>
                      )}

                      {conv.lastMessage && (
                        <p className="mt-0.5 truncate text-[11px] leading-snug text-fg-subtle">
                          {conv.lastMessage}
                        </p>
                      )}

                      <div className="mt-1 flex items-center gap-2">
                        {conv.agentName && (
                          <span className="truncate font-label text-[10px] text-fg-subtle">
                            {conv.agentName}
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-fg-subtle">
                          {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                </ContextMenu.Trigger>

                {/* Context menu */}
                <ContextMenu.Portal>
                  <ContextMenu.Content
                    className={cn(
                      'z-50 min-w-[160px] rounded-lg border border-border/60',
                      'bg-bg-overlay p-1 shadow-xl',
                      'animate-scale-in',
                    )}
                  >
                    {activeTab !== 'trash' && (
                      <>
                        <ContextMenu.Item
                          onSelect={() => startRename(conv)}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs',
                            'font-label text-fg-muted cursor-pointer',
                            'hover:bg-fg/5 hover:text-fg outline-none',
                          )}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Rename
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          onSelect={() => onDelete(conv.id)}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs',
                            'font-label text-danger cursor-pointer',
                            'hover:bg-danger/10 outline-none',
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Move to trash
                        </ContextMenu.Item>
                      </>
                    )}
                    {activeTab === 'trash' && (
                      <>
                        {onRestore && (
                          <ContextMenu.Item
                            onSelect={() => onRestore(conv.id)}
                            className={cn(
                              'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs',
                              'font-label text-fg-muted cursor-pointer',
                              'hover:bg-fg/5 hover:text-fg outline-none',
                            )}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </ContextMenu.Item>
                        )}
                        <ContextMenu.Item
                          onSelect={() => onDelete(conv.id)}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs',
                            'font-label text-danger cursor-pointer',
                            'hover:bg-danger/10 outline-none',
                          )}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Delete permanently
                        </ContextMenu.Item>
                      </>
                    )}
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            ))}
          </AnimatePresence>
        </div>
      </Tabs.Root>
    </div>
  )
}
