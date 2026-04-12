import { useState, useRef, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { listJournals, addJournalEntry, updateJournalEntry } from '@/lib/api'
import { JournalRail } from '@/components/journal/JournalRail'
import { JournalTimeline } from '@/components/journal/JournalTimeline'
import { JournalComposer, type JournalComposerHandle } from '@/components/journal/JournalComposer'
import { useToast } from '@/components/shared/ToastProvider'
import {
  type DateRange,
  type JournalResponse,
  parseJournalDate,
  isWithinRange,
  rangeIncludesToday,
} from '@/components/journal/helpers'

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Unknown error'
}

export default function JournalPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pulseEntryKey, setPulseEntryKey] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)  // "<journalId>:<entryIndex>"
  const [editDraft, setEditDraft] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const composerRef = useRef<JournalComposerHandle | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: journals = [], isLoading } = useQuery<JournalResponse[]>({
    queryKey: ['journals', workspaceId],
    queryFn: () => listJournals(workspaceId),
    enabled: !!workspaceId,
  })

  const filteredJournals = useMemo(() => {
    if (!dateRange) return journals
    return journals.filter(j => {
      const iso = parseJournalDate(j.date)
      return iso ? isWithinRange(iso, dateRange) : false
    })
  }, [journals, dateRange])

  const includesToday = rangeIncludesToday(dateRange, new Date())

  const handleSendEntry = useCallback(async (body: string) => {
    setSubmitting(true)
    try {
      await addJournalEntry(workspaceId, body)
      await queryClient.invalidateQueries({ queryKey: ['journals', workspaceId] })
    } catch (err) {
      toast.error('Failed to save entry', describeError(err))
      throw err  // re-throw so the composer keeps the draft for retry
    } finally {
      setSubmitting(false)
    }
  }, [workspaceId, queryClient, toast])

  const handleEditStart = useCallback((journalId: string, entryIndex: number) => {
    const j = journals.find(x => x.id === journalId)
    if (!j) return
    const e = j.entries[entryIndex]
    if (!e) return
    setEditingKey(`${journalId}:${entryIndex}`)
    setEditDraft(e.body)
  }, [journals])

  const handleEditCancel = useCallback(() => {
    setEditingKey(null)
    setEditDraft('')
  }, [])

  const handleEditSave = useCallback(async () => {
    if (!editingKey) return
    const [journalId, idxStr] = editingKey.split(':')
    const idx = parseInt(idxStr, 10)
    setEditSaving(true)
    try {
      await updateJournalEntry(workspaceId, journalId, idx, editDraft)
      await queryClient.invalidateQueries({ queryKey: ['journals', workspaceId] })
      setEditingKey(null)
      setEditDraft('')
    } catch (err) {
      toast.error('Failed to save edit', describeError(err))
    } finally {
      setEditSaving(false)
    }
  }, [editingKey, editDraft, workspaceId, queryClient, toast])

  const handleSearchResultClick = useCallback((entryKey: string) => {
    setPulseEntryKey(entryKey)
    // The pulse is a one-shot — clear after the animation duration so it can re-fire later.
    setTimeout(() => setPulseEntryKey(null), 1600)
    // Scroll the matching entry into view.
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector(`[data-entry-key="${entryKey}"]`)
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }, [])

  const totalEntries = useMemo(
    () => filteredJournals.reduce((sum, j) => sum + j.entries.length, 0),
    [filteredJournals],
  )

  return (
    <div className="flex h-full flex-col">
      {/* Slim header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border/20 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <BookOpen className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Journal</h1>
            <p className="text-xs text-muted-foreground">
              {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}{dateRange ? ' in range' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Body: timeline + rail */}
      <div className="flex flex-1 min-h-0 gap-3 p-3">
        <div className="flex-1 min-w-0 flex flex-col">
          <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-2">
            {isLoading ? (
              <div className="text-sm text-muted-foreground/70 text-center py-12">Loading…</div>
            ) : editingKey ? (
              <JournalTimelineWithEdit
                journals={filteredJournals}
                searchQuery={searchQuery}
                pulseEntryKey={pulseEntryKey}
                onEditStart={handleEditStart}
                editingKey={editingKey}
                editDraft={editDraft}
                onEditDraftChange={setEditDraft}
                onEditSave={handleEditSave}
                onEditCancel={handleEditCancel}
                editSaving={editSaving}
              />
            ) : (
              <JournalTimeline
                journals={filteredJournals}
                searchQuery={searchQuery}
                pulseEntryKey={pulseEntryKey}
                onEditStart={handleEditStart}
              />
            )}
          </div>
          {includesToday && (
            <JournalComposer
              onSend={handleSendEntry}
              disabled={submitting}
              composerRef={composerRef}
            />
          )}
        </div>
        <JournalRail
          journals={journals}
          filteredJournals={filteredJournals}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchResultClick={handleSearchResultClick}
          composerRef={composerRef}
          rangeIncludesToday={includesToday}
        />
      </div>
    </div>
  )
}

/** Variant of JournalTimeline that also renders an inline edit panel above the timeline. */
function JournalTimelineWithEdit(props: {
  journals: JournalResponse[]
  searchQuery: string
  pulseEntryKey: string | null
  onEditStart: (journalId: string, entryIndex: number) => void
  editingKey: string
  editDraft: string
  onEditDraftChange: (s: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  editSaving: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <textarea
          autoFocus
          value={props.editDraft}
          onChange={e => props.onEditDraftChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              props.onEditSave()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              props.onEditCancel()
            }
          }}
          className="w-full min-h-[80px] bg-transparent text-sm outline-none resize-none"
        />
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={props.onEditCancel}
            disabled={props.editSaving}
            className="text-xs px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={props.onEditSave}
            disabled={props.editSaving || !props.editDraft.trim()}
            className="text-xs px-2 py-1 rounded bg-amber-500 text-background font-medium disabled:opacity-50"
          >
            {props.editSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <JournalTimeline
        journals={props.journals}
        searchQuery={props.searchQuery}
        pulseEntryKey={props.pulseEntryKey}
        onEditStart={props.onEditStart}
      />
    </div>
  )
}
