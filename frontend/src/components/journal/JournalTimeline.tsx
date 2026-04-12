import { Fragment, useMemo } from 'react'
import { JournalDayHeader } from './JournalDayHeader'
import { JournalEntryStep } from './JournalEntryStep'
import type { JournalResponse } from './helpers'
import { countWords, parseJournalDate } from './helpers'

interface JournalTimelineProps {
  journals: JournalResponse[]
  searchQuery: string
  pulseEntryKey: string | null
  onEditStart: (journalId: string, entryIndex: number) => void
}

function formatDayLabel(isoDate: string, today: Date): string {
  const todayIso = today.toISOString().slice(0, 10)
  const yesterday = new Date(today)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yIso = yesterday.toISOString().slice(0, 10)
  if (isoDate === todayIso) return 'Today'
  if (isoDate === yIso) return 'Yesterday'
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

export function JournalTimeline({ journals, searchQuery, pulseEntryKey, onEditStart }: JournalTimelineProps) {
  const today = new Date()

  const groups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const result: { journal: JournalResponse; matchedEntries: { entry: typeof journals[0]['entries'][0]; index: number }[] }[] = []
    for (const j of journals) {
      const matched = j.entries
        .map((e, idx) => ({ entry: e, index: idx }))
        .filter(({ entry }) => !q || entry.body.toLowerCase().includes(q))
      if (matched.length > 0) result.push({ journal: j, matchedEntries: matched })
    }
    return result
  }, [journals, searchQuery])

  if (groups.length === 0) {
    return (
      <div className="text-sm text-muted-foreground/70 text-center py-12">
        No journal entries to show.
      </div>
    )
  }

  return (
    <div className="chat-workflow-stack flex flex-col gap-3">
      {groups.map(({ journal, matchedEntries }) => {
        const isoDate = parseJournalDate(journal.date) ?? ''
        const wordCount = matchedEntries.reduce((sum, m) => sum + countWords(m.entry.body), 0)
        return (
          <Fragment key={journal.id}>
            <JournalDayHeader
              label={formatDayLabel(isoDate, today)}
              entryCount={matchedEntries.length}
              wordCount={wordCount}
              readonly={journal.readonly}
            />
            {matchedEntries.map(({ entry, index }) => {
              const key = `${journal.id}:${index}`
              return (
                <JournalEntryStep
                  key={key}
                  entryKey={key}
                  timestamp={entry.timestamp}
                  body={entry.body}
                  editable={entry.editable}
                  readonly={journal.readonly}
                  pulse={pulseEntryKey === key}
                  onEditStart={() => onEditStart(journal.id, index)}
                />
              )
            })}
          </Fragment>
        )
      })}
    </div>
  )
}
