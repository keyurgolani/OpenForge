import { useEffect, useCallback } from 'react'
import { isModKey } from '@/lib/keyboard'

type KeyboardHandler = (e: KeyboardEvent) => void

interface ShortcutOptions {
  /** Whether the shortcut is enabled */
  enabled?: boolean
  /** Prevent default browser behavior */
  preventDefault?: boolean
  /** Stop event propagation */
  stopPropagation?: boolean
  /** Only trigger when no input element is focused */
  ignoreInputs?: boolean
}

/**
 * Hook for registering keyboard shortcuts
 * 
 * @example
 * useKeyboardShortcut('k', true, () => openPalette(), { enabled: isOpen })
 */
export function useKeyboardShortcut(
  key: string,
  withModKey: boolean,
  handler: KeyboardHandler,
  options: ShortcutOptions = {}
) {
  const {
    enabled = true,
    preventDefault = true,
    stopPropagation = false,
    ignoreInputs = true,
  } = options

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Check if enabled
    if (!enabled) return

    // Check if key matches (case-insensitive)
    if (e.key.toLowerCase() !== key.toLowerCase()) return

    // Check modifier key if required
    if (withModKey && !isModKey(e)) return
    if (!withModKey && (e.metaKey || e.ctrlKey)) return

    // Ignore when focused on input elements
    if (ignoreInputs) {
      const target = e.target as HTMLElement
      const tagName = target.tagName.toLowerCase()
      const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select'
      const isContentEditable = target.isContentEditable
      if (isInput || isContentEditable) return
    }

    // Prevent default and stop propagation
    if (preventDefault) e.preventDefault()
    if (stopPropagation) e.stopPropagation()

    handler(e)
  }, [key, withModKey, handler, enabled, preventDefault, stopPropagation, ignoreInputs])

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, enabled])
}

/**
 * Hook for multiple keyboard shortcuts
 * 
 * @example
 * useKeyboardShortcuts([
 *   { key: 'n', withModKey: true, handler: () => createNote() },
 *   { key: '/', withModKey: false, handler: () => focusSearch() },
 * ])
 */
export function useKeyboardShortcuts(
  shortcuts: Array<{
    key: string
    withModKey: boolean
    handler: KeyboardHandler
    options?: ShortcutOptions
  }>
) {
  shortcuts.forEach(({ key, withModKey, handler, options }) => {
    useKeyboardShortcut(key, withModKey, handler, options)
  })
}
