import { memo, type CSSProperties } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  FileText,
  Bookmark,
  Code,
  Image,
  Music,
  Pin,
  Zap,
  FileSpreadsheet,
  Presentation,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface KnowledgeItem {
  id: string
  title: string
  content?: string | null
  knowledge_type: string
  tags?: string[] | null
  is_pinned?: boolean
  is_archived?: boolean
  source_url?: string | null
  word_count?: number | null
  created_at?: string | null
  updated_at?: string | null
}

interface KnowledgeCardProps {
  item: KnowledgeItem
  view?: 'grid' | 'list'
  onClick?: () => void
}

/* -------------------------------------------------------------------------- */
/* Type config                                                                */
/* -------------------------------------------------------------------------- */

interface TypeConfig {
  icon: LucideIcon
  label: string
  color: string
  bg: string
  dotColor: string
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  note: {
    icon: FileText,
    label: 'Note',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.08)',
    dotColor: '#3b82f6',
  },
  fleeting: {
    icon: Zap,
    label: 'Fleeting',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.08)',
    dotColor: '#f97316',
  },
  bookmark: {
    icon: Bookmark,
    label: 'Bookmark',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.08)',
    dotColor: '#22c55e',
  },
  gist: {
    icon: Code,
    label: 'Gist',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.08)',
    dotColor: '#a855f7',
  },
  image: {
    icon: Image,
    label: 'Image',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.08)',
    dotColor: '#ec4899',
  },
  audio: {
    icon: Music,
    label: 'Audio',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.08)',
    dotColor: '#f59e0b',
  },
  pdf: {
    icon: FileText,
    label: 'PDF',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.08)',
    dotColor: '#ef4444',
  },
  document: {
    icon: FileText,
    label: 'Document',
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.08)',
    dotColor: '#6366f1',
  },
  sheet: {
    icon: FileSpreadsheet,
    label: 'Sheet',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.08)',
    dotColor: '#10b981',
  },
  slide: {
    icon: Presentation,
    label: 'Slides',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.08)',
    dotColor: '#f59e0b',
  },
}

const DEFAULT_TYPE_CONFIG: TypeConfig = {
  icon: FileText,
  label: 'Item',
  color: 'rgb(var(--fg-muted))',
  bg: 'rgb(var(--bg-sunken))',
  dotColor: 'rgb(var(--fg-subtle))',
}

export function getTypeConfig(type: string | undefined | null): TypeConfig {
  if (!type) return DEFAULT_TYPE_CONFIG
  return TYPE_CONFIG[type.toLowerCase()] ?? DEFAULT_TYPE_CONFIG
}

/* -------------------------------------------------------------------------- */
/* Grid card                                                                  */
/* -------------------------------------------------------------------------- */

function GridCard({ item, onClick }: { item: KnowledgeItem; onClick?: () => void }) {
  const cfg = getTypeConfig(item.knowledge_type)
  const Icon = cfg.icon
  const tags = item.tags ?? []
  const visibleTags = tags.slice(0, 3)
  const extraTagCount = Math.max(0, tags.length - 3)

  const relativeTime = item.updated_at
    ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
    : item.created_at
      ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true })
      : null

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full flex-col rounded-lg border border-border/40',
        'bg-bg-elevated p-4 text-left',
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5',
        'hover:border-border/60',
        'cursor-pointer focus-ring',
      )}
    >
      {/* Pinned indicator */}
      {item.is_pinned && (
        <div className="absolute right-3 top-3">
          <Pin className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
        </div>
      )}

      {/* Type icon */}
      <div
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: cfg.bg } as CSSProperties}
      >
        <Icon className="h-4.5 w-4.5" style={{ color: cfg.color }} strokeWidth={1.75} />
      </div>

      {/* Title */}
      <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-fg">
        {item.title || 'Untitled'}
      </h3>

      {/* Content preview */}
      {item.content && (
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-fg-muted">
          {item.content}
        </p>
      )}

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-bg-sunken px-2 py-0.5 font-label text-[10px] font-medium text-fg-muted"
            >
              {tag}
            </span>
          ))}
          {extraTagCount > 0 && (
            <span className="rounded-full bg-bg-sunken px-2 py-0.5 font-label text-[10px] font-medium text-fg-subtle">
              +{extraTagCount}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center gap-2 pt-4">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-label text-[10px] font-medium"
          style={{
            backgroundColor: cfg.bg,
            color: cfg.color,
          } as CSSProperties}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: cfg.dotColor } as CSSProperties}
          />
          {cfg.label}
        </span>
        {relativeTime && (
          <span className="ml-auto text-[10px] text-fg-subtle">{relativeTime}</span>
        )}
      </div>
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* List row                                                                   */
/* -------------------------------------------------------------------------- */

function ListRow({ item, onClick }: { item: KnowledgeItem; onClick?: () => void }) {
  const cfg = getTypeConfig(item.knowledge_type)
  const Icon = cfg.icon
  const tags = item.tags ?? []
  const visibleTags = tags.slice(0, 3)
  const extraTagCount = Math.max(0, tags.length - 3)

  const relativeTime = item.updated_at
    ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
    : item.created_at
      ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true })
      : null

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-4 rounded-lg border border-transparent',
        'px-4 py-3 text-left',
        'transition-all duration-150',
        'hover:border-border/40 hover:bg-bg-elevated hover:shadow-sm',
        'cursor-pointer focus-ring',
      )}
    >
      {/* Type icon */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: cfg.bg } as CSSProperties}
      >
        <Icon className="h-4 w-4" style={{ color: cfg.color }} strokeWidth={1.75} />
      </div>

      {/* Title + content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium text-fg">
            {item.title || 'Untitled'}
          </h3>
          {item.is_pinned && (
            <Pin className="h-3 w-3 shrink-0 text-primary" strokeWidth={2} />
          )}
        </div>
        {item.content && (
          <p className="mt-0.5 truncate text-xs text-fg-muted">{item.content}</p>
        )}
      </div>

      {/* Tags */}
      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {visibleTags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-bg-sunken px-2 py-0.5 font-label text-[10px] font-medium text-fg-muted"
          >
            {tag}
          </span>
        ))}
        {extraTagCount > 0 && (
          <span className="rounded-full bg-bg-sunken px-2 py-0.5 font-label text-[10px] font-medium text-fg-subtle">
            +{extraTagCount}
          </span>
        )}
      </div>

      {/* Type label */}
      <span
        className="hidden shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-label text-[10px] font-medium sm:inline-flex"
        style={{
          backgroundColor: cfg.bg,
          color: cfg.color,
        } as CSSProperties}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: cfg.dotColor } as CSSProperties}
        />
        {cfg.label}
      </span>

      {/* Time */}
      {relativeTime && (
        <span className="shrink-0 text-[10px] text-fg-subtle">{relativeTime}</span>
      )}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Exported component                                                         */
/* -------------------------------------------------------------------------- */

function KnowledgeCard({ item, view = 'grid', onClick }: KnowledgeCardProps) {
  if (view === 'list') {
    return <ListRow item={item} onClick={onClick} />
  }
  return <GridCard item={item} onClick={onClick} />
}

export default memo(KnowledgeCard)
