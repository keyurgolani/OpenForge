import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useWorkspaces } from '@/hooks/useWorkspace'

interface WorkspaceDropdownProps {
  onSelect: (workspaceId: string) => void
  trigger: React.ReactNode
}

export function WorkspaceDropdown({ onSelect, trigger }: WorkspaceDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const { data: workspaces, isLoading, isError, refetch } = useWorkspaces()

  useEffect(() => {
    if (!open) return
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
      <div onClick={(e) => { e.stopPropagation(); setOpen(prev => !prev) }}>{trigger}</div>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 z-50 w-56 rounded-lg border border-border/70 bg-card shadow-xl overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-border/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Save to workspace
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {isLoading && (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">Loading workspaces…</div>
            )}
            {isError && (
              <div className="px-2.5 py-2 text-xs text-red-400 flex items-center justify-between">
                <span>Failed to load workspaces</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); refetch() }}
                  className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Retry loading workspaces"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            )}
            {!isLoading && !isError && Array.isArray(workspaces) && workspaces.length === 0 && (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">No workspaces found</div>
            )}
            {!isLoading && !isError && Array.isArray(workspaces) && workspaces.map((ws: { id: string; name: string; icon?: string }) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => { onSelect(ws.id); setOpen(false) }}
                className="w-full text-left rounded-md px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors"
              >
                {ws.icon && <span className="flex-shrink-0">{ws.icon}</span>}
                <span className="truncate text-foreground">{ws.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
