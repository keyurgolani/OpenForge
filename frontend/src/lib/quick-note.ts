export type QuickNoteType = 'standard' | 'fleeting' | 'bookmark' | 'gist'

const QUICK_NOTE_EVENT = 'openforge:quick-note:open'

interface QuickNoteEventDetail {
    type: QuickNoteType
}

export function openQuickNote(type: QuickNoteType = 'standard') {
    window.dispatchEvent(
        new CustomEvent<QuickNoteEventDetail>(QUICK_NOTE_EVENT, { detail: { type } }),
    )
}

export function onQuickNoteOpen(handler: (type: QuickNoteType) => void) {
    const listener = (event: Event) => {
        const custom = event as CustomEvent<QuickNoteEventDetail>
        handler(custom.detail?.type ?? 'standard')
    }

    window.addEventListener(QUICK_NOTE_EVENT, listener as EventListener)
    return () => window.removeEventListener(QUICK_NOTE_EVENT, listener as EventListener)
}
