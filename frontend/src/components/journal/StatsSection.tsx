import { useMemo, useState } from 'react'
import { Flame, FileText, Pencil, Star, ChevronDown } from 'lucide-react'
import type { JournalResponse, DateRange } from './helpers'
import { parseJournalDate, isWithinRange, computeStreak, computeLongestStreak, countWords } from './helpers'

const SECTION_KEY = 'journal-rail-section-stats'

interface StatsSectionProps {
  journals: JournalResponse[]
  dateRange: DateRange | null
}

export function StatsSection({ journals, dateRange }: StatsSectionProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SECTION_KEY) === '1'
  })

  const stats = useMemo(() => {
    const today = new Date()
    const streak = computeStreak(journals, today)
    const longest = computeLongestStreak(journals)

    let entriesInRange = 0
    let wordsInRange = 0
    for (const j of journals) {
      const iso = parseJournalDate(j.date)
      if (!iso) continue
      if (!isWithinRange(iso, dateRange)) continue
      entriesInRange += j.entries.length
      for (const e of j.entries) wordsInRange += countWords(e.body)
    }
    return { streak, longest, entriesInRange, wordsInRange }
  }, [journals, dateRange])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(SECTION_KEY, next ? '1' : '0')
  }

  return (
    <section className="border-t border-border/20 pt-3">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 hover:text-foreground transition-colors px-1"
      >
        <span>Stats</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      {!collapsed && (
        <div className="mt-2 space-y-1.5 px-1 text-xs">
          <div className="flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-amber-400/80" />
            <span>{stats.streak}-day streak</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-muted-foreground/70" />
            <span>{stats.entriesInRange} {stats.entriesInRange === 1 ? 'entry' : 'entries'} in range</span>
          </div>
          <div className="flex items-center gap-2">
            <Pencil className="w-3.5 h-3.5 text-muted-foreground/70" />
            <span>{stats.wordsInRange.toLocaleString()} {stats.wordsInRange === 1 ? 'word' : 'words'} in range</span>
          </div>
          <div className="flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-muted-foreground/70" />
            <span>Longest streak: {stats.longest}</span>
          </div>
        </div>
      )}
    </section>
  )
}
