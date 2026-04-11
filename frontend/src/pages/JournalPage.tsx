import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Calendar, Clock, Edit3, Loader2, Send, Lock, X, Check } from 'lucide-react'
import { listJournals, addJournalEntry, updateJournalEntry } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────────────

interface JournalEntry {
  timestamp: string
  body: string
  editable: boolean
}

interface JournalResponse {
  id: string
  date: string
  entries: JournalEntry[]
  readonly: boolean
  created_at: string
  updated_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  )
}

function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return (
    d.getUTCFullYear() === yesterday.getUTCFullYear() &&
    d.getUTCMonth() === yesterday.getUTCMonth() &&
    d.getUTCDate() === yesterday.getUTCDate()
  )
}

function formatDateHeader(dateStr: string): string {
  if (isToday(dateStr)) return 'Today'
  if (isYesterday(dateStr)) return 'Yesterday'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDateForInput(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()

  // State
  const [newEntry, setNewEntry] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null) // "journalId:entryIndex"
  const [editDraft, setEditDraft] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Fetch all journals with full entries via dedicated endpoint
  const { data: journalsData, isLoading } = useQuery({
    queryKey: ['journals', workspaceId],
    queryFn: () => listJournals(workspaceId),
    enabled: !!workspaceId,
  })

  const journals = (journalsData ?? []) as JournalResponse[]

  // Filter by selected date
  const filteredJournals = useMemo(() => {
    if (!selectedDate) return journals
    return journals.filter((j) => {
      const d = new Date(j.created_at)
      const journalDate = formatDateForInput(d)
      return journalDate === selectedDate
    })
  }, [journals, selectedDate])

  // Close date picker on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false)
      }
    }
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDatePicker])

  // Auto-resize textarea
  const resizeTextarea = useCallback((ref: React.RefObject<HTMLTextAreaElement | null>) => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  // Submit new entry
  const handleSubmit = useCallback(async () => {
    const body = newEntry.trim()
    if (!body || submitting) return
    setSubmitting(true)
    try {
      await addJournalEntry(workspaceId, body)
      setNewEntry('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      queryClient.invalidateQueries({ queryKey: ['journals', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
      // Scroll to top after adding
      setTimeout(() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 200)
    } catch (err) {
      console.error('Failed to add journal entry:', err)
    } finally {
      setSubmitting(false)
    }
  }, [newEntry, submitting, workspaceId, queryClient])

  // Begin editing
  const beginEdit = useCallback((journalId: string, entryIndex: number, currentBody: string) => {
    setEditingKey(`${journalId}:${entryIndex}`)
    setEditDraft(currentBody)
    setTimeout(() => {
      editTextareaRef.current?.focus()
      resizeTextarea(editTextareaRef)
    }, 50)
  }, [resizeTextarea])

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingKey(null)
    setEditDraft('')
  }, [])

  // Save edit
  const saveEdit = useCallback(async () => {
    if (!editingKey || editSaving) return
    const [journalId, indexStr] = editingKey.split(':')
    const entryIndex = parseInt(indexStr, 10)
    const body = editDraft.trim()
    if (!body) return

    setEditSaving(true)
    try {
      await updateJournalEntry(workspaceId, journalId, entryIndex, body)
      queryClient.invalidateQueries({ queryKey: ['journals', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
      cancelEdit()
    } catch (err) {
      console.error('Failed to update journal entry:', err)
    } finally {
      setEditSaving(false)
    }
  }, [editingKey, editSaving, editDraft, workspaceId, queryClient, cancelEdit])

  // Keyboard handling for new entry
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  // Keyboard handling for edit
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        saveEdit()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      }
    },
    [saveEdit, cancelEdit],
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border/20 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <BookOpen className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Journal</h1>
            <p className="text-xs text-muted-foreground">
              {journals.length} day{journals.length === 1 ? '' : 's'} recorded
            </p>
          </div>
        </div>

        {/* Date navigation */}
        <div className="relative" ref={datePickerRef}>
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              selectedDate
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : 'border-border/30 bg-card/40 text-muted-foreground hover:border-border/50 hover:text-foreground'
            }`}
          >
            <Calendar className="h-4 w-4" />
            {selectedDate
              ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'All dates'}
          </button>

          {showDatePicker && (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border/40 bg-card p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Jump to date
                </span>
                {selectedDate && (
                  <button
                    onClick={() => {
                      setSelectedDate(null)
                      setShowDatePicker(false)
                    }}
                    className="text-xs text-amber-500 hover:text-amber-400"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="date"
                value={selectedDate || ''}
                max={formatDateForInput(new Date())}
                onChange={(e) => {
                  setSelectedDate(e.target.value || null)
                  setShowDatePicker(false)
                }}
                className="w-full rounded-lg border border-border/30 bg-background/50 px-3 py-2 text-sm outline-none focus:border-amber-500/50"
              />
              {/* Quick date buttons */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  { label: 'Today', days: 0 },
                  { label: 'Yesterday', days: 1 },
                  { label: '7 days ago', days: 7 },
                ].map(({ label, days }) => {
                  const d = new Date()
                  d.setDate(d.getDate() - days)
                  const val = formatDateForInput(d)
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        setSelectedDate(val)
                        setShowDatePicker(false)
                      }}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        selectedDate === val
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-500'
                          : 'border-border/25 bg-background/30 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Loading journal...</span>
          </div>
        ) : filteredJournals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
              <BookOpen className="h-8 w-8 text-amber-500/60" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground/80">
                {selectedDate ? 'No entries for this date' : 'No journal entries yet'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedDate
                  ? 'Try selecting a different date or clear the filter.'
                  : 'Start writing below to add your first journal entry.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            {filteredJournals.map((journal) => (
              <div key={journal.id}>
                {/* Date header */}
                <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-background/80 py-2 backdrop-blur-sm">
                  <div
                    className={`flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
                      !journal.readonly
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                        : 'border-border/30 bg-card/50 text-muted-foreground'
                    }`}
                  >
                    {journal.readonly && <Lock className="h-3 w-3" />}
                    {formatDateHeader(journal.created_at)}
                  </div>
                  <div className="h-px flex-1 bg-border/20" />
                  <span className="text-[11px] text-muted-foreground/60">
                    {journal.entries.length} entr{journal.entries.length === 1 ? 'y' : 'ies'}
                  </span>
                </div>

                {/* Entries timeline */}
                <div className="space-y-1.5 pl-2">
                  {journal.entries.map((entry, idx) => {
                    const key = `${journal.id}:${idx}`
                    const isEditing = editingKey === key

                    return (
                      <div key={key} className="group relative flex gap-3">
                        {/* Timeline dot + line */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`mt-2 h-2 w-2 flex-shrink-0 rounded-full ${
                              entry.editable
                                ? 'bg-amber-500'
                                : 'bg-border/60'
                            }`}
                          />
                          {idx < journal.entries.length - 1 && (
                            <div className="w-px flex-1 bg-border/20" />
                          )}
                        </div>

                        {/* Entry content */}
                        <div className="min-w-0 flex-1 pb-4">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                              <Clock className="h-3 w-3" />
                              {formatTime(entry.timestamp)}
                            </span>
                            {entry.editable && !isEditing && (
                              <button
                                onClick={() => beginEdit(journal.id, idx, entry.body)}
                                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground/50 opacity-0 transition-all hover:bg-amber-500/10 hover:text-amber-500 group-hover:opacity-100"
                                title="Edit entry"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                            )}
                            {journal.readonly && (
                              <Lock className="h-3 w-3 text-muted-foreground/30" />
                            )}
                          </div>

                          {isEditing ? (
                            <div className="mt-1.5 space-y-2">
                              <textarea
                                ref={editTextareaRef}
                                value={editDraft}
                                onChange={(e) => {
                                  setEditDraft(e.target.value)
                                  resizeTextarea(editTextareaRef)
                                }}
                                onKeyDown={handleEditKeyDown}
                                className="w-full resize-none rounded-lg border border-amber-500/30 bg-background/50 px-3 py-2 text-sm outline-none focus:border-amber-500/50"
                                rows={2}
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={saveEdit}
                                  disabled={editSaving || !editDraft.trim()}
                                  className="flex items-center gap-1 rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
                                >
                                  {editSaving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                  Save
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/30"
                                >
                                  <X className="h-3 w-3" />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                              {entry.body}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom sticky input bar */}
      <div className="flex-shrink-0 border-t border-border/20 bg-card/30 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-end gap-3">
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={newEntry}
              onChange={(e) => {
                setNewEntry(e.target.value)
                resizeTextarea(textareaRef)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Write a journal entry... (Enter to submit, Shift+Enter for newline)"
              className="w-full resize-none rounded-xl border border-border/30 bg-background/50 px-4 py-3 pr-12 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-amber-500/40 focus:bg-background/60"
              rows={1}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!newEntry.trim() || submitting}
            className="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500 transition-all hover:bg-amber-500/25 disabled:opacity-40 disabled:hover:bg-amber-500/15"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
