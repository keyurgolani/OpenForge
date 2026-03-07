export type QuickKnowledgeType = 'standard' | 'fleeting' | 'bookmark' | 'gist'

const QUICK_KNOWLEDGE_EVENT = 'openforge:quick-knowledge:open'

interface QuickKnowledgeEventDetail {
    type: QuickKnowledgeType
}

export function openQuickKnowledge(type: QuickKnowledgeType = 'standard') {
    window.dispatchEvent(
        new CustomEvent<QuickKnowledgeEventDetail>(QUICK_KNOWLEDGE_EVENT, { detail: { type } }),
    )
}

export function onQuickKnowledgeOpen(handler: (type: QuickKnowledgeType) => void) {
    const listener = (event: Event) => {
        const custom = event as CustomEvent<QuickKnowledgeEventDetail>
        handler(custom.detail?.type ?? 'standard')
    }

    window.addEventListener(QUICK_KNOWLEDGE_EVENT, listener as EventListener)
    return () => window.removeEventListener(QUICK_KNOWLEDGE_EVENT, listener as EventListener)
}
