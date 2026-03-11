import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface InlineEditTitleProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
}

export default function InlineEditTitle({
    value,
    onChange,
    placeholder = 'Untitled',
}: InlineEditTitleProps) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    const inputRef = useRef<HTMLInputElement>(null)

    // Sync draft when value changes externally
    useEffect(() => {
        if (!editing) setDraft(value)
    }, [value, editing])

    // Focus and select text when entering edit mode
    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [editing])

    const commit = useCallback(() => {
        setEditing(false)
        const trimmed = draft.trim()
        if (trimmed && trimmed !== value) {
            onChange(trimmed)
        } else {
            setDraft(value)
        }
    }, [draft, value, onChange])

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            commit()
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(value)
            setEditing(false)
        }
    }, [commit, value])

    if (editing) {
        return (
            <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                className={cn(
                    'w-full text-2xl font-bold bg-transparent outline-none',
                    'text-foreground placeholder:text-muted-foreground/50',
                    'border-b-2 border-accent/40 focus:border-accent transition-colors',
                    'pb-1',
                )}
                placeholder={placeholder}
            />
        )
    }

    return (
        <h1
            onClick={() => setEditing(true)}
            className={cn(
                'text-2xl font-bold cursor-text pb-1 border-b-2 border-transparent',
                value ? 'text-foreground' : 'text-muted-foreground/50',
                'hover:border-border/40 transition-colors',
            )}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setEditing(true)
                }
            }}
        >
            {value || placeholder}
        </h1>
    )
}
