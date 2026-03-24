import { useState, type ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export interface AccordionSectionProps {
  title: string
  summary: string
  icon?: LucideIcon
  defaultExpanded?: boolean
  children: ReactNode
  isEditing?: boolean
  /** Controlled mode: whether this section is expanded */
  expanded?: boolean
  /** Controlled mode: called when user toggles */
  onToggle?: () => void
}

export default function AccordionSection({
  title,
  summary,
  icon: Icon,
  defaultExpanded = false,
  children,
  expanded: controlledExpanded,
  onToggle,
}: AccordionSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)

  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded
  const handleToggle = onToggle ?? (() => setInternalExpanded((prev) => !prev))

  return (
    <section
      className={`rounded-xl border px-2.5 py-2 transition-colors flex flex-col ${
        isExpanded
          ? 'border-accent/35 bg-card/50 flex-1 min-h-0'
          : 'border-border/55 bg-card/22 flex-shrink-0'
      }`}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-3 py-0.5 text-left flex-shrink-0"
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title}`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ChevronRight
            className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
          {Icon && (
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {title}
            </div>
            {!isExpanded && (
              <div className="truncate text-xs leading-5 text-muted-foreground/90">
                {summary}
              </div>
            )}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-3 pb-1 pl-[1.6rem] overflow-y-auto min-h-0 flex-1">
          {children}
        </div>
      )}
    </section>
  )
}
