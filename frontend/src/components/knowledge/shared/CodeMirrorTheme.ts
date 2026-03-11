import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const liquidGlassTheme = EditorView.theme({
    '&': {
        backgroundColor: 'transparent',
        color: 'var(--foreground)',
        fontSize: '14px',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
    },
    '.cm-content': {
        caretColor: 'var(--foreground)',
        padding: '12px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--foreground)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'hsla(var(--accent) / 0.2)',
    },
    '.cm-activeLine': {
        backgroundColor: 'hsla(var(--muted) / 0.15)',
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--muted-foreground)',
        border: 'none',
        paddingRight: '8px',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'var(--foreground)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 16px',
    },
    '.cm-scroller': {
        overflow: 'auto',
    },
}, { dark: true })

export const liquidGlassHighlight = HighlightStyle.define([
    { tag: tags.keyword, color: 'hsl(270, 95%, 75%)' },
    { tag: tags.string, color: 'hsl(95, 80%, 68%)' },
    { tag: tags.number, color: 'hsl(30, 95%, 72%)' },
    { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
    { tag: tags.function(tags.variableName), color: 'hsl(210, 95%, 72%)' },
    { tag: tags.typeName, color: 'hsl(180, 80%, 68%)' },
    { tag: tags.propertyName, color: 'hsl(210, 80%, 78%)' },
    { tag: tags.operator, color: 'hsl(350, 85%, 72%)' },
    { tag: tags.bool, color: 'hsl(30, 95%, 72%)' },
    { tag: tags.definition(tags.variableName), color: 'hsl(50, 95%, 72%)' },
])

export const baseExtensions = [
    liquidGlassTheme,
    syntaxHighlighting(liquidGlassHighlight),
]
