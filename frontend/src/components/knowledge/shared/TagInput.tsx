import { useState, useCallback, useRef, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TagInputProps {
    tags: string[]
    onChange: (tags: string[]) => void
    placeholder?: string
}

function normalizeTag(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

export default function TagInput({
    tags,
    onChange,
    placeholder = 'Add tag...',
}: TagInputProps) {
    const [input, setInput] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const addTag = useCallback((raw: string) => {
        const tag = normalizeTag(raw)
        if (tag && !tags.includes(tag)) {
            onChange([...tags, tag])
        }
        setInput('')
    }, [tags, onChange])

    const removeTag = useCallback((tagToRemove: string) => {
        onChange(tags.filter((t) => t !== tagToRemove))
    }, [tags, onChange])

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault()
            addTag(input)
        }
        if (e.key === 'Backspace' && !input && tags.length > 0) {
            removeTag(tags[tags.length - 1])
        }
    }, [input, tags, addTag, removeTag])

    return (
        <div
            className={cn(
                'flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-xl',
                'border border-border/60 bg-background/30',
                'focus-within:border-accent/50 transition-colors cursor-text',
            )}
            onClick={() => inputRef.current?.focus()}
        >
            {tags.map((tag) => (
                <span
                    key={tag}
                    className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg',
                        'text-xs font-medium text-foreground/80',
                        'bg-accent/15 border border-accent/20',
                    )}
                >
                    {tag}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            removeTag(tag)
                        }}
                        className="p-0.5 rounded hover:bg-accent/25 transition-colors text-muted-foreground hover:text-foreground"
                        aria-label={`Remove tag ${tag}`}
                    >
                        <X className="w-3 h-3" />
                    </button>
                </span>
            ))}

            <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                    if (input.trim()) addTag(input)
                }}
                placeholder={tags.length === 0 ? placeholder : ''}
                className="flex-1 min-w-[80px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
        </div>
    )
}
