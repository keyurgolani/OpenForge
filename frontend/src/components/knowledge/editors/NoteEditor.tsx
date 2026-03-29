import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
    Bold, Italic, Heading, Link, Code, List,
    Columns2, Eye,
} from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { updateKnowledge } from '@/lib/api'
import { baseExtensions } from '@/components/knowledge/shared/CodeMirrorTheme'
import EditorShell from '@/components/knowledge/shared/EditorShell'
import EditorToolbar from '@/components/knowledge/shared/EditorToolbar'
import KnowledgeIntelligence, { GenerateIntelligenceButton, getIntelligenceCount } from '@/components/knowledge/shared/KnowledgeIntelligence'
import { useWorkspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/utils'

const mdRenderer = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface NoteEditorProps {
    knowledge: any
    workspaceId: string
}

export default function NoteEditor({ knowledge, workspaceId }: NoteEditorProps) {
    const workspace = useWorkspace(workspaceId)
    const navigate = useNavigate()
    const qc = useQueryClient()
    const editorRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)

    const [content, setContent] = useState(knowledge.content || '')
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
    const [showPreview, setShowPreview] = useState(true)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Word count
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0

    // Auto-save (debounced 700ms)
    const save = useCallback(
        (value: string) => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            setSaveStatus('saving')
            debounceRef.current = setTimeout(async () => {
                try {
                    await updateKnowledge(workspaceId, knowledge.id, { content: value })
                    setSaveStatus('saved')
                    qc.invalidateQueries({ queryKey: ['knowledge'] })
                    // Reset saved indicator after 2s
                    setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
                } catch {
                    setSaveStatus('error')
                }
            }, 700)
        },
        [workspaceId, knowledge.id, qc],
    )

    // Initialize CodeMirror
    useEffect(() => {
        if (!editorRef.current) return

        const state = EditorState.create({
            doc: knowledge.content || '',
            extensions: [
                ...baseExtensions,
                lineNumbers(),
                history(),
                keymap.of([...defaultKeymap, ...historyKeymap]),
                markdown(),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        const doc = update.state.doc.toString()
                        setContent(doc)
                        save(doc)
                    }
                }),
                EditorView.lineWrapping,
            ],
        })

        const view = new EditorView({ state, parent: editorRef.current })
        viewRef.current = view

        return () => view.destroy()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [])

    // Formatting toolbar helpers
    const insertAround = (before: string, after: string) => {
        const view = viewRef.current
        if (!view) return
        const { from, to } = view.state.selection.main
        const selected = view.state.sliceDoc(from, to)
        view.dispatch({
            changes: { from, to, insert: `${before}${selected}${after}` },
            selection: { anchor: from + before.length, head: to + before.length },
        })
        view.focus()
    }

    const insertAtLineStart = (prefix: string) => {
        const view = viewRef.current
        if (!view) return
        const { from } = view.state.selection.main
        const line = view.state.doc.lineAt(from)
        view.dispatch({
            changes: { from: line.from, to: line.from, insert: prefix },
        })
        view.focus()
    }

    const toolbarButtons = [
        { icon: Bold, label: 'Bold', action: () => insertAround('**', '**') },
        { icon: Italic, label: 'Italic', action: () => insertAround('_', '_') },
        { icon: Heading, label: 'Heading', action: () => insertAtLineStart('## ') },
        { icon: Link, label: 'Link', action: () => insertAround('[', '](url)') },
        { icon: Code, label: 'Code', action: () => insertAround('`', '`') },
        { icon: List, label: 'List', action: () => insertAtLineStart('- ') },
    ]

    const previewHtml = mdRenderer.render(content)

    return (
        <EditorShell
            toolbar={
                <EditorToolbar
                    onBack={() => navigate(`/w/${workspaceId}/knowledge`)}
                    title={knowledge.title || knowledge.ai_title || 'Untitled Note'}
                    saveStatus={saveStatus}
                    actions={
                        <>
                            {/* Formatting buttons */}
                            <div className="hidden sm:flex items-center gap-0.5 mr-2 border-r border-border/20 pr-2">
                                {toolbarButtons.map((btn) => (
                                    <button
                                        key={btn.label}
                                        type="button"
                                        onClick={btn.action}
                                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                        title={btn.label}
                                        aria-label={btn.label}
                                    >
                                        <btn.icon className="w-4 h-4" />
                                    </button>
                                ))}
                            </div>

                            {/* Split preview toggle */}
                            <button
                                type="button"
                                onClick={() => setShowPreview(!showPreview)}
                                className={cn(
                                    'p-1.5 rounded-lg transition-colors',
                                    showPreview
                                        ? 'text-accent-foreground bg-accent/25'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                                )}
                                title={showPreview ? 'Hide preview' : 'Show preview'}
                                aria-label={showPreview ? 'Hide preview' : 'Show preview'}
                            >
                                {showPreview ? (
                                    <Columns2 className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>

                            {/* Word count */}
                            <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
                                {wordCount.toLocaleString()} words
                            </span>

                            {/* Generate intelligence */}
                            <GenerateIntelligenceButton knowledge={knowledge} workspaceId={workspaceId} />
                        </>
                    }
                />
            }
            siderail={(onCollapse) => (
                <KnowledgeIntelligence
                    knowledge={knowledge}
                    workspaceId={workspaceId}
                    onCollapse={onCollapse}
                    categories={(workspace as any)?.intelligence_categories}
                />
            )}
            railItemCount={getIntelligenceCount(knowledge, (workspace as any)?.intelligence_categories)}
        >
            <div className={cn('flex-1 min-h-0', showPreview ? 'flex' : 'flex flex-col')}>
                {/* Editor pane */}
                <div
                    ref={editorRef}
                    className={cn(
                        'min-h-0 flex-1 overflow-y-auto',
                        showPreview ? 'w-1/2 border-r border-border/20' : 'w-full',
                    )}
                />

                {/* Preview pane */}
                {showPreview && (
                    <div className="w-1/2 min-h-0 flex-1 overflow-y-auto px-6 py-4">
                        <div
                            className="prose prose-sm dark:prose-invert max-w-none text-foreground/85 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                    </div>
                )}
            </div>
        </EditorShell>
    )
}
