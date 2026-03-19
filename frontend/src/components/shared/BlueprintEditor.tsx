/**
 * BlueprintEditor - CodeMirror-based editor for agent blueprint markdown.
 */

import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'

interface BlueprintEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}

export default function BlueprintEditor({ value, onChange, readOnly = false }: BlueprintEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        markdown(),
        oneDark,
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChange(update.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only recreate editor when readOnly changes; value sync is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  // Sync external value changes into the editor without recreating it
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-border/60 bg-background/50 overflow-hidden [&_.cm-editor]:min-h-[400px] [&_.cm-editor]:text-sm [&_.cm-scroller]:font-mono"
    />
  )
}
