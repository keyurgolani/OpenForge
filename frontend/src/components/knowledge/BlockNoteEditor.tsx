import { useEffect } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'

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

export default function BlockNoteEditor({
    initialContent,
    onChange,
    editable = true,
    className,
}: BlockNoteEditorProps) {
    const editor = useCreateBlockNote()

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
                theme="dark"
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
