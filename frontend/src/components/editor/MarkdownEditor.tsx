import { useEffect, useRef, useCallback, useState } from 'react'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { EditorState, Prec, Transaction } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { vim } from '@replit/codemirror-vim'
import { history, historyKeymap, undo, redo } from '@codemirror/commands'

interface MarkdownEditorProps {
    value: string
    onChange: (value: string) => void
    onSave?: () => void
    placeholder?: string
    className?: string
    vimMode?: boolean
    autoFocus?: boolean
}

// Custom Liquid Glass theme for CodeMirror
const liquidGlassTheme = EditorView.theme({
    '&': {
        backgroundColor: 'transparent',
        color: 'var(--color-text-primary, #f0f0f0)',
        fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
        fontSize: 'var(--text-sm, 0.875rem)',
        lineHeight: 'var(--leading-relaxed, 1.625)',
        height: '100%',
    },
    '.cm-scroller': {
        fontFamily: 'inherit',
        lineHeight: 'inherit',
        overflow: 'auto',
    },
    '.cm-content': {
        padding: '0',
        caretColor: 'var(--color-accent, #2dd4bf)',
    },
    '.cm-cursor': {
        borderLeftColor: 'var(--color-accent, #2dd4bf)',
        borderLeftWidth: '2px',
    },
    '.cm-selectionBackground': {
        backgroundColor: 'var(--color-accent-subtle, rgba(45, 212, 191, 0.15)) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(45, 212, 191, 0.25) !important',
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: 'none',
        color: 'var(--color-text-tertiary, #888)',
    },
    '.cm-gutter': {
        minWidth: '40px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 4px',
    },
    // Markdown-specific highlighting
    '.cm-header-1': { fontSize: '1.5em', fontWeight: '600' },
    '.cm-header-2': { fontSize: '1.35em', fontWeight: '600' },
    '.cm-header-3': { fontSize: '1.2em', fontWeight: '600' },
    '.cm-header-4': { fontSize: '1.1em', fontWeight: '600' },
    '.cm-header-5': { fontSize: '1em', fontWeight: '600' },
    '.cm-header-6': { fontSize: '0.9em', fontWeight: '600' },
    '.cm-strong': { fontWeight: '700' },
    '.cm-emphasis': { fontStyle: 'italic' },
    '.cm-strikethrough': { textDecoration: 'line-through' },
    '.cm-monospace': {
        fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
        backgroundColor: 'var(--color-bg-glass, rgba(255, 255, 255, 0.05))',
        borderRadius: '4px',
        padding: '1px 4px',
    },
    '.cm-link': { color: 'var(--color-accent, #2dd4bf)' },
    '.cm-url': { color: 'var(--color-text-tertiary, #888)' },
    '.cm-quote': { color: 'var(--color-text-secondary, #a0a0a0)', fontStyle: 'italic' },
    '.cm-list': { color: 'var(--color-accent, #2dd4bf)' },
    '.cm-meta': { color: 'var(--color-text-tertiary, #888)' },
    // Placeholder styling
    '.cm-placeholder': {
        color: 'var(--color-text-tertiary, #888)',
        fontStyle: 'italic',
    },
})

// Helper function to wrap selection with markdown syntax
const wrapSelection = (view: EditorView, before: string, after: string = '') => {
    const { state } = view
    const { from, to } = state.selection.main
    const selected = state.doc.sliceString(from, to)

    const transaction = state.update({
        changes: {
            from,
            to,
            insert: before + selected + after,
        },
        selection: {
            anchor: from + before.length,
            head: from + before.length + selected.length,
        },
    })

    view.dispatch(transaction)
    view.focus()
    return true
}

// Helper to insert text at cursor
const insertAtCursor = (view: EditorView, text: string) => {
    const { state } = view
    const { from, to } = state.selection.main

    const transaction = state.update({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
    })

    view.dispatch(transaction)
    view.focus()
    return true
}

export default function MarkdownEditor({
    value,
    onChange,
    onSave,
    placeholder: placeholderText = 'Start writing… (Markdown supported)',
    className = '',
    vimMode = false,
    autoFocus = false,
}: MarkdownEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const [isVimMode, setIsVimMode] = useState(vimMode)

    // Handle document changes
    const updateListener = useCallback(
        (update: { docChanged: boolean; state: EditorState }) => {
            if (update.docChanged) {
                const newValue = update.state.doc.toString()
                onChange(newValue)
            }
        },
        [onChange]
    )

    // Create keymap with formatting shortcuts
    const createKeymap = useCallback(
        (view: EditorView) => [
            // Bold: Ctrl/Cmd + B
            keymap.of([
                {
                    key: 'Mod-b',
                    run: () => wrapSelection(view, '**', '**'),
                },
                {
                    key: 'Mod-i',
                    run: () => wrapSelection(view, '*', '*'),
                },
                {
                    key: 'Mod-`',
                    run: () => wrapSelection(view, '`', '`'),
                },
                {
                    key: 'Mod-k',
                    run: () => {
                        const { state } = view
                        const { from, to } = state.selection.main
                        const selected = state.doc.sliceString(from, to)
                        const linkText = `[${selected || 'link text'}](url)`
                        return insertAtCursor(view, linkText)
                    },
                },
                {
                    key: 'Mod-s',
                    run: () => {
                        onSave?.()
                        return true
                    },
                },
                // Undo/Redo
                { key: 'Mod-z', run: () => undo(view) },
                { key: 'Mod-y', run: () => redo(view) },
                { key: 'Mod-Shift-z', run: () => redo(view) },
            ]),
        ],
        [onSave]
    )

    // Initialize editor
    useEffect(() => {
        if (!editorRef.current || viewRef.current) return

        const extensions = [
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            EditorView.lineWrapping,
            liquidGlassTheme,
            placeholder(placeholderText),
            history(),
            EditorView.updateListener.of(updateListener),
            // Keymaps will be added dynamically
        ]

        // Add vim mode if enabled
        if (isVimMode) {
            extensions.push(vim())
        }

        const state = EditorState.create({
            doc: value,
            extensions: [...extensions, ...createKeymap(viewRef.current! as unknown as EditorView)],
        })

        const view = new EditorView({
            state,
            parent: editorRef.current,
        })

        viewRef.current = view

        if (autoFocus) {
            view.focus()
        }

        return () => {
            view.destroy()
            viewRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVimMode])

    // Update editor content when value prop changes externally
    useEffect(() => {
        const view = viewRef.current
        if (!view) return

        const currentValue = view.state.doc.toString()
        if (value !== currentValue) {
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: value,
                },
            })
        }
    }, [value])

    // Toggle vim mode
    const toggleVimMode = useCallback(() => {
        setIsVimMode((prev) => !prev)
        // Re-initialize editor with new vim mode setting
        if (viewRef.current) {
            viewRef.current.destroy()
            viewRef.current = null
        }
    }, [])

    // Public method to insert markdown (used by toolbar buttons)
    const insertMarkdown = useCallback((before: string, after: string = '') => {
        const view = viewRef.current
        if (!view) return
        wrapSelection(view, before, after)
    }, [])

    // Expose toggleVimMode and insertMarkdown via ref or window for external use
    useEffect(() => {
        const editor = editorRef.current
        if (editor) {
            ;(editor as HTMLDivElement & { insertMarkdown: typeof insertMarkdown; toggleVimMode: typeof toggleVimMode }).insertMarkdown = insertMarkdown
            ;(editor as HTMLDivElement & { insertMarkdown: typeof insertMarkdown; toggleVimMode: typeof toggleVimMode }).toggleVimMode = toggleVimMode
        }
    }, [insertMarkdown, toggleVimMode])

    return (
        <div
            ref={editorRef}
            className={`cm-editor-container min-h-0 flex-1 overflow-hidden ${className}`}
            style={{ height: '100%' }}
        />
    )
}

// Export helper function for external markdown insertion
export function useMarkdownEditor() {
    const editorRef = useRef<HTMLDivElement>(null)

    const insertMarkdown = useCallback((before: string, after: string = '') => {
        const editor = editorRef.current as HTMLDivElement & { insertMarkdown: (before: string, after: string) => void } | null
        editor?.insertMarkdown?.(before, after)
    }, [])

    const toggleVimMode = useCallback(() => {
        const editor = editorRef.current as HTMLDivElement & { toggleVimMode: () => void } | null
        editor?.toggleVimMode?.()
    }, [])

    return { editorRef, insertMarkdown, toggleVimMode }
}
