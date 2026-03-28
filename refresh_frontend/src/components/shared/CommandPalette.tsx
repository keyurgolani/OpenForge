import { useEffect, useState, useCallback, useRef } from 'react'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search,
  Bot,
  Workflow,
  FileOutput,
  FolderOpen,
  Settings,
  MessageSquare,
  Zap,
  Rocket,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'

interface CommandItem {
  id: string
  label: string
  icon: typeof Bot
  group: string
  href?: string
  onSelect?: () => void
  keywords?: string[]
}

const staticCommands: CommandItem[] = [
  { id: 'nav-agents', label: 'Agents', icon: Bot, group: 'Navigation', href: '/v2/agents', keywords: ['bots', 'ai'] },
  { id: 'nav-automations', label: 'Automations', icon: Workflow, group: 'Navigation', href: '/v2/automations', keywords: ['workflows', 'pipelines'] },
  { id: 'nav-deployments', label: 'Deployments', icon: Rocket, group: 'Navigation', href: '/v2/deployments', keywords: ['deploy', 'runs'] },
  { id: 'nav-outputs', label: 'Outputs', icon: FileOutput, group: 'Navigation', href: '/v2/outputs', keywords: ['results', 'artifacts'] },
  { id: 'nav-chat', label: 'Chat', icon: MessageSquare, group: 'Navigation', href: '/v2/chat', keywords: ['conversation', 'message'] },
  { id: 'nav-settings', label: 'Settings', icon: Settings, group: 'Navigation', href: '/v2/settings', keywords: ['preferences', 'config'] },
  { id: 'nav-settings-models', label: 'Model Providers', icon: Zap, group: 'Settings', href: '/v2/settings/models/providers', keywords: ['llm', 'openai', 'api'] },
  { id: 'nav-settings-tools', label: 'Tools & Connections', icon: Settings, group: 'Settings', href: '/v2/settings/tools', keywords: ['integrations', 'mcp'] },
  { id: 'nav-settings-workspaces', label: 'Workspaces', icon: FolderOpen, group: 'Settings', href: '/v2/settings/workspaces', keywords: ['projects', 'spaces'] },
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSelect = useCallback(
    (item: CommandItem) => {
      setOpen(false)
      setSearch('')
      if (item.onSelect) {
        item.onSelect()
      } else if (item.href) {
        navigate(item.href)
      }
    },
    [navigate],
  )

  const groups = staticCommands.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                className={cn(
                  'fixed left-1/2 top-[20%] z-50 w-full max-w-xl -translate-x-1/2',
                  'overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl',
                  'focus:outline-none',
                )}
                initial={{ opacity: 0, scale: 0.96, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Search and navigate to agents, automations, outputs, workspaces, and settings.
                </Dialog.Description>

                <Command
                  className="flex flex-col"
                  loop
                  shouldFilter={true}
                >
                  <div className="flex items-center gap-3 border-b border-border px-4">
                    <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
                    <Command.Input
                      ref={inputRef}
                      value={search}
                      onValueChange={setSearch}
                      placeholder="Search commands, pages..."
                      className={cn(
                        'flex-1 bg-transparent py-3.5 text-sm text-fg',
                        'placeholder:text-fg-subtle outline-none',
                      )}
                    />
                    <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border-muted bg-bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                      ESC
                    </kbd>
                  </div>

                  <Command.List className="max-h-[320px] overflow-y-auto overscroll-contain p-2">
                    <Command.Empty className="flex items-center justify-center py-12 text-sm text-fg-muted">
                      No results found.
                    </Command.Empty>

                    {Object.entries(groups).map(([groupName, items]) => (
                      <Command.Group
                        key={groupName}
                        heading={groupName}
                        className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:font-label"
                      >
                        {items.map((item) => {
                          const Icon = item.icon
                          return (
                            <Command.Item
                              key={item.id}
                              value={[item.label, ...(item.keywords ?? [])].join(' ')}
                              onSelect={() => handleSelect(item)}
                              className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                                'text-fg-muted transition-colors',
                                'data-[selected=true]:bg-primary/10 data-[selected=true]:text-fg',
                                'hover:bg-bg-sunken',
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="flex-1 truncate">{item.label}</span>
                            </Command.Item>
                          )
                        })}
                      </Command.Group>
                    ))}
                  </Command.List>

                  <div className="flex items-center gap-4 border-t border-border px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                      <kbd className="rounded border border-border-muted bg-bg-sunken px-1 py-0.5 font-mono text-[10px]">
                        &uarr;&darr;
                      </kbd>
                      Navigate
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                      <kbd className="rounded border border-border-muted bg-bg-sunken px-1 py-0.5 font-mono text-[10px]">
                        &crarr;
                      </kbd>
                      Select
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                      <kbd className="rounded border border-border-muted bg-bg-sunken px-1 py-0.5 font-mono text-[10px]">
                        Esc
                      </kbd>
                      Close
                    </span>
                  </div>
                </Command>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
