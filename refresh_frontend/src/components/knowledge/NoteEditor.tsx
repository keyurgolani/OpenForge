import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bold,
  Italic,
  Link as LinkIcon,
  Code,
  Heading1,
  Save,
  Check,
  Loader2,
  ChevronRight,
  Tag,
  Calendar,
  FileText,
  Sparkles,
  X,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { cn } from '@/lib/cn'
import { updateKnowledge, updateKnowledgeTags, generateKnowledgeIntelligence } from '@/lib/api'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface KnowledgeData {
  id: string
  title: string
  content?: string | null
  knowledge_type: string
  tags?: string[] | null
  word_count?: number | null
  created_at?: string | null
  updated_at?: string | null
  ai_summary?: string | null
  ai_insights?: any | null
}

interface NoteEditorProps {
  workspaceId: string
  knowledge: KnowledgeData
  codeMode?: boolean
}

/* -------------------------------------------------------------------------- */
/* Custom editor theme                                                        */
/* -------------------------------------------------------------------------- */

const editorTheme = EditorView.theme({
  '&': {
    fontSize: '14px',
    fontFamily: 'var(--font-body)',
  },
  '.cm-content': {
    padding: '16px 0',
    caretColor: 'rgb(var(--fg))',
    fontFamily: 'var(--font-body)',
    lineHeight: '1.75',
  },
  '.cm-cursor': {
    borderLeftColor: 'rgb(var(--fg))',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgb(var(--p-500) / 0.15)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgb(var(--fg-subtle))',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgb(var(--bg-sunken) / 0.4)',
  },
  '.cm-placeholder': {
    color: 'rgb(var(--fg-subtle))',
    fontStyle: 'italic',
  },
})

const codeEditorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
  },
  '.cm-content': {
    padding: '16px 0',
    caretColor: 'rgb(var(--fg))',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6',
  },
  '.cm-cursor': {
    borderLeftColor: 'rgb(var(--fg))',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgb(var(--p-500) / 0.15)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgb(var(--fg-subtle))',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgb(var(--bg-sunken) / 0.4)',
  },
  '.cm-placeholder': {
    color: 'rgb(var(--fg-subtle))',
    fontStyle: 'italic',
  },
})

/* -------------------------------------------------------------------------- */
/* Toolbar button                                                             */
/* -------------------------------------------------------------------------- */

interface ToolbarButtonProps {
  icon: typeof Bold
  label: string
  onClick: () => void
  active?: boolean
}

function ToolbarButton({ icon: Icon, label, onClick, active }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md',
        'transition-colors duration-100 focus-ring',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-fg-muted hover:bg-bg-sunken hover:text-fg',
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function NoteEditor({ workspaceId, knowledge, codeMode = false }: NoteEditorProps) {
  const queryClient = useQueryClient()

  /* -- Local state --------------------------------------------------------- */
  const [title, setTitle] = useState(knowledge.title ?? '')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(knowledge.tags ?? [])
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* -- Mutations ----------------------------------------------------------- */

  const updateMutation = useMutation({
    mutationFn: (data: { title?: string; content?: string }) =>
      updateKnowledge(workspaceId, knowledge.id, data),
    onSuccess: () => {
      setSaveStatus('saved')
      queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId, knowledge.id] })
      queryClient.invalidateQueries({ queryKey: ['knowledge-list', workspaceId] })
    },
    onError: () => {
      setSaveStatus('unsaved')
    },
  })

  const tagsMutation = useMutation({
    mutationFn: (newTags: string[]) =>
      updateKnowledgeTags(workspaceId, knowledge.id, newTags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId, knowledge.id] })
    },
  })

  const intelligenceMutation = useMutation({
    mutationFn: () => generateKnowledgeIntelligence(workspaceId, knowledge.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId, knowledge.id] })
    },
  })

  /* -- Auto-save logic ----------------------------------------------------- */

  const debouncedSave = useCallback(
    (data: { title?: string; content?: string }) => {
      setSaveStatus('unsaved')
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setSaveStatus('saving')
        updateMutation.mutate(data)
      }, 1500)
    },
    [updateMutation],
  )

  /* -- Editor insertion helpers -------------------------------------------- */

  const insertWrapper = useCallback(
    (before: string, after: string) => {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      const selected = view.state.sliceDoc(from, to)
      view.dispatch({
        changes: { from, to, insert: `${before}${selected}${after}` },
        selection: { anchor: from + before.length, head: to + before.length },
      })
      view.focus()
    },
    [],
  )

  const handleBold = useCallback(() => insertWrapper('**', '**'), [insertWrapper])
  const handleItalic = useCallback(() => insertWrapper('*', '*'), [insertWrapper])
  const handleCode = useCallback(() => insertWrapper('`', '`'), [insertWrapper])
  const handleLink = useCallback(() => insertWrapper('[', '](url)'), [insertWrapper])
  const handleHeading = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const { from } = view.state.selection.main
    const line = view.state.doc.lineAt(from)
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: '## ' },
    })
    view.focus()
  }, [])

  /* -- CodeMirror setup ---------------------------------------------------- */

  const extensions = useMemo(
    () => [
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      history(),
      markdown(),
      codeMode ? codeEditorTheme : editorTheme,
      codeMode ? oneDark : [],
      cmPlaceholder(codeMode ? 'Write your code here...' : 'Start writing...'),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const content = update.state.doc.toString()
          debouncedSave({ content })
        }
      }),
    ],
    [codeMode, debouncedSave],
  )

  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: knowledge.content ?? '',
      extensions,
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only create editor on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledge.id, codeMode])

  /* -- Title auto-save ----------------------------------------------------- */

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle)
      setSaveStatus('unsaved')
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
      titleDebounceRef.current = setTimeout(() => {
        setSaveStatus('saving')
        updateMutation.mutate({ title: newTitle })
      }, 1500)
    },
    [updateMutation],
  )

  /* -- Tag management ------------------------------------------------------ */

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (!trimmed || tags.includes(trimmed)) return
    const newTags = [...tags, trimmed]
    setTags(newTags)
    setTagInput('')
    tagsMutation.mutate(newTags)
  }, [tagInput, tags, tagsMutation])

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const newTags = tags.filter((t) => t !== tag)
      setTags(newTags)
      tagsMutation.mutate(newTags)
    },
    [tags, tagsMutation],
  )

  /* -- Cleanup ------------------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    }
  }, [])

  /* -- Derived values ------------------------------------------------------ */

  const wordCount = useMemo(() => {
    const content = viewRef.current?.state.doc.toString() ?? knowledge.content ?? ''
    const words = content.trim().split(/\s+/).filter(Boolean)
    return words.length
  }, [knowledge.content])

  const createdAt = knowledge.created_at
    ? format(new Date(knowledge.created_at), 'MMM d, yyyy')
    : null
  const updatedAt = knowledge.updated_at
    ? formatDistanceToNow(new Date(knowledge.updated_at), { addSuffix: true })
    : null

  /* -- Render -------------------------------------------------------------- */

  return (
    <div className="flex h-full">
      {/* Main editor area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-1 border-b border-border/30 px-4 py-2">
          {!codeMode && (
            <>
              <ToolbarButton icon={Bold} label="Bold (Ctrl+B)" onClick={handleBold} />
              <ToolbarButton icon={Italic} label="Italic (Ctrl+I)" onClick={handleItalic} />
              <ToolbarButton icon={LinkIcon} label="Link" onClick={handleLink} />
              <ToolbarButton icon={Code} label="Inline Code" onClick={handleCode} />
              <ToolbarButton icon={Heading1} label="Heading" onClick={handleHeading} />
              <div className="mx-2 h-5 w-px bg-border/30" />
            </>
          )}

          {/* Save status */}
          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 font-label text-xs',
                saveStatus === 'saved' && 'text-success',
                saveStatus === 'saving' && 'text-fg-muted',
                saveStatus === 'unsaved' && 'text-warning',
              )}
            >
              {saveStatus === 'saved' && (
                <>
                  <Check className="h-3 w-3" /> Saved
                </>
              )}
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                </>
              )}
              {saveStatus === 'unsaved' && (
                <>
                  <Save className="h-3 w-3" /> Unsaved
                </>
              )}
            </span>

            {/* Sidebar toggle */}
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-2.5',
                'font-label text-xs font-medium',
                'transition-colors focus-ring',
                sidebarOpen
                  ? 'bg-primary/10 text-primary'
                  : 'text-fg-muted hover:bg-bg-sunken hover:text-fg',
              )}
            >
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-200',
                  sidebarOpen && 'rotate-180',
                )}
              />
              Details
            </button>
          </div>
        </div>

        {/* Title input */}
        <div className="border-b border-border/20 px-6 py-4">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            className={cn(
              'w-full bg-transparent font-display text-2xl font-bold tracking-tight text-fg',
              'placeholder:text-fg-subtle',
              'outline-none',
            )}
          />
        </div>

        {/* CodeMirror container */}
        <div
          ref={editorRef}
          className={cn(
            'flex-1 overflow-y-auto px-6',
            codeMode && 'bg-bg-sunken',
          )}
        />
      </div>

      {/* Metadata sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 overflow-hidden border-l border-border/30"
          >
            <div className="flex h-full w-[280px] flex-col overflow-y-auto">
              {/* Sidebar header */}
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
                <h3 className="font-display text-sm font-semibold text-fg">Details</h3>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-md p-1 text-fg-subtle hover:bg-bg-sunken hover:text-fg transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-5 p-4">
                {/* Tags */}
                <div>
                  <label className="mb-2 flex items-center gap-1.5 font-label text-xs font-medium text-fg-muted">
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="group inline-flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 font-label text-xs text-fg-muted"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="rounded-full p-0.5 text-fg-subtle opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddTag()
                        }
                      }}
                      placeholder="Add tag..."
                      className={cn(
                        'flex-1 rounded-md border border-border/40 bg-bg-sunken px-2.5 py-1.5',
                        'font-body text-xs text-fg placeholder:text-fg-subtle',
                        'outline-none transition-colors',
                        'focus:border-primary/50',
                      )}
                    />
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <label className="mb-2 flex items-center gap-1.5 font-label text-xs font-medium text-fg-muted">
                    <Calendar className="h-3.5 w-3.5" />
                    Dates
                  </label>
                  <div className="space-y-1.5 text-xs text-fg-muted">
                    {createdAt && (
                      <div className="flex justify-between">
                        <span className="text-fg-subtle">Created</span>
                        <span>{createdAt}</span>
                      </div>
                    )}
                    {updatedAt && (
                      <div className="flex justify-between">
                        <span className="text-fg-subtle">Updated</span>
                        <span>{updatedAt}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Word count */}
                <div>
                  <label className="mb-2 flex items-center gap-1.5 font-label text-xs font-medium text-fg-muted">
                    <FileText className="h-3.5 w-3.5" />
                    Statistics
                  </label>
                  <div className="space-y-1.5 text-xs text-fg-muted">
                    <div className="flex justify-between">
                      <span className="text-fg-subtle">Words</span>
                      <span>{knowledge.word_count ?? wordCount}</span>
                    </div>
                  </div>
                </div>

                {/* AI Insights */}
                <div>
                  <button
                    type="button"
                    onClick={() => intelligenceMutation.mutate()}
                    disabled={intelligenceMutation.isPending}
                    className={cn(
                      'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2',
                      'bg-secondary/10 font-label text-xs font-medium text-secondary',
                      'transition-colors hover:bg-secondary/20',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      'focus-ring',
                    )}
                  >
                    {intelligenceMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Generate Intelligence
                  </button>
                </div>

                {/* AI Summary if present */}
                {knowledge.ai_summary && (
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 font-label text-xs font-medium text-fg-muted">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Summary
                    </label>
                    <p className="text-xs leading-relaxed text-fg-muted">
                      {knowledge.ai_summary}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}
