import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutGrid,
  List,
  Plus,
  Search,
  ChevronDown,
  Pin,
  Archive,
  Pencil,
  Trash2,
  ExternalLink,
  Link as LinkIcon,
  BookOpen,
  SortAsc,
  Upload,
  Filter,
} from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { cn } from '@/lib/cn'
import {
  listKnowledge,
  getWorkspace,
  createKnowledge,
  deleteKnowledge,
  togglePin,
  toggleArchive,
  uploadKnowledge,
} from '@/lib/api'
import { knowledgeRoute } from '@/lib/routes'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmModal from '@/components/shared/ConfirmModal'
import KnowledgeCard from '@/components/knowledge/KnowledgeCard'
import KnowledgeTypeFilter from '@/components/knowledge/KnowledgeTypeFilter'
import type { KnowledgeItem } from '@/components/knowledge/KnowledgeCard'
import type { KnowledgeType } from '@/components/knowledge/KnowledgeTypeFilter'
import { useWorkspaceId } from '@/hooks/useWorkspaceId'

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

type SortOption = 'updated' | 'created' | 'word_count'
type StatusFilter = 'all' | 'pinned' | 'archived'
type ViewMode = 'grid' | 'list'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'created', label: 'Created' },
  { value: 'word_count', label: 'Word Count' },
]

/* -------------------------------------------------------------------------- */
/* Skeleton components                                                        */
/* -------------------------------------------------------------------------- */

function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border/40 bg-bg-elevated p-4">
      <div className="mb-3 h-9 w-9 animate-pulse rounded-lg bg-bg-sunken" />
      <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-bg-sunken" />
      <div className="mb-1 h-3 w-full animate-pulse rounded bg-bg-sunken" />
      <div className="mb-4 h-3 w-2/3 animate-pulse rounded bg-bg-sunken" />
      <div className="flex items-center gap-2 pt-2">
        <div className="h-5 w-14 animate-pulse rounded-full bg-bg-sunken" />
        <div className="ml-auto h-3 w-16 animate-pulse rounded bg-bg-sunken" />
      </div>
    </div>
  )
}

function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="h-9 w-9 animate-pulse rounded-lg bg-bg-sunken" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-48 animate-pulse rounded bg-bg-sunken" />
        <div className="h-3 w-32 animate-pulse rounded bg-bg-sunken" />
      </div>
      <div className="h-5 w-14 animate-pulse rounded-full bg-bg-sunken" />
      <div className="h-3 w-16 animate-pulse rounded bg-bg-sunken" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Context menu wrapper                                                       */
/* -------------------------------------------------------------------------- */

interface CardContextMenuProps {
  item: KnowledgeItem
  workspaceId: string
  children: React.ReactNode
  onPin: () => void
  onArchive: () => void
  onEdit: () => void
  onDelete: () => void
}

function CardContextMenu({
  item,
  workspaceId,
  children,
  onPin,
  onArchive,
  onEdit,
  onDelete,
}: CardContextMenuProps) {
  const handleCopyLink = () => {
    const url = `${window.location.origin}${knowledgeRoute(workspaceId, item.id)}`
    navigator.clipboard.writeText(url).catch(() => {})
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={cn(
            'z-50 min-w-[180px] rounded-lg border border-border/40 bg-bg-elevated p-1 shadow-xl',
            'animate-scale-in',
          )}
        >
          <ContextMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none transition-colors hover:bg-bg-sunken"
            onSelect={onPin}
          >
            <Pin className="h-3.5 w-3.5 text-fg-muted" />
            {item.is_pinned ? 'Unpin' : 'Pin'}
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none transition-colors hover:bg-bg-sunken"
            onSelect={onArchive}
          >
            <Archive className="h-3.5 w-3.5 text-fg-muted" />
            {item.is_archived ? 'Unarchive' : 'Archive'}
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none transition-colors hover:bg-bg-sunken"
            onSelect={onEdit}
          >
            <Pencil className="h-3.5 w-3.5 text-fg-muted" />
            Edit
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none transition-colors hover:bg-bg-sunken"
            onSelect={() => window.open(knowledgeRoute(workspaceId, item.id), '_blank')}
          >
            <ExternalLink className="h-3.5 w-3.5 text-fg-muted" />
            Open in new tab
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none transition-colors hover:bg-bg-sunken"
            onSelect={handleCopyLink}
          >
            <LinkIcon className="h-3.5 w-3.5 text-fg-muted" />
            Copy link
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border/30" />
          <ContextMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-danger outline-none transition-colors hover:bg-danger/5"
            onSelect={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Add Knowledge dropdown                                                     */
/* -------------------------------------------------------------------------- */

interface AddKnowledgeDropdownProps {
  workspaceId: string
}

function AddKnowledgeDropdown({ workspaceId }: AddKnowledgeDropdownProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const createMutation = useMutation({
    mutationFn: (data: { title: string; knowledge_type: string; content?: string }) =>
      createKnowledge(workspaceId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-list', workspaceId] })
      navigate(knowledgeRoute(workspaceId, data.id))
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadKnowledge(workspaceId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-list', workspaceId] })
    },
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      uploadMutation.mutate(files[i])
    }
    setOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
          'font-label text-sm font-medium text-fg-on-primary',
          'transition-colors hover:bg-primary-hover focus-ring',
        )}
      >
        <Plus className="h-4 w-4" />
        Add Knowledge
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute right-0 top-full z-30 mt-1.5 w-48',
              'rounded-lg border border-border/40 bg-bg-elevated p-1 shadow-xl',
            )}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                createMutation.mutate({
                  title: 'Untitled Note',
                  knowledge_type: 'note',
                  content: '',
                })
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-fg transition-colors hover:bg-bg-sunken"
            >
              <BookOpen className="h-3.5 w-3.5 text-fg-muted" />
              New Note
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                createMutation.mutate({
                  title: 'Untitled Fleeting',
                  knowledge_type: 'fleeting',
                  content: '',
                })
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-fg transition-colors hover:bg-bg-sunken"
            >
              <BookOpen className="h-3.5 w-3.5 text-fg-muted" />
              Fleeting Note
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                createMutation.mutate({
                  title: 'Untitled Gist',
                  knowledge_type: 'gist',
                  content: '',
                })
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-fg transition-colors hover:bg-bg-sunken"
            >
              <BookOpen className="h-3.5 w-3.5 text-fg-muted" />
              Code Gist
            </button>
            <div className="my-1 h-px bg-border/30" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-fg transition-colors hover:bg-bg-sunken"
            >
              <Upload className="h-3.5 w-3.5 text-fg-muted" />
              Upload File
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={handleFileUpload}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sort dropdown                                                              */
/* -------------------------------------------------------------------------- */

function SortDropdown({
  value,
  onChange,
}: {
  value: SortOption
  onChange: (v: SortOption) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Sort'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-border/40 px-3 py-2',
          'bg-bg-elevated font-label text-xs font-medium text-fg-muted',
          'transition-colors hover:bg-bg-sunken hover:text-fg focus-ring',
        )}
      >
        <SortAsc className="h-3.5 w-3.5" />
        {label}
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute right-0 top-full z-30 mt-1.5 w-44',
              'rounded-lg border border-border/40 bg-bg-elevated p-1 shadow-xl',
            )}
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center rounded-md px-3 py-2 text-sm transition-colors',
                  value === opt.value
                    ? 'bg-primary/10 text-primary'
                    : 'text-fg hover:bg-bg-sunken',
                )}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

export default function WorkspaceHome() {
  const workspaceId = useWorkspaceId()
  const wid = workspaceId ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  /* -- Local state --------------------------------------------------------- */
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortOption>('updated')
  const [typeFilter, setTypeFilter] = useState<KnowledgeType>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeItem | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

  /* -- Queries ------------------------------------------------------------- */

  const workspaceQuery = useQuery({
    queryKey: ['workspace', wid],
    queryFn: () => getWorkspace(wid),
    enabled: !!wid,
  })

  const knowledgeQuery = useQuery({
    queryKey: ['knowledge-list', wid, typeFilter, sortBy],
    queryFn: () =>
      listKnowledge(wid, {
        knowledge_type: typeFilter === 'all' ? undefined : typeFilter,
        sort_by: sortBy === 'updated' ? 'updated_at' : sortBy === 'created' ? 'created_at' : 'word_count',
        sort_dir: sortBy === 'word_count' ? 'desc' : 'desc',
        limit: 200,
      }),
    enabled: !!wid,
  })

  /* -- Mutations ----------------------------------------------------------- */

  const pinMutation = useMutation({
    mutationFn: (nid: string) => togglePin(wid, nid),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['knowledge-list', wid] }),
  })

  const archiveMutation = useMutation({
    mutationFn: (nid: string) => toggleArchive(wid, nid),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['knowledge-list', wid] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (nid: string) => deleteKnowledge(wid, nid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-list', wid] })
      setDeleteTarget(null)
    },
  })

  /* -- Filtered & sorted data ---------------------------------------------- */

  const items: KnowledgeItem[] = useMemo(() => {
    const raw = knowledgeQuery.data?.knowledge ?? knowledgeQuery.data?.items ?? []
    let filtered = [...raw]

    // Status filter
    if (statusFilter === 'pinned') {
      filtered = filtered.filter((item: KnowledgeItem) => item.is_pinned)
    } else if (statusFilter === 'archived') {
      filtered = filtered.filter((item: KnowledgeItem) => item.is_archived)
    }

    // Search filter
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      filtered = filtered.filter(
        (item: KnowledgeItem) =>
          (item.title?.toLowerCase().includes(q)) ||
          (item.content?.toLowerCase().includes(q)) ||
          (item.tags?.some((t) => t.toLowerCase().includes(q))),
      )
    }

    return filtered
  }, [knowledgeQuery.data, statusFilter, debouncedSearch])

  /* -- Type counts --------------------------------------------------------- */

  const typeCounts = useMemo(() => {
    const allItems = knowledgeQuery.data?.knowledge ?? knowledgeQuery.data?.items ?? []
    const counts: Partial<Record<KnowledgeType, number>> = { all: allItems.length }
    for (const item of allItems) {
      const t = item.knowledge_type?.toLowerCase() as KnowledgeType
      counts[t] = (counts[t] ?? 0) + 1
    }
    return counts
  }, [knowledgeQuery.data])

  /* -- Handlers ------------------------------------------------------------ */

  const handleCardClick = useCallback(
    (item: KnowledgeItem) => {
      navigate(knowledgeRoute(wid, item.id))
    },
    [navigate, wid],
  )

  /* -- Derived values ------------------------------------------------------ */

  const workspaceName = workspaceQuery.data?.name ?? 'Workspace'
  const isLoading = knowledgeQuery.isLoading

  /* -- Render -------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-label text-xs font-medium text-primary">
            <BookOpen className="h-3 w-3" />
            {workspaceName}
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            Knowledge Library
          </h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Knowledge in <span className="font-medium text-fg">{workspaceName}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-border/40 bg-bg-elevated p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                'rounded-md p-1.5 transition-colors focus-ring',
                viewMode === 'grid'
                  ? 'bg-primary text-fg-on-primary'
                  : 'text-fg-muted hover:text-fg',
              )}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'rounded-md p-1.5 transition-colors focus-ring',
                viewMode === 'list'
                  ? 'bg-primary text-fg-on-primary'
                  : 'text-fg-muted hover:text-fg',
              )}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <SortDropdown value={sortBy} onChange={setSortBy} />
          <AddKnowledgeDropdown workspaceId={wid} />
        </div>
      </motion.div>

      {/* Filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-3"
      >
        {/* Type filter */}
        <KnowledgeTypeFilter
          active={typeFilter}
          onChange={setTypeFilter}
          counts={typeCounts}
        />

        {/* Status toggles + search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Status filters */}
          <div className="inline-flex items-center gap-1 rounded-lg bg-bg-sunken p-0.5">
            {(['all', 'pinned', 'archived'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'rounded-md px-3 py-1.5 font-label text-xs font-medium transition-colors focus-ring',
                  statusFilter === s
                    ? 'bg-bg-elevated text-fg shadow-sm'
                    : 'text-fg-muted hover:text-fg',
                )}
              >
                {s === 'all' ? 'All' : s === 'pinned' ? 'Pinned' : 'Archived'}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter knowledge..."
              className={cn(
                'w-full rounded-lg border border-border/40 bg-bg-elevated py-2 pl-9 pr-3',
                'font-body text-sm text-fg placeholder:text-fg-subtle',
                'transition-colors outline-none',
                'focus:border-primary/50',
              )}
            />
          </div>
        </div>
      </motion.div>

      {/* Content area */}
      <div>
        {isLoading ? (
          /* Skeleton loading */
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <ListRowSkeleton key={i} />
              ))}
            </div>
          )
        ) : items.length === 0 ? (
          /* Empty state */
          <EmptyState
            icon={BookOpen}
            title={
              debouncedSearch
                ? 'No matching knowledge'
                : typeFilter !== 'all'
                  ? `No ${typeFilter} items`
                  : 'Your knowledge library is empty'
            }
            description={
              debouncedSearch
                ? 'Try a different search term or clear your filters.'
                : 'Add notes, bookmarks, files, and more to build your workspace knowledge base.'
            }
            action={
              !debouncedSearch && (
                <AddKnowledgeDropdown workspaceId={wid} />
              )
            }
          />
        ) : viewMode === 'grid' ? (
          /* Grid view */
          <div
            className="grid grid-cols-1 gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            <AnimatePresence mode="popLayout">
              {items.map((item, idx) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    duration: 0.3,
                    delay: Math.min(idx * 0.03, 0.3),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <CardContextMenu
                    item={item}
                    workspaceId={wid}
                    onPin={() => pinMutation.mutate(item.id)}
                    onArchive={() => archiveMutation.mutate(item.id)}
                    onEdit={() => navigate(knowledgeRoute(wid, item.id))}
                    onDelete={() => setDeleteTarget(item)}
                  >
                    <div>
                      <KnowledgeCard
                        item={item}
                        view="grid"
                        onClick={() => handleCardClick(item)}
                      />
                    </div>
                  </CardContextMenu>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          /* List view */
          <div className="divide-y divide-border/20 rounded-lg border border-border/40 bg-bg-elevated">
            <AnimatePresence mode="popLayout">
              {items.map((item, idx) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{
                    duration: 0.25,
                    delay: Math.min(idx * 0.02, 0.2),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <CardContextMenu
                    item={item}
                    workspaceId={wid}
                    onPin={() => pinMutation.mutate(item.id)}
                    onArchive={() => archiveMutation.mutate(item.id)}
                    onEdit={() => navigate(knowledgeRoute(wid, item.id))}
                    onDelete={() => setDeleteTarget(item)}
                  >
                    <div>
                      <KnowledgeCard
                        item={item}
                        view="list"
                        onClick={() => handleCardClick(item)}
                      />
                    </div>
                  </CardContextMenu>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete knowledge item"
        description={`Are you sure you want to delete "${deleteTarget?.title ?? 'this item'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
      />
    </div>
  )
}
