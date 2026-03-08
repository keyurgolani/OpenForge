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
export const uploadKnowledgeFile = (
    wid: string,
    file: File,
    title?: string,
): Promise<any> => {
    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)
    return api.post(`/workspaces/${wid}/knowledge/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
}

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
export const permanentlyDeleteConversation = (wid: string, cid: string) =>
    api.delete(`/workspaces/${wid}/conversations/${cid}/permanent`)

// ── Search ──
export const searchKnowledge = (wid: string, q: string, params?: object): Promise<any> =>
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

// ── MCP Servers ──
export const listMCPServers = (includeDisabled = false): Promise<any> =>
    api.get('/mcp/servers', { params: { include_disabled: includeDisabled } }).then(r => r.data)
export const createMCPServer = (data: {
    name: string
    url: string
    description?: string
    auth_type?: string
    auth_value?: string
    default_risk_level?: string
}): Promise<any> => api.post('/mcp/servers', data).then(r => r.data)
export const getMCPServer = (id: string): Promise<any> => api.get(`/mcp/servers/${id}`).then(r => r.data)
export const updateMCPServer = (id: string, data: object): Promise<any> =>
    api.put(`/mcp/servers/${id}`, data).then(r => r.data)
export const deleteMCPServer = (id: string): Promise<any> => api.delete(`/mcp/servers/${id}`)
export const discoverMCPTools = (id: string): Promise<any> =>
    api.post(`/mcp/servers/${id}/discover`).then(r => r.data)
export const listMCPServerTools = (id: string): Promise<any> =>
    api.get(`/mcp/servers/${id}/tools`).then(r => r.data)
export const setMCPToolOverride = (
    serverId: string,
    toolName: string,
    data: { risk_level?: string; is_enabled?: boolean },
): Promise<any> =>
    api.put(`/mcp/servers/${serverId}/tools/${encodeURIComponent(toolName)}`, data).then(r => r.data)
export const listAllMCPTools = (): Promise<any> => api.get('/mcp/tools').then(r => r.data)

// ── Tools ──
export const listTools = (params?: { category?: string; is_enabled?: boolean }): Promise<any> =>
    api.get('/tools', { params }).then(r => r.data)
export const getTool = (id: string): Promise<any> => api.get(`/tools/${id}`).then(r => r.data)
export const updateTool = (id: string, data: { is_enabled?: boolean }): Promise<any> =>
    api.patch(`/tools/${id}`, data).then(r => r.data)
export const syncTools = (): Promise<any> => api.post('/tools/sync').then(r => r.data)
export const listToolCategories = (): Promise<any> => api.get('/tools/categories').then(r => r.data)

// ── Auth ──
export const checkAuth = (): Promise<any> =>
    fetch('/api/auth/check').then(r => {
        if (r.status === 401) return { authenticated: false, auth_required: true }
        return r.json()
    })

export const login = (password: string): Promise<any> =>
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    }).then(r => r.json())

export const logout = (): Promise<any> =>
    fetch('/api/auth/logout', { method: 'POST' }).then(r => r.json())

// ── Router/Council/Optimizer configs ──
export const getRouterConfig = (providerId: string): Promise<any> =>
    api.get(`/llm/virtual/${providerId}/router-config`).then(r => r.data).catch(() => null)

export const createRouterConfig = (providerId: string, data: object): Promise<any> =>
    api.post(`/llm/virtual/${providerId}/router-config`, data).then(r => r.data)

export const updateRouterConfig = (providerId: string, data: object): Promise<any> =>
    api.put(`/llm/virtual/${providerId}/router-config`, data).then(r => r.data)

export const getCouncilConfig = (providerId: string): Promise<any> =>
    api.get(`/llm/virtual/${providerId}/council-config`).then(r => r.data).catch(() => null)

export const createCouncilConfig = (providerId: string, data: object): Promise<any> =>
    api.post(`/llm/virtual/${providerId}/council-config`, data).then(r => r.data)

export const updateCouncilConfig = (providerId: string, data: object): Promise<any> =>
    api.put(`/llm/virtual/${providerId}/council-config`, data).then(r => r.data)

export const getOptimizerConfig = (providerId: string): Promise<any> =>
    api.get(`/llm/virtual/${providerId}/optimizer-config`).then(r => r.data).catch(() => null)

export const createOptimizerConfig = (providerId: string, data: object): Promise<any> =>
    api.post(`/llm/virtual/${providerId}/optimizer-config`, data).then(r => r.data)

export const updateOptimizerConfig = (providerId: string, data: object): Promise<any> =>
    api.put(`/llm/virtual/${providerId}/optimizer-config`, data).then(r => r.data)

// ── Agents ──
export const listAgents = (): Promise<any> => api.get('/agents').then(r => r.data)
export const getAgent = (agentId: string): Promise<any> => api.get(`/agents/${agentId}`).then(r => r.data)
export const getWorkspaceAgent = (wid: string): Promise<any> => api.get(`/agents/workspaces/${wid}/agent`).then(r => r.data)
export const setWorkspaceAgent = (wid: string, agentId: string): Promise<any> =>
    api.put(`/agents/workspaces/${wid}/agent`, { agent_id: agentId }).then(r => r.data)

// ── HITL ──
export const listHITLPending = (workspaceId?: string): Promise<any> =>
    api.get('/hitl/pending', { params: workspaceId ? { workspace_id: workspaceId } : {} }).then(r => r.data)
export const approveHITL = (id: string, note?: string): Promise<any> =>
    api.post(`/hitl/${id}/approve`, { resolution_note: note }).then(r => r.data)
export const denyHITL = (id: string, note?: string): Promise<any> =>
    api.post(`/hitl/${id}/deny`, { resolution_note: note }).then(r => r.data)

// ── Visual Search ──
export const visualSearch = (wid: string, file: File): Promise<any> => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/workspaces/${wid}/knowledge/search/visual`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
}

export default api
