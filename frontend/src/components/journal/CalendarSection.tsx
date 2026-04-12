import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import type { JournalResponse, DateRange } from './helpers'
import { parseJournalDate, toIsoDate } from './helpers'

const SECTION_KEY = 'journal-rail-section-calendar'

interface CalendarSectionProps {
  journals: JournalResponse[]
  dateRange: DateRange | null
  onChange: (range: DateRange | null) => void
  /** For tests — pin the displayed month deterministically. */
  initialMonth?: Date
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
}

function buildMonthCells(monthAnchor: Date): { iso: string; inMonth: boolean; day: number }[] {
  // Build a 6-row × 7-col grid starting from the Sunday before the 1st.
  const first = startOfMonth(monthAnchor)
  const firstWeekday = first.getUTCDay()  // 0 = Sun
  const gridStart = new Date(first)
  gridStart.setUTCDate(gridStart.getUTCDate() - firstWeekday)
  const month = first.getUTCMonth()

  const cells: { iso: string; inMonth: boolean; day: number }[] = []
  const cursor = new Date(gridStart)
  for (let i = 0; i < 42; i++) {
    cells.push({
      iso: toIsoDate(cursor),
      inMonth: cursor.getUTCMonth() === month,
      day: cursor.getUTCDate(),
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return cells
}

export function CalendarSection({ journals, dateRange, onChange, initialMonth }: CalendarSectionProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SECTION_KEY) === '1'
  })
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => initialMonth ?? new Date())

  const entryDates = useMemo(() => {
    return new Set(
      journals
        .filter(j => j.entries.length > 0)
        .map(j => parseJournalDate(j.date))
        .filter((d): d is string => d !== null),
    )
  }, [journals])

  const cells = useMemo(() => buildMonthCells(monthAnchor), [monthAnchor])
  const todayIso = toIsoDate(new Date())

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(SECTION_KEY, next ? '1' : '0')
  }

  const monthLabel = monthAnchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const handleDayClick = (iso: string) => {
    if (!dateRange) {
      onChange({ from: iso, to: iso })
      return
    }
    if (dateRange.from === dateRange.to) {
      // Extend
      const [from, to] = iso < dateRange.from ? [iso, dateRange.from] : [dateRange.from, iso]
      onChange({ from, to })
    } else {
      // Reset
      onChange({ from: iso, to: iso })
    }
  }

  const presetToday = () => onChange({ from: todayIso, to: todayIso })
  const presetLast7 = () => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 6)
    onChange({ from: toIsoDate(d), to: todayIso })
  }
  const presetLast30 = () => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 29)
    onChange({ from: toIsoDate(d), to: todayIso })
  }
  const presetThisMonth = () => {
    const first = startOfMonth(new Date())
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
    onChange({ from: toIsoDate(first), to: toIsoDate(last) })
  }
  const presetAll = () => onChange(null)

  return (
    <section className="border-t border-border/20 first:border-t-0 pt-3 first:pt-0">
      <button
        onClick={toggleCollapsed}
        className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 hover:text-foreground transition-colors px-1"
      >
        <span>Calendar</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      {!collapsed && (
        <div className="mt-2 px-1">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))}
              className="p-1 rounded hover:bg-muted/30 text-muted-foreground hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium">{monthLabel}</span>
            <button
              onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}
              className="p-1 rounded hover:bg-muted/30 text-muted-foreground hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground/60 mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(cell => {
              const hasEntry = entryDates.has(cell.iso)
              const isToday = cell.iso === todayIso
              const inRange = dateRange && cell.iso >= dateRange.from && cell.iso <= dateRange.to
              const isEndpoint = dateRange && (cell.iso === dateRange.from || cell.iso === dateRange.to)

              const cellLabel = new Date(cell.iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

              return (
                <button
                  key={cell.iso}
                  onClick={() => handleDayClick(cell.iso)}
                  aria-label={cellLabel}
                  className={[
                    'aspect-square flex items-center justify-center text-[10px] rounded relative transition-colors',
                    cell.inMonth ? 'text-foreground/90' : 'text-muted-foreground/30',
                    isEndpoint ? 'bg-amber-500/40 text-foreground font-semibold' :
                      inRange ? 'bg-amber-500/15 text-foreground' :
                      'hover:bg-muted/30',
                    isToday && !isEndpoint ? 'ring-1 ring-amber-400/50' : '',
                    hasEntry ? 'calendar-day-has-entry' : '',
                  ].join(' ')}
                >
                  {cell.day}
                  {hasEntry && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400/80" />
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {[
              { label: 'Today', fn: presetToday },
              { label: 'Last 7d', fn: presetLast7 },
              { label: 'Last 30d', fn: presetLast30 },
              { label: 'This month', fn: presetThisMonth },
              { label: 'All', fn: presetAll },
            ].map(p => (
              <button
                key={p.label}
                onClick={p.fn}
                className="text-[10px] rounded-md border border-border/30 bg-card/30 px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:border-border/50 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
