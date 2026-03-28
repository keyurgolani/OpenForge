import { useRef, useEffect, type CSSProperties } from 'react'
import {
  FileText,
  Bookmark,
  Code,
  Image,
  Music,
  Zap,
  FileSpreadsheet,
  Presentation,
  Layers,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type KnowledgeType =
  | 'all'
  | 'note'
  | 'fleeting'
  | 'bookmark'
  | 'gist'
  | 'image'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'sheet'
  | 'slide'

interface TypeFilterConfig {
  key: KnowledgeType
  label: string
  icon: LucideIcon
  dotColor: string
}

const TYPE_FILTERS: TypeFilterConfig[] = [
  { key: 'all', label: 'All', icon: Layers, dotColor: 'rgb(var(--fg-subtle))' },
  { key: 'note', label: 'Notes', icon: FileText, dotColor: '#3b82f6' },
  { key: 'fleeting', label: 'Fleeting', icon: Zap, dotColor: '#f97316' },
  { key: 'bookmark', label: 'Bookmarks', icon: Bookmark, dotColor: '#22c55e' },
  { key: 'gist', label: 'Gists', icon: Code, dotColor: '#a855f7' },
  { key: 'image', label: 'Images', icon: Image, dotColor: '#ec4899' },
  { key: 'audio', label: 'Audio', icon: Music, dotColor: '#f59e0b' },
  { key: 'pdf', label: 'PDFs', icon: FileText, dotColor: '#ef4444' },
  { key: 'document', label: 'Documents', icon: FileText, dotColor: '#6366f1' },
  { key: 'sheet', label: 'Sheets', icon: FileSpreadsheet, dotColor: '#10b981' },
  { key: 'slide', label: 'Slides', icon: Presentation, dotColor: '#f59e0b' },
]

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

interface KnowledgeTypeFilterProps {
  active: KnowledgeType
  onChange: (type: KnowledgeType) => void
  counts?: Partial<Record<KnowledgeType, number>>
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function KnowledgeTypeFilter({
  active,
  onChange,
  counts,
  className,
}: KnowledgeTypeFilterProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Scroll active pill into view on mount/change
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current
      const pill = activeRef.current
      const containerRect = container.getBoundingClientRect()
      const pillRect = pill.getBoundingClientRect()

      if (pillRect.left < containerRect.left || pillRect.right > containerRect.right) {
        pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [active])

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex items-center gap-1.5 overflow-x-auto scrollbar-none',
        '-mx-1 px-1 py-1',
        className,
      )}
      style={{ scrollbarWidth: 'none' }}
    >
      {TYPE_FILTERS.map((filter) => {
        const isActive = active === filter.key
        const count = counts?.[filter.key]

        return (
          <button
            key={filter.key}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={() => onChange(filter.key)}
            className={cn(
              'group inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5',
              'font-label text-xs font-medium',
              'transition-all duration-150',
              'focus-ring',
              isActive
                ? 'bg-primary text-fg-on-primary shadow-sm'
                : 'bg-bg-sunken text-fg-muted hover:bg-bg-elevated hover:text-fg',
            )}
          >
            {/* Dot indicator */}
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full transition-colors',
                isActive && 'opacity-80',
              )}
              style={
                {
                  backgroundColor: isActive ? 'rgb(var(--fg-on-primary))' : filter.dotColor,
                } as CSSProperties
              }
            />

            {filter.label}

            {/* Count badge */}
            {count !== undefined && count > 0 && (
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-semibold leading-relaxed',
                  isActive
                    ? 'bg-white/20 text-fg-on-primary'
                    : 'bg-bg-elevated text-fg-subtle',
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
