import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Image as ImageIcon,
  Upload,
  X,
  Loader2,
  FileText,
  ArrowRight,
  BookOpen,
  ScanSearch,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { searchKnowledge, visualSearch, getWorkspace } from '@/lib/api'
import { knowledgeRoute } from '@/lib/routes'
import { useWorkspaceId } from '@/hooks/useWorkspaceId'
import EmptyState from '@/components/shared/EmptyState'
import { getTypeConfig } from '@/components/knowledge/KnowledgeCard'
import KnowledgeTypeFilter from '@/components/knowledge/KnowledgeTypeFilter'
import type { KnowledgeType } from '@/components/knowledge/KnowledgeTypeFilter'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SearchResult {
  id: string
  title: string
  content?: string | null
  knowledge_type: string
  score?: number
  highlights?: string[]
  tags?: string[] | null
  updated_at?: string | null
}

type SearchTab = 'text' | 'visual'

/* -------------------------------------------------------------------------- */
/* Highlight helper                                                           */
/* -------------------------------------------------------------------------- */

function highlightMatch(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text]

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        className="rounded-sm bg-primary/20 px-0.5 text-fg"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

/* -------------------------------------------------------------------------- */
/* Search result row                                                          */
/* -------------------------------------------------------------------------- */

interface ResultRowProps {
  result: SearchResult
  query: string
  onClick: () => void
  index: number
}

function ResultRow({ result, query, onClick, index }: ResultRowProps) {
  const cfg = getTypeConfig(result.knowledge_type)
  const Icon = cfg.icon

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      className={cn(
        'group flex w-full items-start gap-4 rounded-lg border border-transparent p-4 text-left',
        'transition-all duration-150',
        'hover:border-border/40 hover:bg-bg-elevated hover:shadow-sm',
        'cursor-pointer focus-ring',
      )}
    >
      {/* Type icon */}
      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: cfg.bg }}
      >
        <Icon className="h-4 w-4" style={{ color: cfg.color }} strokeWidth={1.75} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-fg">
          {highlightMatch(result.title || 'Untitled', query)}
        </h3>

        {result.content && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">
            {highlightMatch(
              result.content.slice(0, 300),
              query,
            )}
          </p>
        )}

        {/* Highlights from API */}
        {result.highlights && result.highlights.length > 0 && (
          <div className="mt-2 space-y-1">
            {result.highlights.slice(0, 2).map((h, i) => (
              <p
                key={i}
                className="rounded bg-bg-sunken/50 px-2 py-1 text-xs text-fg-muted"
                dangerouslySetInnerHTML={{ __html: h }}
              />
            ))}
          </div>
        )}

        {/* Tags */}
        {result.tags && result.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {result.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-bg-sunken px-2 py-0.5 font-label text-[10px] font-medium text-fg-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Score indicator */}
      {result.score != null && (
        <div className="shrink-0 pt-0.5">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-primary">
            {(result.score * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {/* Arrow */}
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
    </motion.button>
  )
}

/* -------------------------------------------------------------------------- */
/* Visual search drop zone                                                    */
/* -------------------------------------------------------------------------- */

interface VisualSearchZoneProps {
  workspaceId: string
  onResults: (results: SearchResult[]) => void
  onSearching: (searching: boolean) => void
}

function VisualSearchZone({ workspaceId, onResults, onSearching }: VisualSearchZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const searchMutation = useMutation({
    mutationFn: (file: File) => visualSearch(workspaceId, file, 20),
    onMutate: () => onSearching(true),
    onSuccess: (data) => {
      onResults(data.results ?? data ?? [])
      onSearching(false)
    },
    onError: () => onSearching(false),
  })

  const handleFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file)
      setPreview(url)
      searchMutation.mutate(file)
    },
    [searchMutation],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith('image/')) {
        handleFile(file)
      }
    },
    [handleFile],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const clearPreview = () => {
    setPreview(null)
    onResults([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-4">
      {preview ? (
        /* Preview of uploaded image */
        <div className="relative rounded-lg border border-border/40 bg-bg-elevated p-4">
          <button
            type="button"
            onClick={clearPreview}
            className="absolute right-2 top-2 rounded-full bg-bg-sunken p-1.5 text-fg-muted hover:text-fg transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center justify-center">
            <img
              src={preview}
              alt="Search image"
              className="max-h-48 rounded-md object-contain"
            />
          </div>
          {searchMutation.isPending && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Searching visually similar items...
            </div>
          )}
        </div>
      ) : (
        /* Drop zone */
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10',
            'transition-colors',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border/40 bg-bg-sunken/50 hover:border-border/60 hover:bg-bg-sunken',
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <ImageIcon className="h-6 w-6 text-primary" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="font-display text-sm font-medium text-fg">
              Drop an image to search
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              or click to browse. Finds visually similar knowledge items.
            </p>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

export default function SearchPage() {
  const workspaceId = useWorkspaceId()
  const wid = workspaceId ?? ''
  const navigate = useNavigate()

  /* -- State --------------------------------------------------------------- */
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeTab, setActiveTab] = useState<SearchTab>('text')
  const [typeFilter, setTypeFilter] = useState<KnowledgeType>('all')
  const [visualResults, setVisualResults] = useState<SearchResult[]>([])
  const [visualSearching, setVisualSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus search input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query)
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  /* -- Query --------------------------------------------------------------- */

  const workspaceQuery = useQuery({
    queryKey: ['workspace', wid],
    queryFn: () => getWorkspace(wid),
    enabled: !!wid,
  })

  const searchQ = useQuery({
    queryKey: ['search', wid, debouncedQuery, typeFilter],
    queryFn: () =>
      searchKnowledge(wid, debouncedQuery, {
        knowledge_type: typeFilter === 'all' ? undefined : typeFilter,
        limit: 50,
      }),
    enabled: !!wid && !!debouncedQuery && activeTab === 'text',
  })

  /* -- Results ------------------------------------------------------------- */

  const textResults: SearchResult[] = useMemo(() => {
    return searchQ.data?.results ?? searchQ.data?.knowledge ?? searchQ.data ?? []
  }, [searchQ.data])

  const results = activeTab === 'text' ? textResults : visualResults
  const isSearching = activeTab === 'text' ? searchQ.isFetching : visualSearching
  const hasSearched = activeTab === 'text' ? !!debouncedQuery : visualResults.length > 0 || visualSearching

  /* -- Type counts for filter ---------------------------------------------- */

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<KnowledgeType, number>> = { all: results.length }
    for (const r of results) {
      const t = r.knowledge_type?.toLowerCase() as KnowledgeType
      counts[t] = (counts[t] ?? 0) + 1
    }
    return counts
  }, [results])

  const filteredResults = useMemo(() => {
    if (typeFilter === 'all') return results
    return results.filter((r) => r.knowledge_type?.toLowerCase() === typeFilter)
  }, [results, typeFilter])

  /* -- Render -------------------------------------------------------------- */

  const workspaceName = workspaceQuery.data?.name ?? 'Workspace'

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-label text-xs font-medium text-primary">
          <ScanSearch className="h-3 w-3" />
          {workspaceName}
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
          Search Knowledge
        </h1>
      </motion.div>

      {/* Search bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Tabs */}
        <div className="mb-4 flex items-center gap-1 rounded-lg bg-bg-sunken p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-2 font-label text-xs font-medium transition-colors focus-ring',
              activeTab === 'text'
                ? 'bg-bg-elevated text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            <Search className="h-3.5 w-3.5" />
            Text Search
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-2 font-label text-xs font-medium transition-colors focus-ring',
              activeTab === 'visual'
                ? 'bg-bg-elevated text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Visual Search
          </button>
        </div>

        {activeTab === 'text' ? (
          /* Text search input */
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-subtle" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search knowledge..."
              className={cn(
                'w-full rounded-xl border border-border/40 bg-bg-elevated py-4 pl-12 pr-4',
                'font-display text-base text-fg placeholder:text-fg-subtle',
                'transition-all outline-none',
                'focus:border-primary/50 focus:shadow-lg focus:shadow-primary/5',
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-fg-subtle hover:text-fg hover:bg-bg-sunken transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          /* Visual search */
          <VisualSearchZone
            workspaceId={wid}
            onResults={setVisualResults}
            onSearching={setVisualSearching}
          />
        )}
      </motion.div>

      {/* Type filter (shown when there are results) */}
      {hasSearched && results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <KnowledgeTypeFilter
            active={typeFilter}
            onChange={setTypeFilter}
            counts={typeCounts}
          />
        </motion.div>
      )}

      {/* Results area */}
      <div>
        {isSearching && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Searching...
          </div>
        )}

        {!isSearching && hasSearched && filteredResults.length === 0 && (
          <EmptyState
            icon={Search}
            title="No results found"
            description={
              activeTab === 'text'
                ? `No knowledge items matched "${debouncedQuery}". Try a different search term.`
                : 'No visually similar items found. Try a different image.'
            }
          />
        )}

        {!isSearching && filteredResults.length > 0 && (
          <div className="space-y-1">
            {/* Result count */}
            <p className="mb-3 font-label text-xs font-medium text-fg-muted">
              {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
              {typeFilter !== 'all' && ` in ${typeFilter}`}
            </p>

            <AnimatePresence mode="popLayout">
              {filteredResults.map((result, index) => (
                <ResultRow
                  key={result.id}
                  result={result}
                  query={activeTab === 'text' ? debouncedQuery : ''}
                  onClick={() => navigate(knowledgeRoute(wid, result.id))}
                  index={index}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Empty state - no search yet */}
        {!hasSearched && !isSearching && activeTab === 'text' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="flex flex-col items-center justify-center gap-4 py-16 text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-sunken">
              <BookOpen className="h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
            </div>
            <div className="max-w-sm space-y-1.5">
              <h3 className="font-display text-base font-semibold text-fg">
                Search your knowledge
              </h3>
              <p className="text-sm leading-relaxed text-fg-muted">
                Find notes, bookmarks, documents, and more across your workspace. Use the visual search tab to find images by similarity.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
