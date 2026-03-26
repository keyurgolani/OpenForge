import { useEffect, useMemo, useRef, useState } from 'react'
import { BrainCircuit, Check, ChevronDown, Search } from 'lucide-react'

export interface ModelPickerOption {
  key: string
  providerId: string
  modelId: string
  providerLabel: string
  modelLabel: string
  label: string
  searchText: string
}

interface ComposerModelPickerProps {
  options: ModelPickerOption[]
  selectedKey: string
  onSelect: (key: string) => void
  defaultLabel?: string
}

export function ComposerModelPicker({ options, selectedKey, onSelect, defaultLabel = 'Default' }: ComposerModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(() => options.find(o => o.key === selectedKey), [options, selectedKey])
  const pillLabel = selected ? selected.modelLabel : 'Default'
  const isOverride = !!selectedKey

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.searchText.includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) { setQuery(''); return }
    setTimeout(() => searchRef.current?.focus(), 0)
    const handleOutsideClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`chat-control-pill h-9 gap-1 px-2.5 justify-center transition-colors ${isOverride ? 'text-accent border-accent/40 bg-accent/10' : ''}`}
        aria-label="Select model"
        title={selected ? selected.label : defaultLabel}
      >
        <BrainCircuit className="w-3.5 h-3.5" />
        <span className="text-[11px] font-medium max-w-[100px] truncate hidden sm:inline">{pillLabel}</span>
        <ChevronDown className={`w-2.5 h-2.5 text-muted-foreground/70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-50 w-72 rounded-xl border border-border/70 bg-card shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search models..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full rounded-md border border-border/50 bg-muted/30 pl-7 pr-2.5 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {/* Default / inherit option */}
            <button
              type="button"
              onClick={() => { onSelect(''); setOpen(false) }}
              className={`w-full text-left rounded-md px-2.5 py-1.5 text-xs flex items-center gap-2 ${!selectedKey ? 'bg-accent/10 text-accent' : 'hover:bg-muted/50'}`}
            >
              {!selectedKey ? <Check className="w-3 h-3 flex-shrink-0" /> : <span className="w-3" />}
              <span className="truncate">{defaultLabel}</span>
            </button>

            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">No models match.</div>
            ) : (
              filtered.map(opt => {
                const active = opt.key === selectedKey
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { onSelect(opt.key); setOpen(false) }}
                    className={`w-full text-left rounded-md px-2.5 py-1.5 text-xs flex items-center gap-2 ${active ? 'bg-accent/10 text-accent' : 'hover:bg-muted/50'}`}
                  >
                    {active ? <Check className="w-3 h-3 flex-shrink-0" /> : <span className="w-3" />}
                    <span className="truncate">{opt.label}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
