import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import type { ColorMode, Palette } from '@/stores/themeStore'
import { cn } from '@/lib/cn'

const colorModes: { value: ColorMode; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

const palettes: { value: Palette; label: string; swatch: string }[] = [
  { value: 'forge', label: 'Forge', swatch: 'bg-amber-500' },
  { value: 'ocean', label: 'Ocean', swatch: 'bg-blue-500' },
  { value: 'verdant', label: 'Verdant', swatch: 'bg-green-500' },
  { value: 'slate', label: 'Slate', swatch: 'bg-slate-500' },
  { value: 'ember', label: 'Ember', swatch: 'bg-red-500' },
]

interface ThemeSwitcherProps {
  className?: string
}

export default function ThemeSwitcher({ className }: ThemeSwitcherProps) {
  const { colorMode, palette, setColorMode, setPalette } = useThemeStore()

  return (
    <div className={cn('space-y-5', className)}>
      {/* Color Mode */}
      <div className="space-y-2">
        <label className="font-label text-xs font-medium text-fg-muted uppercase tracking-wider">
          Color Mode
        </label>
        <div className="inline-flex rounded-lg border border-border bg-bg-sunken p-1">
          {colorModes.map((mode) => {
            const Icon = mode.icon
            const active = colorMode === mode.value
            return (
              <button
                key={mode.value}
                onClick={() => setColorMode(mode.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-bg-elevated text-fg shadow-sm'
                    : 'text-fg-muted hover:text-fg',
                )}
                aria-label={`Set color mode to ${mode.label}`}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{mode.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Palette */}
      <div className="space-y-2">
        <label className="font-label text-xs font-medium text-fg-muted uppercase tracking-wider">
          Color Palette
        </label>
        <div className="flex items-center gap-2">
          {palettes.map((p) => {
            const active = palette === p.value
            return (
              <button
                key={p.value}
                onClick={() => setPalette(p.value)}
                className={cn(
                  'group relative flex h-8 w-8 items-center justify-center rounded-full transition-transform',
                  active ? 'scale-110' : 'hover:scale-105',
                )}
                aria-label={`Set palette to ${p.label}`}
                aria-pressed={active}
                title={p.label}
              >
                <span
                  className={cn(
                    'block h-6 w-6 rounded-full transition-shadow',
                    p.swatch,
                    active && 'ring-2 ring-fg ring-offset-2 ring-offset-bg',
                  )}
                />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
