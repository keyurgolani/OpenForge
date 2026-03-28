import { useState, useCallback, useEffect, useRef } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  Layers,
  ChevronDown,
  Check,
  Plus,
  BookOpen,
  Search,
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import api from '@/lib/api'
import { cn } from '@/lib/cn'

interface WorkspaceSwitcherProps {
  collapsed?: boolean
}

export default function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const workspaces = useUIStore((s) => s.workspaces)
  const setWorkspaces = useUIStore((s) => s.setWorkspaces)
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useUIStore((s) => s.setActiveWorkspaceId)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus()
    }
  }, [creating])

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim()
    if (!trimmed) return

    try {
      const { data } = await api.post('/workspaces', { name: trimmed })
      setWorkspaces([...workspaces, data])
      setActiveWorkspaceId(data.id)
      setNewName('')
      setCreating(false)
      setOpen(false)
    } catch {
      // Toast will be shown by axios interceptor
    }
  }, [newName, workspaces, setWorkspaces, setActiveWorkspaceId])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleCreate()
      } else if (e.key === 'Escape') {
        setCreating(false)
        setNewName('')
      }
    },
    [handleCreate],
  )

  // Collapsed: just show a small icon button
  if (collapsed) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              'mx-auto flex h-9 w-9 items-center justify-center rounded-lg',
              'border border-border/40 bg-bg-sunken text-fg-muted',
              'transition-colors duration-200 hover:bg-primary/10 hover:text-primary',
            )}
            aria-label="Switch workspace"
          >
            <Layers className="h-4 w-4" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="right"
            sideOffset={12}
            align="start"
            className="z-50 w-64 rounded-xl border border-border/40 bg-bg-elevated p-1.5 shadow-xl animate-scale-in"
          >
            <WorkspaceList
              workspaces={workspaces}
              activeId={activeWorkspaceId}
              onSelect={(id) => {
                setActiveWorkspaceId(id)
                setOpen(false)
              }}
              creating={creating}
              setCreating={setCreating}
              newName={newName}
              setNewName={setNewName}
              inputRef={inputRef}
              onKeyDown={handleKeyDown}
              onCreate={handleCreate}
            />
            <Popover.Arrow className="fill-bg-elevated" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    )
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2',
            'border border-border/40 bg-bg-sunken',
            'transition-all duration-200 hover:border-primary/30 hover:bg-primary/5',
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className="w-full truncate text-left font-label text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Workspace
            </span>
            <span className="w-full truncate text-left text-sm font-medium text-fg">
              {activeWorkspace?.name ?? 'Select workspace'}
            </span>
          </div>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={6}
          align="start"
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-xl border border-border/40 bg-bg-elevated p-1.5 shadow-xl animate-scale-in"
        >
          <div className="mb-1.5 flex items-center gap-2 px-2 py-1.5">
            <BookOpen className="h-3 w-3 text-fg-subtle" />
            <span className="font-label text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
              Knowledge &amp; Search scope
            </span>
          </div>
          <WorkspaceList
            workspaces={workspaces}
            activeId={activeWorkspaceId}
            onSelect={(id) => {
              setActiveWorkspaceId(id)
              setOpen(false)
            }}
            creating={creating}
            setCreating={setCreating}
            newName={newName}
            setNewName={setNewName}
            inputRef={inputRef}
            onKeyDown={handleKeyDown}
            onCreate={handleCreate}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Internal list component                                                    */
/* -------------------------------------------------------------------------- */

interface WorkspaceListProps {
  workspaces: Array<{ id: string; name: string }>
  activeId: string | null
  onSelect: (id: string) => void
  creating: boolean
  setCreating: (v: boolean) => void
  newName: string
  setNewName: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onKeyDown: (e: React.KeyboardEvent) => void
  onCreate: () => void
}

function WorkspaceList({
  workspaces,
  activeId,
  onSelect,
  creating,
  setCreating,
  newName,
  setNewName,
  inputRef,
  onKeyDown,
  onCreate,
}: WorkspaceListProps) {
  return (
    <div className="flex flex-col">
      {workspaces.length === 0 && !creating && (
        <div className="px-3 py-4 text-center">
          <Layers className="mx-auto mb-2 h-5 w-5 text-fg-subtle" />
          <p className="text-xs text-fg-muted">No workspaces yet</p>
        </div>
      )}

      {workspaces.map((ws) => (
        <button
          key={ws.id}
          type="button"
          onClick={() => onSelect(ws.id)}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm',
            'transition-colors duration-150',
            ws.id === activeId
              ? 'bg-primary/10 text-primary'
              : 'text-fg hover:bg-fg/5',
          )}
        >
          <div
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold uppercase',
              ws.id === activeId
                ? 'bg-primary/20 text-primary'
                : 'bg-fg/5 text-fg-muted',
            )}
          >
            {ws.name.charAt(0)}
          </div>
          <span className="min-w-0 flex-1 truncate">{ws.name}</span>
          {ws.id === activeId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </button>
      ))}

      {/* Scope explanation */}
      <div className="mx-2.5 mt-1 mb-1 flex items-center gap-1.5 rounded-md bg-primary/5 px-2 py-1.5">
        <Search className="h-3 w-3 shrink-0 text-primary/60" />
        <p className="text-[10px] leading-tight text-fg-muted">
          Workspace context scopes <strong className="text-fg">Knowledge</strong> and{' '}
          <strong className="text-fg">Search</strong> only.
        </p>
      </div>

      <div className="mt-1 border-t border-border/30 pt-1">
        {creating ? (
          <div className="flex items-center gap-1.5 px-2 py-1">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Workspace name"
              className="flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={onCreate}
              disabled={!newName.trim()}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-fg-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-muted transition-colors duration-150 hover:bg-fg/5 hover:text-fg"
          >
            <Plus className="h-4 w-4" />
            <span>Create workspace</span>
          </button>
        )}
      </div>
    </div>
  )
}
