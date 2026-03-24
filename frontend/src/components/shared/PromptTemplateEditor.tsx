import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers, highlightActiveLineGutter, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { templateLanguage } from './prompt-template-language'
import type { TemplateReferenceData } from '@/types/deployments'

// Extract parameter types from YAML frontmatter
function extractParamTypes(content: string): Map<string, string> {
  const types = new Map<string, string>()
  // Match YAML frontmatter between --- delimiters
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return types

  const frontmatter = fmMatch[1]
  // Simple YAML parser for parameters section: find "- name: X" followed by "type: Y"
  const paramRegex = /- name:\s*(\w+)\s*\n\s*type:\s*(\w+)/g
  let m
  while ((m = paramRegex.exec(frontmatter)) !== null) {
    types.set(m[1], m[2])
  }
  return types
}

// Reserved identifiers that should never appear in the detected list
const SYSTEM_PREFIXES = ['system.', 'output.']
const BUILTIN_FUNCTIONS = new Set([
  'default', 'upper', 'lower', 'trim', 'replace', 'split', 'join',
  'length', 'slice', 'contains', 'startsWith', 'endsWith', 'reverse',
  'sort', 'unique', 'first', 'last', 'flatten', 'map', 'filter',
  'keys', 'values', 'entries', 'merge', 'abs', 'ceil', 'floor',
  'round', 'min', 'max', 'sum', 'avg', 'range', 'random',
  'now', 'formatDate', 'parseDate', 'json', 'yaml', 'toNumber',
  'ternary', 'coalesce', 'typeOf', 'isString', 'isNumber',
  'isArray', 'isObject', 'isBool', 'toString',
])
function isUserVariable(name: string): boolean {
  if (BUILTIN_FUNCTIONS.has(name)) return false
  if (SYSTEM_PREFIXES.some((p) => name.startsWith(p))) return false
  return true
}

// Extract variables from template content for live preview
function extractVariables(content: string): Array<{ name: string; type: string }> {
  const vars: Array<{ name: string; type: string }> = []
  const seen = new Set<string>()
  const paramTypes = extractParamTypes(content)

  const addVar = (name: string, typeHint?: string) => {
    if (seen.has(name) || !isUserVariable(name)) return
    seen.add(name)
    vars.push({ name, type: typeHint || paramTypes.get(name) || 'text' })
  }

  // Match simple {{ variable }} and {{ variable::type }} expressions
  const braceRegex = /\{\{\s*([a-zA-Z_][\w.-]*)(::([^\}]*))?\s*\}\}/g
  let match
  while ((match = braceRegex.exec(content)) !== null) {
    addVar(match[1], match[3]?.trim())
  }

  // Match {{ functionName(arg1, arg2, ...) }} — extract variable arguments
  const funcRegex = /\{\{\s*([a-zA-Z_]\w*)\(([^)]*)\)\s*\}\}/g
  while ((match = funcRegex.exec(content)) !== null) {
    const argsStr = match[2]
    // Match bare identifiers that are not quoted strings or numbers
    const argVarRegex = /(?:^|,)\s*([a-zA-Z_][\w.]*)/g
    let argMatch
    while ((argMatch = argVarRegex.exec(argsStr)) !== null) {
      addVar(argMatch[1])
    }
  }

  // Match variables in {% if variable_name %} and {% if variable_name == "value" %} blocks
  const controlRegex = /\{%[-\s]+if\s+([a-zA-Z_][\w.-]*)\s*(?:[=!<>]|%\})/g
  while ((match = controlRegex.exec(content)) !== null) {
    addVar(match[1])
  }

  // Match variables in {% for item in collection %} — detect collection variable
  const forRegex = /\{%[-\s]+for\s+\w+\s+in\s+([a-zA-Z_][\w.]*)\s*%\}/g
  while ((match = forRegex.exec(content)) !== null) {
    addVar(match[1])
  }

  return vars
}

// Highlights {{vars}} and {% control %} in read-only sections
function TemplateHighlight({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]+\}\}|\{%[^%]+%\})/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('{{')) {
          return <span key={i} className="text-[#e06c75]">{part}</span>
        }
        if (part.startsWith('{%')) {
          return <span key={i} className="text-[#c678dd]">{part}</span>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

interface PromptTemplateEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  referenceData?: TemplateReferenceData | null
  className?: string
  preamble?: string
  postamble?: string
}

export default function PromptTemplateEditor({
  value,
  onChange,
  readOnly = false,
  referenceData,
  className = '',
  preamble,
  postamble,
}: PromptTemplateEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Build autocomplete function
    function templateCompletion(context: CompletionContext): CompletionResult | null {
      // Check for {{ trigger
      const before = context.matchBefore(/\{\{\s*\w*/)
      if (before) {
        const options: Array<{ label: string; type: string; detail?: string }> = []
        // Add existing variables
        for (const v of extractVariables(context.state.doc.toString())) {
          options.push({ label: v.name, type: 'variable', detail: v.type })
        }
        // Add system variables from reference data
        if (referenceData?.system_variables) {
          for (const sv of referenceData.system_variables) {
            if (!options.some((o) => o.label === sv.name)) {
              options.push({ label: sv.name, type: 'variable', detail: `system · ${sv.description}` })
            }
          }
        }
        // Add functions from reference data
        if (referenceData) {
          for (const fn of referenceData.functions) {
            options.push({ label: fn.name + '()', type: 'function', detail: fn.signature })
          }
        }
        return { from: before.from + 2, options } // +2 to skip {{
      }

      // Check for {% trigger
      const controlBefore = context.matchBefore(/\{%\s*\w*/)
      if (controlBefore) {
        return {
          from: controlBefore.from + 2,
          options: [
            { label: ' if  %}', type: 'keyword', detail: 'Conditional block' },
            { label: ' for  in  %}', type: 'keyword', detail: 'Loop block' },
            { label: ' else %}', type: 'keyword', detail: 'Else branch' },
            { label: ' endif %}', type: 'keyword', detail: 'End conditional' },
            { label: ' endfor %}', type: 'keyword', detail: 'End loop' },
          ],
        }
      }

      return null
    }

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      templateLanguage,
      oneDark,
      autocompletion({ override: [templateCompletion] }),
      EditorView.lineWrapping,
      EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChange) {
          onChange(update.state.doc.toString())
        }
      }),
    ]

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true))
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  const [preambleOpen, setPreambleOpen] = useState(false)
  const [postambleOpen, setPostambleOpen] = useState(false)

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="rounded-xl border border-border/60 overflow-y-auto min-h-0 flex flex-col flex-1">
        {preamble && (
          <div
            className="shrink-0"
            style={{
              background: 'rgba(40, 44, 52, 0.5)',
              borderBottom: '1px dashed rgba(255, 255, 255, 0.06)',
            }}
          >
            <button
              type="button"
              onClick={() => setPreambleOpen(!preambleOpen)}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium tracking-wide uppercase hover:bg-white/[0.03] transition-colors"
              style={{ color: 'rgba(171, 178, 191, 0.6)' }}
            >
              <span className="inline-block transition-transform" style={{ transform: preambleOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
              System Preamble
            </button>
            {preambleOpen && (
              <div
                className="px-4 pb-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{ color: 'rgba(171, 178, 191, 0.55)' }}
              >
                <TemplateHighlight text={preamble} />
              </div>
            )}
          </div>
        )}
        <div
          ref={containerRef}
          className="min-h-[200px] font-mono text-sm flex-1"
        />
        {postamble && (
          <div
            className="shrink-0"
            style={{
              background: 'rgba(40, 44, 52, 0.5)',
              borderTop: '1px dashed rgba(255, 255, 255, 0.06)',
            }}
          >
            <button
              type="button"
              onClick={() => setPostambleOpen(!postambleOpen)}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium tracking-wide uppercase hover:bg-white/[0.03] transition-colors"
              style={{ color: 'rgba(171, 178, 191, 0.6)' }}
            >
              <span className="inline-block transition-transform" style={{ transform: postambleOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
              System Postamble
            </button>
            {postambleOpen && (
              <div
                className="px-4 pb-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap"
                style={{ color: 'rgba(171, 178, 191, 0.55)' }}
              >
                <TemplateHighlight text={postamble} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export { extractVariables }
