import { useCallback, useEffect } from 'react'
import { Command, Sun, Moon, Monitor } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useThemeStore } from '@/stores/themeStore'
import type { ColorMode } from '@/stores/themeStore'
import Breadcrumbs from './Breadcrumbs'
import ConnectionStatus from './ConnectionStatus'
import { cn } from '@/lib/cn'

const themeModes: Array<{ mode: ColorMode; icon: typeof Sun; label: string }> = [
  { mode: 'light', icon: Sun, label: 'Light' },
  { mode: 'dark', icon: Moon, label: 'Dark' },
  { mode: 'system', icon: Monitor, label: 'System' },
]

export default function TopBar() {
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const colorMode = useThemeStore((s) => s.colorMode)
  const setColorMode = useThemeStore((s) => s.setColorMode)

  // Cycle through color modes
  const cycleTheme = useCallback(() => {
    const order: ColorMode[] = ['light', 'dark', 'system']
    const next = order[(order.indexOf(colorMode) + 1) % order.length]
    setColorMode(next)
  }, [colorMode, setColorMode])

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setCommandPaletteOpen])

  const currentTheme = themeModes.find((t) => t.mode === colorMode) ?? themeModes[2]
  const ThemeIcon = currentTheme.icon

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/40 px-5',
        'bg-bg-elevated/80 backdrop-blur-sm',
      )}
    >
      {/* Left: Breadcrumbs */}
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Command palette trigger */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className={cn(
            'group flex items-center gap-2 rounded-lg px-2.5 py-1.5',
            'border border-border/40 bg-bg-sunken',
            'text-fg-muted transition-all duration-200',
            'hover:border-primary/30 hover:bg-primary/5 hover:text-fg',
          )}
          aria-label="Open command palette"
        >
          <Command className="h-3.5 w-3.5" />
          <span className="hidden text-xs sm:inline">Search</span>
          <kbd
            className={cn(
              'hidden items-center gap-0.5 rounded border border-border/50 bg-bg px-1.5 py-0.5',
              'font-mono text-[10px] text-fg-subtle sm:flex',
            )}
          >
            <span className="text-[11px]">{navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}</span>
            <span>K</span>
          </kbd>
        </button>

        {/* Theme mode toggle */}
        <button
          type="button"
          onClick={cycleTheme}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            'text-fg-muted transition-colors duration-200',
            'hover:bg-fg/5 hover:text-fg',
          )}
          aria-label={`Theme: ${currentTheme.label}. Click to change.`}
          title={`Theme: ${currentTheme.label}`}
        >
          <ThemeIcon className="h-4 w-4" />
        </button>

        {/* Connection status */}
        <ConnectionStatus />
      </div>
    </header>
  )
}
