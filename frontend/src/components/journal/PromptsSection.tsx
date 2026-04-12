import { useState, MutableRefObject } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { CURATED_PROMPTS } from './prompts'
import type { JournalComposerHandle } from './JournalComposer'

const SECTION_KEY = 'journal-rail-section-prompts'

interface PromptsSectionProps {
  composerRef: MutableRefObject<JournalComposerHandle | null>
  disabled: boolean
}

export function PromptsSection({ composerRef, disabled }: PromptsSectionProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SECTION_KEY) === '1'
  })

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(SECTION_KEY, next ? '1' : '0')
  }

  const handleClick = (body: string) => {
    composerRef.current?.prefill(body)
  }

  return (
    <section className="border-t border-border/20 pt-3">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 hover:text-foreground transition-colors px-1"
      >
        <span>Prompts</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      {!collapsed && (
        <div
          className="mt-2 flex flex-col gap-1 px-1"
          title={disabled ? 'Switch to today\'s date to use prompts' : undefined}
        >
          {CURATED_PROMPTS.map(p => (
            <button
              key={p.label}
              onClick={() => handleClick(p.body)}
              disabled={disabled}
              className="flex items-center gap-1.5 text-xs text-left rounded-md border border-border/25 bg-card/20 px-2 py-1.5 text-foreground/85 hover:border-amber-500/30 hover:bg-amber-500/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
