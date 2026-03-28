import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import AccordionSection from './AccordionSection'

interface TagsSectionProps {
  value: string[]
  onChange: (tags: string[]) => void
  isEditing: boolean
  expanded?: boolean
  onToggle?: () => void
}

export default function TagsSection({
  value,
  onChange,
  isEditing,
  expanded,
  onToggle,
}: TagsSectionProps) {
  const [input, setInput] = useState('')
  const summary = value.length > 0 ? value.join(', ') : 'None'

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase()
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
    }
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const handleBlur = () => {
    if (input.trim()) addTag(input)
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  return (
    <AccordionSection
      title="Tags"
      summary={summary}
      icon={Tag}
      isEditing={isEditing}
      expanded={expanded}
      onToggle={onToggle}
    >
      {isEditing ? (
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-background/30 px-2 py-1.5 focus-within:border-accent/50 transition-colors cursor-text"
          onClick={(e) => {
            const inp = (e.currentTarget as HTMLElement).querySelector('input')
            inp?.focus()
          }}
        >
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-accent/15 border border-accent/20 px-1.5 py-0.5 text-[11px] font-medium text-accent"
            >
              {tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                className="text-accent/50 hover:text-accent transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <input
            className="flex-1 min-w-[60px] bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={value.length === 0 ? 'Type and press Enter...' : 'Add...'}
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {value.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">No tags</span>
          ) : (
            value.map((tag) => (
              <span key={tag} className="rounded-md bg-muted/40 px-2 py-0.5 text-xs text-foreground/70">
                {tag}
              </span>
            ))
          )}
        </div>
      )}
    </AccordionSection>
  )
}
