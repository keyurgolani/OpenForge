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

// ── Notes ──
export const listNotes = (wid: string, params?: object): Promise<any> =>
    api.get(`/workspaces/${wid}/notes`, { params }).then(r => r.data)
export const createNote = (wid: string, data: object): Promise<any> =>
    api.post(`/workspaces/${wid}/notes`, data).then(r => r.data)
export const getNote = (wid: string, nid: string): Promise<any> =>
    api.get(`/workspaces/${wid}/notes/${nid}`).then(r => r.data)
export const updateNote = (wid: string, nid: string, data: object): Promise<any> =>
    api.put(`/workspaces/${wid}/notes/${nid}`, data).then(r => r.data)
export const deleteNote = (wid: string, nid: string) =>
    api.delete(`/workspaces/${wid}/notes/${nid}`)
export const updateNoteTags = (wid: string, nid: string, tags: string[]): Promise<any> =>
    api.put(`/workspaces/${wid}/notes/${nid}/tags`, { tags }).then(r => r.data)
export const togglePin = (wid: string, nid: string): Promise<any> =>
    api.put(`/workspaces/${wid}/notes/${nid}/pin`).then(r => r.data)
export const toggleArchive = (wid: string, nid: string): Promise<any> =>
    api.put(`/workspaces/${wid}/notes/${nid}/archive`).then(r => r.data)
export const summarizeNote = (wid: string, nid: string): Promise<any> =>
    api.post(`/workspaces/${wid}/notes/${nid}/summarize`).then(r => r.data)
export const extractInsights = (wid: string, nid: string): Promise<any> =>
    api.post(`/workspaces/${wid}/notes/${nid}/extract-insights`).then(r => r.data)
export const generateTitle = (wid: string, nid: string): Promise<any> =>
    api.post(`/workspaces/${wid}/notes/${nid}/generate-title`).then(r => r.data)

// ── Conversations ──
export const listConversations = (wid: string): Promise<any> =>
    api.get(`/workspaces/${wid}/conversations`).then(r => r.data)
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

export default api
