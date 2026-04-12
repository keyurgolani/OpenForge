export interface JournalEntry {
  timestamp: string
  body: string
  editable: boolean
}

export interface JournalResponse {
  id: string
  date: string  // human-readable title, e.g. "April 09, 2026"
  entries: JournalEntry[]
  readonly: boolean
  created_at: string
  updated_at: string
}

export interface DateRange {
  from: string  // ISO YYYY-MM-DD
  to: string    // ISO YYYY-MM-DD
}

export interface FlatEntry {
  journalId: string
  entryIndex: number
  isoDate: string  // YYYY-MM-DD derived from journal.date
  timestamp: string
  body: string
  editable: boolean
  readonly: boolean
}

export function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

/** Parse "April 09, 2026" → "2026-04-09". Returns null if unparseable. */
export function parseJournalDate(title: string): string | null {
  const match = title.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/)
  if (!match) return null
  const monthNum = MONTHS[match[1].toLowerCase()]
  if (!monthNum) return null
  const day = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)
  if (isNaN(day) || isNaN(year)) return null
  return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isWithinRange(isoDate: string, range: DateRange | null): boolean {
  if (!range) return true
  return isoDate >= range.from && isoDate <= range.to
}

export function flattenEntries(journals: JournalResponse[]): FlatEntry[] {
  const out: FlatEntry[] = []
  for (const j of journals) {
    const isoDate = parseJournalDate(j.date) ?? ''
    j.entries.forEach((e, idx) => {
      out.push({
        journalId: j.id,
        entryIndex: idx,
        isoDate,
        timestamp: e.timestamp,
        body: e.body,
        editable: e.editable,
        readonly: j.readonly,
      })
    })
  }
  return out
}

/** Counts back from `today`. Returns the number of consecutive prior days (including today) that have at least one entry. */
export function computeStreak(journals: JournalResponse[], today: Date): number {
  const datesWithEntries = new Set(
    journals
      .filter(j => j.entries.length > 0)
      .map(j => parseJournalDate(j.date))
      .filter((d): d is string => d !== null)
  )
  let streak = 0
  const cursor = new Date(today)
  while (datesWithEntries.has(toIsoDate(cursor))) {
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

/** Returns the longest run of consecutive days with entries across full history. */
export function computeLongestStreak(journals: JournalResponse[]): number {
  const dates = journals
    .filter(j => j.entries.length > 0)
    .map(j => parseJournalDate(j.date))
    .filter((d): d is string => d !== null)
    .sort()  // ISO strings sort chronologically

  if (dates.length === 0) return 0

  let longest = 1
  let current = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00Z')
    const curr = new Date(dates[i] + 'T00:00:00Z')
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000)
    if (diffDays === 1) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 1
    }
  }
  return longest
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function rangeIncludesToday(range: DateRange | null, today: Date): boolean {
  if (!range) return true
  return isWithinRange(toIsoDate(today), range)
}
