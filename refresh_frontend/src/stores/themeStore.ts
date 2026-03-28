import { create } from 'zustand'

export type ColorMode = 'light' | 'dark' | 'system'
export type Palette = 'forge' | 'ocean' | 'verdant' | 'slate' | 'ember'

export const PALETTE_META: Record<Palette, { label: string; swatch: string }> = {
  forge: { label: 'Forge', swatch: '#B45309' },
  ocean: { label: 'Ocean', swatch: '#3B82F6' },
  verdant: { label: 'Verdant', swatch: '#22C55E' },
  slate: { label: 'Slate', swatch: '#64748B' },
  ember: { label: 'Ember', swatch: '#EF4444' },
}

interface ThemeState {
  colorMode: ColorMode
  palette: Palette
  setColorMode: (mode: ColorMode) => void
  setPalette: (palette: Palette) => void
}

function getStoredOrDefault<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  colorMode: getStoredOrDefault<ColorMode>('of-color-mode', 'system'),
  palette: getStoredOrDefault<Palette>('of-palette', 'forge'),
  setColorMode: (mode) => {
    localStorage.setItem('of-color-mode', JSON.stringify(mode))
    set({ colorMode: mode })
  },
  setPalette: (palette) => {
    localStorage.setItem('of-palette', JSON.stringify(palette))
    set({ palette })
  },
}))
