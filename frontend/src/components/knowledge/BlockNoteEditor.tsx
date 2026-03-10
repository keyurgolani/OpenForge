import { useEffect, useMemo } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import type { Theme } from '@blocknote/mantine'

// CSS is imported in main.tsx:
//   import '@blocknote/core/fonts/inter.css'
//   import '@blocknote/mantine/style.css'

interface BlockNoteEditorProps {
    initialContent?: string
    onChange?: (markdown: string) => void
    editable?: boolean
    placeholder?: string
    className?: string
}

/** Build a BlockNote theme object from the current CSS custom properties so the
 *  editor is styled consistently with the rest of the application. */
function buildThemeFromCSSVars(): Theme {
    const root = document.documentElement
    const s = getComputedStyle(root)
    const hsl = (v: string) => `hsl(${s.getPropertyValue(v).trim()})`
    const hsla = (v: string, a: number) => {
        const val = s.getPropertyValue(v).trim()
        // val is like "224 43% 7%"
        const [h, sat, l] = val.split(' ')
        return `hsla(${h}, ${sat}, ${l}, ${a})`
    }

    return {
        colors: {
            editor: {
                text: hsl('--foreground'),
                background: 'transparent',
            },
            menu: {
                text: hsl('--foreground'),
                background: hsl('--card'),
            },
            tooltip: {
                text: hsl('--foreground'),
                background: hsl('--card'),
            },
            hovered: {
                text: hsl('--foreground'),
                background: hsl('--muted'),
            },
            selected: {
                text: hsl('--accent-foreground'),
                background: hsl('--accent'),
            },
            disabled: {
                text: hsl('--muted-foreground'),
                background: hsl('--muted'),
            },
            shadow: hsla('--border', 0.6),
            border: hsl('--border'),
            sideMenu: hsl('--muted-foreground'),
        },
        borderRadius: 8,
        fontFamily: 'inherit',
    }
}

export default function BlockNoteEditor({
    initialContent,
    onChange,
    editable = true,
    className,
}: BlockNoteEditorProps) {
    const editor = useCreateBlockNote()
    const theme = useMemo(() => buildThemeFromCSSVars(), [])

    // Load initial content on mount only
    useEffect(() => {
        if (!initialContent?.trim()) return
        ;(async () => {
            const blocks = initialContent.trim().startsWith('<')
                ? await editor.tryParseHTMLToBlocks(initialContent)
                : await editor.tryParseMarkdownToBlocks(initialContent)
            editor.replaceBlocks(editor.document, blocks)
        })()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className={className}>
            <BlockNoteView
                editor={editor}
                editable={editable}
                theme={theme}
                onChange={() => {
                    onChange?.(editor.blocksToMarkdownLossy(editor.document))
                }}
            />
        </div>
    )
}

export function BlockNoteViewer({ content, className }: { content: string; className?: string }) {
    return <BlockNoteEditor initialContent={content} editable={false} className={className} />
}
