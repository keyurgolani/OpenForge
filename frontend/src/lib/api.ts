/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios'

const api = axios.create({
    baseURL: '/api/v1',
    headers: { 'Content-Type': 'application/json' },
})

// ── Onboarding ──
export const getOnboarding = (): Promise<any> => api.get('/onboarding').then(r => r.data)
export const advanceOnboarding = (step: string): Promise<any> =>
    api.post('/onboarding/step', { step }).then(r => r.data)

// ── App Settings ──
export const listSettings = (): Promise<any> => api.get('/settings').then(r => r.data)
export const updateSetting = (
    key: string,
    data: { value: any; category?: string; sensitive?: boolean },
): Promise<any> => api.put(`/settings/${key}`, data).then(r => r.data)

// ── LLM Providers ──
export const listProviders = (): Promise<any> => api.get('/llm/providers').then(r => r.data)
export const createProvider = (data: object): Promise<any> => api.post('/llm/providers', data).then(r => r.data)
export const updateProvider = (id: string, data: object): Promise<any> =>
    api.put(`/llm/providers/${id}`, data).then(r => r.data)
export const deleteProvider = (id: string) => api.delete(`/llm/providers/${id}`)
export const listModels = (providerId: string): Promise<any> =>
    api.get(`/llm/providers/${providerId}/models`).then(r => r.data)
export const testConnection = (providerId: string): Promise<any> =>
    api.post(`/llm/providers/${providerId}/test`).then(r => r.data)
export const setDefaultProvider = (id: string): Promise<any> =>
    api.put(`/llm/providers/${id}/default`).then(r => r.data)

// ── Workspaces ──
export const listWorkspaces = (): Promise<any> => api.get('/workspaces').then(r => r.data)
export const createWorkspace = (data: object): Promise<any> => api.post('/workspaces', data).then(r => r.data)
export const getWorkspace = (id: string): Promise<any> => api.get(`/workspaces/${id}`).then(r => r.data)
export const updateWorkspace = (id: string, data: object): Promise<any> =>
    api.put(`/workspaces/${id}`, data).then(r => r.data)
export const deleteWorkspace = (id: string) => api.delete(`/workspaces/${id}`)

// ── Knowledge ──
export const listKnowledge = (wid: string, params?: object): Promise<any> =>
    api.get(`/workspaces/${wid}/knowledge`, { params }).then(r => r.data)
export const createKnowledge = (wid: string, data: object): Promise<any> =>
    api.post(`/workspaces/${wid}/knowledge`, data).then(r => r.data)
export const getKnowledge = (wid: string, nid: string): Promise<any> =>
    api.get(`/workspaces/${wid}/knowledge/${nid}`).then(r => r.data)
export const updateKnowledge = (wid: string, nid: string, data: object): Promise<any> =>
    api.put(`/workspaces/${wid}/knowledge/${nid}`, data).then(r => r.data)
export const deleteKnowledge = (wid: string, nid: string) =>
    api.delete(`/workspaces/${wid}/knowledge/${nid}`)
export const updateKnowledgeTags = (wid: string, nid: string, tags: string[]): Promise<any> =>
    api.put(`/workspaces/${wid}/knowledge/${nid}/tags`, { tags }).then(r => r.data)
export const togglePin = (wid: string, nid: string): Promise<any> =>
    api.put(`/workspaces/${wid}/knowledge/${nid}/pin`).then(r => r.data)
export const toggleArchive = (wid: string, nid: string): Promise<any> =>
    api.put(`/workspaces/${wid}/knowledge/${nid}/archive`).then(r => r.data)
export const summarizeKnowledge = (wid: string, nid: string): Promise<any> =>
    api.post(`/workspaces/${wid}/knowledge/${nid}/summarize`).then(r => r.data)
export const extractKnowledgeInsights = (wid: string, nid: string): Promise<any> =>
    api.post(`/workspaces/${wid}/knowledge/${nid}/extract-insights`).then(r => r.data)
export const generateKnowledgeTitle = (wid: string, nid: string): Promise<any> =>
    api.post(`/workspaces/${wid}/knowledge/${nid}/generate-title`).then(r => r.data)
export const generateKnowledgeIntelligence = (wid: string, nid: string): Promise<any> =>
    api.post(`/workspaces/${wid}/knowledge/${nid}/generate-intelligence`).then(r => r.data)
export const extractBookmarkContent = (wid: string, nid: string): Promise<any> =>
    api.post(`/workspaces/${wid}/knowledge/${nid}/extract-bookmark-content`).then(r => r.data)

// Backward-compatible aliases
export const listNotes = listKnowledge
export const createNote = createKnowledge
export const getNote = getKnowledge
export const updateNote = updateKnowledge
export const deleteNote = deleteKnowledge
export const updateNoteTags = updateKnowledgeTags
export const summarizeNote = summarizeKnowledge
export const extractInsights = extractKnowledgeInsights
export const generateTitle = generateKnowledgeTitle

// ── Conversations ──
export const listConversations = (
    wid: string,
    params?: { include_archived?: boolean },
): Promise<any> => api.get(`/workspaces/${wid}/conversations`, { params }).then(r => r.data)
export const createConversation = (wid: string, data?: object): Promise<any> =>
    api.post(`/workspaces/${wid}/conversations`, data ?? {}).then(r => r.data)
export const getConversation = (wid: string, cid: string, params?: object): Promise<any> =>
    api.get(`/workspaces/${wid}/conversations/${cid}`, { params }).then(r => r.data)
export const updateConversation = (wid: string, cid: string, data: object): Promise<any> =>
    api.put(`/workspaces/${wid}/conversations/${cid}`, data).then(r => r.data)
export const deleteConversation = (wid: string, cid: string) =>
    api.delete(`/workspaces/${wid}/conversations/${cid}`)

// ── Search ──
export const searchNotes = (wid: string, q: string, params?: object): Promise<any> =>
    api.get(`/workspaces/${wid}/search`, { params: { q, ...params } }).then(r => r.data)

// ── Prompts ──
export const listPrompts = (): Promise<any> => api.get('/prompts').then(r => r.data)
export const updatePrompt = (id: string, data: { override: string | null }): Promise<any> =>
    api.put(`/prompts/${id}`, data).then(r => r.data)

// ── Tasks / Scheduling ──
export const listSchedules = (): Promise<any> => api.get('/tasks/schedules').then(r => r.data)
export const updateSchedule = (
    id: string,
    data: {
        enabled?: boolean
        interval_hours?: number
        target_scope?: 'one' | 'remaining' | 'all'
        knowledge_id?: string
    },
): Promise<any> =>
    api.put(`/tasks/schedules/${id}`, data).then(r => r.data)
export const runTaskNow = (
    id: string,
    data?: { target_scope?: 'one' | 'remaining' | 'all'; workspace_id?: string; knowledge_id?: string },
): Promise<any> =>
    api.post(`/tasks/schedules/${id}/run`, data ?? {}).then(r => r.data)
export const getTaskHistory = (params?: { task_type?: string; limit?: number }): Promise<any> =>
    api.get('/tasks/history', { params }).then(r => r.data)

export default api
