import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { updateKnowledge } from '@/lib/api'
import { baseExtensions } from '@/components/knowledge/shared/CodeMirrorTheme'
import EditorShell from '@/components/knowledge/shared/EditorShell'
import EditorToolbar from '@/components/knowledge/shared/EditorToolbar'
import KnowledgeIntelligence, { GenerateIntelligenceButton, getIntelligenceCount } from '@/components/knowledge/shared/KnowledgeIntelligence'
import { useWorkspace } from '@/hooks/useWorkspace'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const GIST_LANGUAGES = [
    'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'c', 'cpp',
    'csharp', 'php', 'ruby', 'swift', 'kotlin', 'scala', 'shell', 'sql',
    'html', 'css', 'json', 'yaml', 'toml', 'markdown', 'plaintext',
]

async function getLanguageExtension(lang: string): Promise<Extension> {
    switch (lang?.toLowerCase()) {
        case 'javascript':
            return (await import('@codemirror/lang-javascript')).javascript()
        case 'typescript':
            return (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
        case 'html':
            return (await import('@codemirror/lang-html')).html()
        case 'css':
            return (await import('@codemirror/lang-css')).css()
        case 'markdown':
            return (await import('@codemirror/lang-markdown')).markdown()
        default:
            return []
    }
}

interface GistEditorProps {
    knowledge: any
    workspaceId: string
}

export default function GistEditor({ knowledge, workspaceId }: GistEditorProps) {
    const workspace = useWorkspace(workspaceId)
    const navigate = useNavigate()
    const qc = useQueryClient()
    const editorRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)

    const [language, setLanguage] = useState(knowledge.gist_language || 'typescript')
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
    const [showLangPicker, setShowLangPicker] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const contentRef = useRef(knowledge.content || '')

    // Auto-save (debounced 700ms)
    const save = useCallback(
        (data: { content?: string; gist_language?: string }) => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            setSaveStatus('saving')
            debounceRef.current = setTimeout(async () => {
                try {
                    await updateKnowledge(workspaceId, knowledge.id, data)
                    setSaveStatus('saved')
                    qc.invalidateQueries({ queryKey: ['knowledge'] })
                    setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
                } catch {
                    setSaveStatus('error')
                }
            }, 700)
        },
        [workspaceId, knowledge.id, qc],
    )

    // Initialize + reinitialize CodeMirror when language changes
    useEffect(() => {
        if (!editorRef.current) return

        let destroyed = false
        const init = async () => {
            const langExt = await getLanguageExtension(language)
            if (destroyed) return

            // Destroy previous instance
            if (viewRef.current) {
                contentRef.current = viewRef.current.state.doc.toString()
                viewRef.current.destroy()
                viewRef.current = null
            }

            if (!editorRef.current) return

            const state = EditorState.create({
                doc: contentRef.current,
                extensions: [
                    ...baseExtensions,
                    lineNumbers(),
                    history(),
                    keymap.of([...defaultKeymap, ...historyKeymap]),
                    langExt,
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            const doc = update.state.doc.toString()
                            contentRef.current = doc
                            save({ content: doc })
                        }
                    }),
                ],
            })

            const view = new EditorView({ state, parent: editorRef.current })
            viewRef.current = view
        }

        init()

        return () => {
            destroyed = true
            if (viewRef.current) {
                contentRef.current = viewRef.current.state.doc.toString()
                viewRef.current.destroy()
                viewRef.current = null
            }
        }
    }, [language]) // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [])

    const handleLanguageChange = (lang: string) => {
        setLanguage(lang)
        setShowLangPicker(false)
        save({ gist_language: lang })
    }

    return (
        <EditorShell
            toolbar={
                <EditorToolbar
                    onBack={() => navigate(`/w/${workspaceId}/knowledge`)}
                    title={knowledge.title || knowledge.ai_title || 'Gist'}
                    saveStatus={saveStatus}
                    actions={
                        <>
                            {/* Language selector */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowLangPicker(!showLangPicker)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-muted/40 text-foreground hover:bg-muted/60 transition-colors"
                                >
                                    {language}
                                    <ChevronDown className="w-3 h-3" />
                                </button>

                                {showLangPicker && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowLangPicker(false)}
                                        />
                                        <div className="absolute right-0 top-full mt-1 z-50 w-44 max-h-64 overflow-y-auto rounded-lg border border-border/25 bg-card shadow-xl">
                                            {GIST_LANGUAGES.map((lang) => (
                                                <button
                                                    key={lang}
                                                    type="button"
                                                    onClick={() => handleLanguageChange(lang)}
                                                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors ${
                                                        lang === language
                                                            ? 'text-accent-foreground bg-accent/15'
                                                            : 'text-foreground'
                                                    }`}
                                                >
                                                    {lang}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

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
            <div ref={editorRef} className="flex-1 min-h-0 overflow-y-auto" />
        </EditorShell>
    )
}
