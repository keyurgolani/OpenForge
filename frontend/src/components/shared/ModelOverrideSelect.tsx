import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

export interface ModelOption {
    id: string
    name: string
}

interface ModelOverrideSelectProps {
    models: ModelOption[]
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    placeholder?: string
    inheritLabel?: string
    compact?: boolean
}

export function ModelOverrideSelect({
    models,
    value,
    onChange,
    disabled = false,
    placeholder = 'Select model override',
    inheritLabel = 'Inherit provider default',
    compact = false,
}: ModelOverrideSelectProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const rootRef = useRef<HTMLDivElement>(null)

    const selectedModel = useMemo(
        () => models.find(model => model.id === value),
        [models, value],
    )
    const hasUnknownSelectedValue = !!value && !selectedModel

    const filteredModels = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return models
        return models.filter(model =>
            model.name.toLowerCase().includes(q)
            || model.id.toLowerCase().includes(q),
        )
    }, [models, query])

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (!rootRef.current) return
            if (!rootRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleOutsideClick)
        return () => document.removeEventListener('mousedown', handleOutsideClick)
    }, [])

    useEffect(() => {
        if (!open) setQuery('')
    }, [open])

    const buttonText = selectedModel?.name ?? (hasUnknownSelectedValue ? value : placeholder)

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                className={`input w-full text-left flex items-center justify-between gap-2 ${compact ? 'text-xs py-1.5' : 'text-sm'}`}
                onClick={() => !disabled && setOpen(prev => !prev)}
                disabled={disabled}
                aria-expanded={open}
            >
                <span className={selectedModel || hasUnknownSelectedValue ? 'text-foreground truncate' : 'text-muted-foreground truncate'}>
                    {buttonText}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-1 w-full z-[150] rounded-xl border border-border bg-popover shadow-2xl">
                    <div className="p-2 border-b border-border/60">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                            <input
                                className={`input h-8 pl-7 ${compact ? 'text-xs' : 'text-sm'}`}
                                placeholder="Search models..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="p-1.5 max-h-56 overflow-y-auto space-y-1">
                        <button
                            type="button"
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 hover:bg-muted/40 transition-colors ${!value ? 'text-accent bg-accent/10' : 'text-foreground'}`}
                            onClick={() => {
                                onChange('')
                                setOpen(false)
                            }}
                        >
                            {!value ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <span className="w-3.5" />}
                            <span className="truncate">{inheritLabel}</span>
                        </button>

                        {hasUnknownSelectedValue && (
                            <div className="px-2.5 py-1.5 rounded-lg text-xs border border-amber-400/30 bg-amber-400/10 text-amber-200">
                                Current value <span className="font-mono">{value}</span> is not in this provider&apos;s enabled model list.
                            </div>
                        )}

                        {filteredModels.length === 0 ? (
                            <div className="px-2.5 py-2 text-xs text-muted-foreground">
                                No models match your search.
                            </div>
                        ) : (
                            filteredModels.map(model => {
                                const isSelected = model.id === value
                                return (
                                    <button
                                        key={model.id}
                                        type="button"
                                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 hover:bg-muted/40 transition-colors ${isSelected ? 'text-accent bg-accent/10' : 'text-foreground'}`}
                                        onClick={() => {
                                            onChange(model.id)
                                            setOpen(false)
                                        }}
                                    >
                                        {isSelected ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <span className="w-3.5" />}
                                        <span className="truncate">{model.name}</span>
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
