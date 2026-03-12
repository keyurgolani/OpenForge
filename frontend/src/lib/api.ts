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

// ── Local Models (Whisper + Embedding + CLIP + Marker) ──
export const listWhisperModels = (): Promise<any> =>
    api.get('/models/whisper').then(r => r.data)
export const downloadWhisperModel = (modelId: string): Promise<any> =>
    api.post('/models/whisper/download', { model_id: modelId }).then(r => r.data)
export const deleteWhisperModel = (modelId: string): Promise<any> =>
    api.delete(`/models/whisper/${modelId}`).then(r => r.data)
export const listEmbeddingModelStatus = (modelIds: string): Promise<any> =>
    api.get('/models/embeddings', { params: { model_ids: modelIds } }).then(r => r.data)
export const downloadEmbeddingModel = (modelId: string): Promise<any> =>
    api.post('/models/embeddings/download', { model_id: modelId }).then(r => r.data)
export const deleteEmbeddingModel = (modelId: string): Promise<any> =>
    api.delete(`/models/embeddings/${modelId}`).then(r => r.data)
export const resolveKnowledgeIds = (ids: string[]): Promise<any> =>
    api.post('/knowledge/resolve', { ids }).then(r => r.data)
export const listCLIPModels = (): Promise<any> =>
    api.get('/models/clip').then(r => r.data)
export const downloadCLIPModel = (modelId: string): Promise<any> =>
    api.post('/models/clip/download', { model_id: modelId }).then(r => r.data)
export const deleteCLIPModel = (modelId: string): Promise<any> =>
    api.delete(`/models/clip/${modelId}`).then(r => r.data)
export const getCLIPDefault = (): Promise<any> =>
    api.get('/models/clip/default').then(r => r.data)
export const setCLIPDefault = (modelId: string): Promise<any> =>
    api.put('/models/clip/default', { model_id: modelId }).then(r => r.data)
export const reindexImages = (): Promise<any> =>
    api.post('/models/reindex/images').then(r => r.data)
export const reindexKnowledge = (): Promise<any> =>
    api.post('/models/reindex/knowledge').then(r => r.data)
export const listMarkerModels = (): Promise<any> =>
    api.get('/models/marker').then(r => r.data)
export const downloadMarkerModel = (): Promise<any> =>
    api.post('/models/marker/download').then(r => r.data)
export const deleteMarkerModel = (): Promise<any> =>
    api.delete('/models/marker').then(r => r.data)

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
export const reprocessKnowledge = (wid: string, nid: string): Promise<any> =>
    api.post(`/workspaces/${wid}/knowledge/${nid}/reprocess`).then(r => r.data)
export const uploadKnowledge = (wid: string, file: File): Promise<any> => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/workspaces/${wid}/knowledge/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
}
export const getKnowledgeFileUrl = (wid: string, nid: string): string =>
    `/api/v1/workspaces/${wid}/knowledge/${nid}/file`
export const getKnowledgeThumbnailUrl = (wid: string, nid: string): string =>
    `/api/v1/workspaces/${wid}/knowledge/${nid}/thumbnail`
export const visualSearch = (wid: string, file: File, limit?: number): Promise<any> => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/workspaces/${wid}/knowledge/search/visual`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: limit ? { limit } : undefined,
    }).then(r => r.data)
}

// ── Conversations ──
export const listConversations = (
    wid: string,
    params?: { include_archived?: boolean; category?: 'chats' | 'subagent' | 'trash' },
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
export const bulkTrashConversations = (wid: string, category: 'chats' | 'subagent' = 'chats') =>
    api.post(`/workspaces/${wid}/conversations/bulk/trash`, null, { params: { category } }).then(r => r.data)
export const bulkRestoreConversations = (wid: string) =>
    api.post(`/workspaces/${wid}/conversations/bulk/restore`).then(r => r.data)
export const bulkPermanentlyDeleteConversations = (wid: string) =>
    api.delete(`/workspaces/${wid}/conversations/bulk/permanent`).then(r => r.data)
export const exportConversation = (
    wid: string,
    cid: string,
    format: 'json' | 'markdown' | 'txt' = 'json',
): Promise<Blob> =>
    api
        .get(`/workspaces/${wid}/conversations/${cid}/export`, {
            params: { format },
            responseType: 'blob',
        })
        .then(r => r.data)

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
export const getTaskHistory = (params?: { task_type?: string; workspace_id?: string; limit?: number }): Promise<any> =>
    api.get('/tasks/history', { params }).then(r => r.data)
export const getToolCallLogs = (params?: { workspace_id?: string; tool_name?: string; limit?: number }): Promise<any> =>
    api.get('/tasks/tool-call-logs', { params }).then(r => r.data)

// ── Skills ───────────────────────────────────────────────────────────────────
export const listInstalledSkills = (): Promise<any> => api.get('/skills').then(r => r.data)
export const installSkill = (source: string, skill_names?: string[]): Promise<any> =>
    api.post('/skills/install', { source, skill_names }).then(r => r.data)
export const searchSkills = (source: string): Promise<any> =>
    api.get('/skills/search', { params: { source } }).then(r => r.data)
export const removeSkill = (name: string): Promise<any> =>
    api.delete(`/skills/${encodeURIComponent(name)}`).then(r => r.data)

// ── Attachments ──────────────────────────────────────────────────────────────
export const saveAttachmentToKnowledge = (attachmentId: string, workspaceId: string): Promise<any> =>
    api.post(`/attachments/${attachmentId}/save-to-knowledge`, { workspace_id: workspaceId }).then(r => r.data)

// ── Tools registry ────────────────────────────────────────────────────────────
export const getToolRegistry = (): Promise<any> => api.get('/tools/registry').then(r => r.data)

// ── Export ───────────────────────────────────────────────────────────────────
export const exportAllData = (): Promise<Blob> =>
    api.get('/export/all', { responseType: 'blob' }).then(r => r.data)
export const exportWorkspaceData = (workspaceId: string): Promise<Blob> =>
    api.get(`/export/workspace/${workspaceId}`, { responseType: 'blob' }).then(r => r.data)

// ── HITL ─────────────────────────────────────────────────────────────────────
export const listPendingHITL = (params?: { workspace_id?: string }): Promise<any> =>
    api.get('/hitl/pending', { params }).then(r => r.data)
export const countPendingHITL = (): Promise<any> => api.get('/hitl/pending/count').then(r => r.data)
export const getHITLHistory = (params?: { workspace_id?: string; limit?: number }): Promise<any> =>
    api.get('/hitl/history', { params }).then(r => r.data)
export const approveHITL = (hitlId: string, note?: string): Promise<any> =>
    api.post(`/hitl/${hitlId}/approve`, { resolution_note: note }).then(r => r.data)
export const denyHITL = (hitlId: string, note?: string): Promise<any> =>
    api.post(`/hitl/${hitlId}/deny`, { resolution_note: note }).then(r => r.data)

// ── Agents ───────────────────────────────────────────────────────────────────
export const listAgents = (): Promise<any> => api.get('/agents/').then(r => r.data)
export const getAgent = (id: string): Promise<any> => api.get(`/agents/${id}`).then(r => r.data)
export const updateAgent = (id: string, data: object): Promise<any> =>
    api.put(`/agents/${id}`, data).then(r => r.data)
export const getWorkspaceAgent = (wid: string): Promise<any> =>
    api.get(`/agents/workspace/${wid}/agent`).then(r => r.data)
export const setWorkspaceAgent = (wid: string, agentId: string): Promise<any> =>
    api.put(`/agents/workspace/${wid}/agent`, { agent_id: agentId }).then(r => r.data)

// ── Agent Triggers ──────────────────────────────────────────────────────────
export const triggerAgent = (agentId: string, data: { instruction: string; workspace_id: string }): Promise<any> =>
    api.post(`/agents/${agentId}/trigger`, data).then(r => r.data)

// ── Agent Schedules ─────────────────────────────────────────────────────────
export const listAgentSchedules = (wid: string): Promise<any> =>
    api.get(`/workspaces/${wid}/agent-schedules`).then(r => r.data)
export const createAgentSchedule = (wid: string, data: object): Promise<any> =>
    api.post(`/workspaces/${wid}/agent-schedules`, data).then(r => r.data)
export const updateAgentSchedule = (wid: string, id: string, data: object): Promise<any> =>
    api.put(`/workspaces/${wid}/agent-schedules/${id}`, data).then(r => r.data)
export const deleteAgentSchedule = (wid: string, id: string): Promise<any> =>
    api.delete(`/workspaces/${wid}/agent-schedules/${id}`).then(r => r.data)

// ── Continuous Targets ──────────────────────────────────────────────────────
export const listTargets = (wid: string): Promise<any> =>
    api.get(`/workspaces/${wid}/targets`).then(r => r.data)
export const updateTarget = (wid: string, name: string, data: object): Promise<any> =>
    api.post(`/workspaces/${wid}/targets/${encodeURIComponent(name)}/update`, data).then(r => r.data)

// ── Agent Executions ─────────────────────────────────────────────────────────
export const listAllExecutions = (params?: object): Promise<any> =>
    api.get('/agents/executions', { params }).then(r => r.data)
export const listExecutions = (wid: string, params?: object): Promise<any> =>
    api.get(`/agents/workspace/${wid}/executions`, { params }).then(r => r.data)
export const getConversationStreamState = (wid: string, cid: string): Promise<any> =>
    api.get(`/agents/workspace/${wid}/conversations/${cid}/stream-state`).then(r => r.data)
export const getExecution = (wid: string, eid: string): Promise<any> =>
    api.get(`/agents/workspace/${wid}/executions/${eid}`).then(r => r.data)

// ── Tool Permissions ─────────────────────────────────────────────────────────
export const listToolPermissions = (): Promise<any> => api.get('/tools/permissions').then(r => r.data)
export const getToolPermission = (toolId: string): Promise<any> =>
    api.get(`/tools/${toolId}/permission`).then(r => r.data)
export const setToolPermission = (toolId: string, permission: string): Promise<any> =>
    api.put(`/tools/${toolId}/permission`, { permission }).then(r => r.data)

// ── MCP Servers ───────────────────────────────────────────────────────────────
export const listMCPServers = (): Promise<any> => api.get('/mcp/servers').then(r => r.data)
export const createMCPServer = (data: object): Promise<any> => api.post('/mcp/servers', data).then(r => r.data)
export const getMCPServer = (id: string): Promise<any> => api.get(`/mcp/servers/${id}`).then(r => r.data)
export const updateMCPServer = (id: string, data: object): Promise<any> =>
    api.put(`/mcp/servers/${id}`, data).then(r => r.data)
export const deleteMCPServer = (id: string) => api.delete(`/mcp/servers/${id}`)
export const discoverMCPServer = (id: string): Promise<any> =>
    api.post(`/mcp/servers/${id}/discover`).then(r => r.data)
export const updateMCPToolOverride = (
    serverId: string,
    toolName: string,
    data: { risk_level?: string; is_enabled?: boolean },
): Promise<any> => api.put(`/mcp/servers/${serverId}/tools/${encodeURIComponent(toolName)}`, data).then(r => r.data)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const checkAuth = (): Promise<{ authenticated: boolean; auth_enabled: boolean }> =>
    fetch('/api/auth/check').then(r => r.json())

export const loginAuth = (password: string): Promise<{ authenticated: boolean; auth_enabled: boolean }> =>
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    }).then(r => {
        if (!r.ok) throw new Error('Invalid password')
        return r.json()
    })

export const logoutAuth = (): Promise<void> =>
    fetch('/api/auth/logout', { method: 'POST' }).then(() => undefined)

export default api
