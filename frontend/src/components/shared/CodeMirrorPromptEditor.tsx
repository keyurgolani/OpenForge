import { useEffect, useRef } from 'react'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'

import { baseExtensions } from '@/components/knowledge/shared/CodeMirrorTheme'

interface CodeMirrorPromptEditorProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
}

export default function CodeMirrorPromptEditor({
    value,
    onChange,
    placeholder,
}: CodeMirrorPromptEditorProps) {
    const editorRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<EditorView | null>(null)

    useEffect(() => {
        if (!editorRef.current) return

        const state = EditorState.create({
            doc: value,
            extensions: [
                ...baseExtensions,
                history(),
                keymap.of([...defaultKeymap, ...historyKeymap]),
                markdown(),
                EditorView.lineWrapping,
                cmPlaceholder(placeholder ?? ''),
                EditorView.theme({
                    '&': {
                        minHeight: '140px',
                    },
                    '.cm-content': {
                        minHeight: '140px',
                        padding: '12px 14px',
                    },
                }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChange(update.state.doc.toString())
                    }
                }),
            ],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- CodeMirror editor initialized once on mount
    }, [])

    useEffect(() => {
        const view = viewRef.current
        if (!view) return

        const currentValue = view.state.doc.toString()
        if (currentValue === value) return

        view.dispatch({
            changes: {
                from: 0,
                to: currentValue.length,
                insert: value,
            },
        })
    }, [value])

    return (
        <div
            ref={editorRef}
            className="input w-full overflow-hidden rounded-lg border border-border/25 bg-background/40 text-xs font-mono"
        />
    )
}
