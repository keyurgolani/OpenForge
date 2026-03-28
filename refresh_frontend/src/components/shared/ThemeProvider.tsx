import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorMode, palette } = useThemeStore()

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-palette', palette)
  }, [palette])

  useEffect(() => {
    const root = document.documentElement
    const applyTheme = (theme: 'light' | 'dark') => {
      root.setAttribute('data-theme', theme)
    }
    if (colorMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches ? 'dark' : 'light')
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else {
      applyTheme(colorMode)
    }
  }, [colorMode])

  return <>{children}</>
}
