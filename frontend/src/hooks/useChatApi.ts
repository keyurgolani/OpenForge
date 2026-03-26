import { useMemo } from 'react'
import {
    listConversations,
    createConversation,
    getConversation,
    updateConversation,
    deleteConversation,
    permanentlyDeleteConversation,
    bulkTrashConversations,
    bulkRestoreConversations,
    bulkPermanentlyDeleteConversations,
    exportConversation,
    listGlobalConversations,
    createGlobalConversation,
    getGlobalConversation,
    updateGlobalConversation,
    deleteGlobalConversation,
    permanentlyDeleteGlobalConversation,
    bulkTrashGlobalConversations,
    bulkRestoreGlobalConversations,
    bulkPermanentlyDeleteGlobalConversations,
    exportGlobalConversation,
} from '@/lib/api'
import { chatRoute, globalChatRoute } from '@/lib/routes'

/**
 * Adapter hook that returns the correct API functions, query keys, and route
 * helpers based on whether we're in a workspace context or global context.
 *
 * When workspaceId is truthy, uses workspace-scoped endpoints.
 * When workspaceId is null/undefined, uses global chat endpoints.
 */
export function useChatApi(workspaceId: string | null | undefined) {
    return useMemo(() => {
        if (workspaceId) {
            return {
                listConversations: (params?: { category?: string }) =>
                    listConversations(workspaceId, params as any),
                createConversation: (data?: { agent_id?: string; title?: string }) =>
                    createConversation(workspaceId, data),
                getConversation: (cid: string) =>
                    getConversation(workspaceId, cid),
                updateConversation: (cid: string, data: { title?: string; title_locked?: boolean; is_pinned?: boolean; is_archived?: boolean }) =>
                    updateConversation(workspaceId, cid, data as any),
                deleteConversation: (cid: string) =>
                    deleteConversation(workspaceId, cid),
                permanentlyDeleteConversation: (cid: string) =>
                    permanentlyDeleteConversation(workspaceId, cid),
                bulkTrashConversations: (category?: string) =>
                    bulkTrashConversations(workspaceId, category as any),
                bulkRestoreConversations: () =>
                    bulkRestoreConversations(workspaceId),
                bulkPermanentlyDeleteConversations: () =>
                    bulkPermanentlyDeleteConversations(workspaceId),
                exportConversation: (cid: string, format?: string) =>
                    exportConversation(workspaceId, cid, format as any),
                queryKeyPrefix: ['conversations', workspaceId] as const,
                conversationQueryKey: (cid: string) => ['conversation', cid] as const,
                routeFor: (cid?: string) => chatRoute(workspaceId, cid),
                routeBase: chatRoute(workspaceId),
                isGlobal: false as const,
            }
        }
        return {
            listConversations: async (params?: { category?: string }) => {
                const res = await listGlobalConversations(params)
                // Normalize: global API returns { conversations: [...], total } but
                // workspace API returns a plain array. Return the array for consistency.
                return res?.conversations ?? res ?? []
            },
            createConversation: (data?: { agent_id?: string; title?: string }) =>
                createGlobalConversation({ agent_id: data?.agent_id || undefined, title: data?.title }),
            getConversation: (cid: string) =>
                getGlobalConversation(cid),
            updateConversation: (cid: string, data: { title?: string; title_locked?: boolean; is_pinned?: boolean; is_archived?: boolean }) =>
                updateGlobalConversation(cid, data),
            deleteConversation: (cid: string) =>
                deleteGlobalConversation(cid),
            permanentlyDeleteConversation: (cid: string) =>
                permanentlyDeleteGlobalConversation(cid),
            bulkTrashConversations: (category?: string) =>
                bulkTrashGlobalConversations(category),
            bulkRestoreConversations: () =>
                bulkRestoreGlobalConversations(),
            bulkPermanentlyDeleteConversations: () =>
                bulkPermanentlyDeleteGlobalConversations(),
            exportConversation: (cid: string, format?: string) =>
                exportGlobalConversation(cid, format),
            queryKeyPrefix: ['global-conversations'] as const,
            conversationQueryKey: (cid: string) => ['global-conversation', cid] as const,
            routeFor: (cid?: string) => globalChatRoute(cid),
            routeBase: globalChatRoute(),
            isGlobal: true as const,
        }
    }, [workspaceId])
}
