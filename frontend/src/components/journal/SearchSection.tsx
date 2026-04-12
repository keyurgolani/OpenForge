import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { JournalResponse } from './helpers'
import { flattenEntries } from './helpers'

const SECTION_KEY = 'journal-rail-section-search'
const SNIPPET_PADDING = 30

interface SearchSectionProps {
  journals: JournalResponse[]
  query: string
  onQueryChange: (q: string) => void
  onResultClick: (entryKey: string) => void
}

interface Match {
  key: string  // "<journalId>:<entryIndex>"
  timestamp: string
  snippet: { before: string; match: string; after: string }
}

function buildSnippet(body: string, query: string): { before: string; match: string; after: string } | null {
  const idx = body.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return null
  const start = Math.max(0, idx - SNIPPET_PADDING)
  const end = Math.min(body.length, idx + query.length + SNIPPET_PADDING)
  return {
    before: (start > 0 ? '…' : '') + body.slice(start, idx),
    match: body.slice(idx, idx + query.length),
    after: body.slice(idx + query.length, end) + (end < body.length ? '…' : ''),
  }
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ts
  }
}

export function SearchSection({ journals, query, onQueryChange, onResultClick }: SearchSectionProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SECTION_KEY) === '1'
  })

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(SECTION_KEY, next ? '1' : '0')
  }

  const matches: Match[] = useMemo(() => {
    if (!query.trim()) return []
    const flat = flattenEntries(journals)
    const out: Match[] = []
    for (const e of flat) {
      const snip = buildSnippet(e.body, query)
      if (snip) {
        out.push({
          key: `${e.journalId}:${e.entryIndex}`,
          timestamp: e.timestamp,
          snippet: snip,
        })
      }
    }
    return out
  }, [journals, query])

  return (
    <section className="border-t border-border/20 pt-3">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 hover:text-foreground transition-colors px-1"
      >
        <span>Search</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      {!collapsed && (
        <div className="mt-2 px-1 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
            <input
              type="text"
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="Search in range..."
              className="w-full rounded-md border border-border/30 bg-background/40 pl-7 pr-2 py-1.5 text-xs outline-none focus:border-amber-500/50"
            />
          </div>
          {query.trim() && (
            <div className="text-[10px] text-muted-foreground/70">
              {matches.length === 0
                ? 'No matches in range'
                : `${matches.length} match${matches.length === 1 ? '' : 'es'}`}
            </div>
          )}
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {matches.map(m => (
              <button
                key={m.key}
                onClick={() => onResultClick(m.key)}
                className="text-left text-[11px] rounded-md border border-border/20 bg-card/20 px-2 py-1.5 hover:border-amber-500/30 hover:bg-amber-500/5 transition-colors"
              >
                <div className="text-muted-foreground/60 text-[9px] uppercase tracking-wider mb-0.5">
                  {formatTime(m.timestamp)}
                </div>
                <div className="text-foreground/85 leading-snug">
                  {m.snippet.before}
                  <mark className="bg-amber-400/30 text-foreground rounded-sm px-0.5">{m.snippet.match}</mark>
                  {m.snippet.after}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
