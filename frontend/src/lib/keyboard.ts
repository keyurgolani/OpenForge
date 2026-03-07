/**
 * Keyboard shortcut utilities with platform detection
 */

// Detect platform
export const isMac = typeof navigator !== 'undefined' && 
  /Mac|iPod|iPhone|iPad/.test(navigator.platform)

export const isWindows = typeof navigator !== 'undefined' && 
  /Win/.test(navigator.platform)

export const isLinux = typeof navigator !== 'undefined' && 
  /Linux/.test(navigator.platform) && !isMac

/**
 * Get the modifier key name for display (Cmd on Mac, Ctrl on Windows/Linux)
 */
export function getModKey(): 'Cmd' | 'Ctrl' {
  return isMac ? 'Cmd' : 'Ctrl'
}

/**
 * Get the modifier key symbol for display (⌘ on Mac, Ctrl on Windows/Linux)
 */
export function getModSymbol(): string {
  return isMac ? '⌘' : 'Ctrl'
}

/**
 * Get formatted shortcut string for display
 * e.g., "Cmd+K" on Mac, "Ctrl+K" on Windows/Linux
 */
export function formatShortcut(key: string, modifiers: ('cmd' | 'ctrl' | 'shift' | 'alt')[] = []): string {
  const parts: string[] = []
  
  if (modifiers.includes('cmd') || modifiers.includes('ctrl')) {
    parts.push(getModKey())
  }
  if (modifiers.includes('shift')) {
    parts.push(isMac ? '⇧' : 'Shift')
  }
  if (modifiers.includes('alt')) {
    parts.push(isMac ? '⌥' : 'Alt')
  }
  
  parts.push(key.toUpperCase())
  
  return parts.join('+')
}

/**
 * Check if the modifier key is pressed (metaKey on Mac, ctrlKey on Windows/Linux)
 */
export function isModKey(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}

/**
 * Common keyboard shortcuts used throughout the app
 */
export const SHORTCUTS = {
  commandPalette: { key: 'K', modifiers: ['cmd'] as const, label: 'Command Palette' },
  newKnowledge: { key: 'N', modifiers: ['cmd'] as const, label: 'New Knowledge' },
  archiveKnowledge: { key: 'A', modifiers: ['cmd', 'shift'] as const, label: 'Archive Knowledge' },
  deleteKnowledge: { key: '⌫', modifiers: ['cmd'] as const, label: 'Delete Knowledge' },
  save: { key: 'S', modifiers: ['cmd'] as const, label: 'Save' },
  search: { key: '/', modifiers: [] as const, label: 'Search' },
  escape: { key: 'ESC', modifiers: [] as const, label: 'Close/Cancel' },
  submit: { key: 'Enter', modifiers: ['cmd'] as const, label: 'Submit' },
  toggleSidebar: { key: 'B', modifiers: ['cmd'] as const, label: 'Toggle Sidebar' },
} as const

/**
 * Get display string for a predefined shortcut
 */
export function getShortcutDisplay(shortcut: keyof typeof SHORTCUTS): string {
  const s = SHORTCUTS[shortcut]
  return formatShortcut(s.key, [...s.modifiers])
}
