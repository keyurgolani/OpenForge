import axios from 'axios'
import type {
    Artifact,
    ArtifactCreate,
    ArtifactDiff,
    ArtifactLineage,
    ArtifactQueryParams,
    ArtifactsResponse,
    ArtifactSink,
    ArtifactSinksResponse,
    ArtifactUpdate,
    ArtifactVersion,
    ArtifactVersionCreate,
    ArtifactVersionsResponse,
} from '@/types/artifacts'
import type { CatalogListResponse, CatalogQueryParams, CatalogReadinessResponse } from '@/types/catalog'
import type { Checkpoint, Run, RunCompositeDebug, RunLineage, RunStep, RuntimeEvent } from '@/types/runs'
import type { WorkflowDefinition, WorkflowVersion } from '@/types/workflows'

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
export const mergeWorkspaces = (targetId: string, sourceId: string, deleteSource = true): Promise<any> =>
    api.post(`/workspaces/${targetId}/merge`, { source_workspace_id: sourceId, delete_source: deleteSource }).then(r => r.data)

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
    params?: { include_archived?: boolean; category?: 'chats' | 'delegated' | 'trash' },
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
export const bulkTrashConversations = (wid: string, category: 'chats' | 'delegated' = 'chats') =>
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
export const retrievalSearch = (data: object): Promise<any> =>
    api.post('/retrieval/search', data).then(r => r.data)
export const retrievalRead = (data: object): Promise<any> =>
    api.post('/retrieval/read', data).then(r => r.data)
export const buildEvidencePacket = (data: object): Promise<any> =>
    api.post('/retrieval/evidence', data).then(r => r.data)
export const getRetrievalQuery = (queryId: string): Promise<any> =>
    api.get(`/retrieval/queries/${queryId}`).then(r => r.data)
export const getConversationSummary = (conversationId: string): Promise<any> =>
    api.get(`/retrieval/conversations/${conversationId}/summary`).then(r => r.data)

// ── Prompts ──
export const listManagedPrompts = (params?: { limit?: number; skip?: number }): Promise<any> =>
    api.get('/prompts', { params }).then(r => r.data)
export const getManagedPrompt = (id: string): Promise<any> => api.get(`/prompts/${id}`).then(r => r.data)
export const updateManagedPrompt = (id: string, data: object): Promise<any> =>
    api.patch(`/prompts/${id}`, data).then(r => r.data)
export const listPromptVersions = (id: string): Promise<any> =>
    api.get(`/prompts/${id}/versions`).then(r => r.data)
export const previewManagedPrompt = (
    id: string,
    data: { version?: number | null; variables: Record<string, unknown> },
): Promise<any> => api.post(`/prompts/${id}/preview`, data).then(r => r.data)

// Backward-compatible prompt helpers
export const listPrompts = (): Promise<any> => listManagedPrompts()
export const updatePrompt = (id: string, data: { override: string | null }): Promise<any> =>
    updateManagedPrompt(id, { template: data.override ?? '' })

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

// ── Policies / Approvals ────────────────────────────────────────────────────
export const listPolicies = (params?: { limit?: number; skip?: number }): Promise<any> =>
    api.get('/policies', { params }).then(r => r.data)
export const getPolicy = (id: string): Promise<any> => api.get(`/policies/${id}`).then(r => r.data)
export const createToolPolicy = (data: object): Promise<any> =>
    api.post('/policies/tool', data).then(r => r.data)
export const updateToolPolicy = (id: string, data: object): Promise<any> =>
    api.patch(`/policies/tool/${id}`, data).then(r => r.data)
export const deleteToolPolicy = (id: string): Promise<void> =>
    api.delete(`/policies/tool/${id}`)
export const simulatePolicy = (data: object): Promise<any> =>
    api.post('/policies/simulate', data).then(r => r.data)
export const listApprovalRequests = (params?: { status?: string; limit?: number; offset?: number }): Promise<any> =>
    api.get('/policies/approvals', { params }).then(r => r.data)
export const getApprovalRequest = (id: string): Promise<any> =>
    api.get(`/policies/approvals/${id}`).then(r => r.data)
export const approveApprovalRequest = (id: string, note?: string): Promise<any> =>
    api.post(`/policies/approvals/${id}/approve`, { resolution_note: note }).then(r => r.data)
export const denyApprovalRequest = (id: string, note?: string): Promise<any> =>
    api.post(`/policies/approvals/${id}/deny`, { resolution_note: note }).then(r => r.data)

// Backward-compatible approval helpers for existing shell surfaces
function toLegacyHitl(approval: any) {
    return {
        id: approval.id,
        workspace_id: approval.scope_id ?? '',
        conversation_id: approval.payload_preview?.conversation_id ?? '',
        tool_id: approval.tool_name ?? approval.requested_action,
        tool_input: approval.payload_preview?.tool_input ?? approval.payload_preview ?? {},
        action_summary: approval.reason_text ?? approval.requested_action,
        risk_level: approval.risk_category,
        agent_id: approval.payload_preview?.agent_id ?? null,
        status: approval.status,
        resolution_note: approval.resolution_note ?? null,
        created_at: approval.requested_at,
        resolved_at: approval.resolved_at ?? null,
    }
}

export const listPendingHITL = async (params?: { workspace_id?: string }): Promise<any> => {
    const payload = await listApprovalRequests({ status: 'pending', limit: 200 })
    const approvals = (payload.approvals ?? []).map(toLegacyHitl)
    if (!params?.workspace_id) return approvals
    return approvals.filter((approval: any) => approval.workspace_id === params.workspace_id)
}
export const countPendingHITL = async (): Promise<any> => {
    const payload = await listApprovalRequests({ status: 'pending', limit: 200 })
    return { pending: payload.total ?? (payload.approvals ?? []).length }
}
export const getHITLHistory = async (params?: { workspace_id?: string; limit?: number }): Promise<any> => {
    const payload = await listApprovalRequests({ status: '', limit: params?.limit ?? 200 })
    const approvals = (payload.approvals ?? []).filter((approval: any) => approval.status !== 'pending').map(toLegacyHitl)
    if (!params?.workspace_id) return approvals
    return approvals.filter((approval: any) => approval.workspace_id === params.workspace_id)
}
export const approveHITL = (hitlId: string, note?: string): Promise<any> =>
    approveApprovalRequest(hitlId, note).then(toLegacyHitl)
export const denyHITL = (hitlId: string, note?: string): Promise<any> =>
    denyApprovalRequest(hitlId, note).then(toLegacyHitl)

export const getConversationStreamState = (wid: string, cid: string): Promise<any> =>
    api.get(`/workspaces/${wid}/conversations/${cid}/stream-state`).then(r => r.data)

// ── Legacy Tool Permission Helpers ──────────────────────────────────────────
export const listToolPermissions = async (): Promise<any> => {
    const payload = await listPolicies({ limit: 200 })
    const toolPolicies = (payload.policies ?? []).filter((policy: any) => policy.policy_kind === 'tool')
    if (toolPolicies.length === 0) return []
    const systemPolicy = toolPolicies[0]
    return [
        ...(systemPolicy.allowed_tools ?? []).map((toolId: string) => ({ tool_id: toolId, permission: 'allowed' })),
        ...(systemPolicy.approval_required_tools ?? []).map((toolId: string) => ({ tool_id: toolId, permission: 'hitl' })),
        ...(systemPolicy.blocked_tools ?? []).map((toolId: string) => ({ tool_id: toolId, permission: 'blocked' })),
    ]
}
export const getToolPermission = async (toolId: string): Promise<any> => {
    const permissions = await listToolPermissions()
    return permissions.find((entry: any) => entry.tool_id === toolId) ?? null
}
export const setToolPermission = async (toolId: string, permission: string): Promise<any> => {
    const payload = await listPolicies({ limit: 200 })
    const toolPolicies = (payload.policies ?? []).filter((policy: any) => policy.policy_kind === 'tool')
    const systemPolicy = toolPolicies[0]
    if (!systemPolicy) throw new Error('No tool policy available')

    const allowedTools = new Set<string>(systemPolicy.allowed_tools ?? [])
    const blockedTools = new Set<string>(systemPolicy.blocked_tools ?? [])
    const approvalTools = new Set<string>(systemPolicy.approval_required_tools ?? [])

    allowedTools.delete(toolId)
    blockedTools.delete(toolId)
    approvalTools.delete(toolId)

    if (permission === 'allowed') allowedTools.add(toolId)
    if (permission === 'blocked') blockedTools.add(toolId)
    if (permission === 'hitl') approvalTools.add(toolId)

    return updateToolPolicy(systemPolicy.id, {
        allowed_tools: Array.from(allowedTools),
        blocked_tools: Array.from(blockedTools),
        approval_required_tools: Array.from(approvalTools),
    })
}

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

// ── Domain APIs (Phase 1 Architecture) ───────────────────────────────────────

// Profiles
export const listProfiles = (params?: { skip?: number; limit?: number }): Promise<any> =>
    api.get('/profiles', { params }).then(r => r.data)
export const getProfile = (id: string): Promise<any> => api.get(`/profiles/${id}`).then(r => r.data)
export const resolveProfile = (id: string): Promise<any> => api.get(`/profiles/${id}/resolve`).then(r => r.data)
export const validateProfile = (id: string): Promise<any> => api.get(`/profiles/${id}/validate`).then(r => r.data)
export const compareProfiles = (leftId: string, rightId: string): Promise<any> =>
    api.get(`/profiles/compare/${leftId}/${rightId}`).then(r => r.data)
export const createProfile = (data: object): Promise<any> => api.post('/profiles', data).then(r => r.data)
export const updateProfile = (id: string, data: object): Promise<any> =>
    api.patch(`/profiles/${id}`, data).then(r => r.data)
export const deleteProfile = (id: string): Promise<void> => api.delete(`/profiles/${id}`)

// Profile building blocks
export const listCapabilityBundles = (): Promise<any> => api.get('/capability_bundle').then(r => r.data)
export const getCapabilityBundle = (id: string): Promise<any> =>
    api.get(`/capability_bundle/${id}`).then(r => r.data)
export const createCapabilityBundle = (data: object): Promise<any> =>
    api.post('/capability_bundle', data).then(r => r.data)
export const updateCapabilityBundle = (id: string, data: object): Promise<any> =>
    api.patch(`/capability_bundle/${id}`, data).then(r => r.data)
export const deleteCapabilityBundle = (id: string): Promise<void> =>
    api.delete(`/capability_bundle/${id}`)
export const listModelPolicies = (): Promise<any> => api.get('/model_policy').then(r => r.data)
export const listMemoryPolicies = (): Promise<any> => api.get('/memory_policy').then(r => r.data)
export const listOutputContracts = (): Promise<any> => api.get('/output_contract').then(r => r.data)
export const listSafetyPolicies = (): Promise<any> =>
    api.get('/policies').then(r => {
        const all = r.data?.policies ?? r.data ?? []
        return { policies: all.filter((p: any) => p.policy_kind === 'safety'), total: 0 }
    })

// Model Policy CRUD
export const getModelPolicy = (id: string): Promise<any> =>
    api.get(`/model_policy/${id}`).then(r => r.data)
export const createModelPolicy = (data: object): Promise<any> =>
    api.post('/model_policy', data).then(r => r.data)
export const updateModelPolicy = (id: string, data: object): Promise<any> =>
    api.patch(`/model_policy/${id}`, data).then(r => r.data)
export const deleteModelPolicy = (id: string): Promise<void> =>
    api.delete(`/model_policy/${id}`)

// Memory Policy CRUD
export const getMemoryPolicy = (id: string): Promise<any> =>
    api.get(`/memory_policy/${id}`).then(r => r.data)
export const createMemoryPolicy = (data: object): Promise<any> =>
    api.post('/memory_policy', data).then(r => r.data)
export const updateMemoryPolicy = (id: string, data: object): Promise<any> =>
    api.patch(`/memory_policy/${id}`, data).then(r => r.data)
export const deleteMemoryPolicy = (id: string): Promise<void> =>
    api.delete(`/memory_policy/${id}`)

// Output Contract CRUD
export const getOutputContract = (id: string): Promise<any> =>
    api.get(`/output_contract/${id}`).then(r => r.data)
export const createOutputContract = (data: object): Promise<any> =>
    api.post('/output_contract', data).then(r => r.data)
export const updateOutputContract = (id: string, data: object): Promise<any> =>
    api.patch(`/output_contract/${id}`, data).then(r => r.data)
export const deleteOutputContract = (id: string): Promise<void> =>
    api.delete(`/output_contract/${id}`)

// Safety Policy CRUD
export const createSafetyPolicy = (data: object): Promise<any> =>
    api.post('/policies/safety', data).then(r => r.data)
export const updateSafetyPolicy = (id: string, data: object): Promise<any> =>
    api.patch(`/policies/safety/${id}`, data).then(r => r.data)
export const deleteSafetyPolicy = (id: string): Promise<void> =>
    api.delete(`/policies/safety/${id}`)

// Workflows
export const listWorkflows = (params?: {
    skip?: number
    limit?: number
    workspace_id?: string
    status?: string
    is_system?: boolean
    is_template?: boolean
}): Promise<{ workflows: WorkflowDefinition[]; total: number }> =>
    api.get('/workflows', { params }).then(r => r.data)
export const getWorkflow = (id: string): Promise<WorkflowDefinition> => api.get(`/workflows/${id}`).then(r => r.data)
export const listWorkflowTemplates = (params?: { limit?: number; skip?: number; template_kind?: string }): Promise<{ workflows: WorkflowDefinition[]; total: number }> =>
    api.get('/workflows/templates', { params }).then(r => r.data)
export const getWorkflowTemplate = (id: string): Promise<WorkflowDefinition> => api.get(`/workflows/templates/${id}`).then(r => r.data)
export const cloneWorkflowTemplate = (
    id: string,
    data: { workspace_id?: string; name?: string; slug?: string },
): Promise<WorkflowDefinition> => api.post(`/workflows/templates/${id}/clone`, data).then(r => r.data)
export const listWorkflowVersions = (workflowId: string): Promise<{ versions: WorkflowVersion[]; total: number }> =>
    api.get(`/workflows/${workflowId}/versions`).then(r => r.data)
export const getWorkflowVersion = (workflowId: string, versionId: string): Promise<WorkflowVersion> =>
    api.get(`/workflows/${workflowId}/versions/${versionId}`).then(r => r.data)
export const createWorkflow = (data: object): Promise<WorkflowDefinition> => api.post('/workflows', data).then(r => r.data)
export const updateWorkflow = (id: string, data: object): Promise<WorkflowDefinition> =>
    api.patch(`/workflows/${id}`, data).then(r => r.data)
export const deleteWorkflow = (id: string): Promise<void> => api.delete(`/workflows/${id}`)

// Missions
export const listMissions = (params?: {
    skip?: number
    limit?: number
    workspace_id?: string
    status?: string
    is_system?: boolean
    is_template?: boolean
}): Promise<any> =>
    api.get('/missions', { params }).then(r => r.data)
export const getMission = (id: string): Promise<any> => api.get(`/missions/${id}`).then(r => r.data)
export const createMission = (data: object): Promise<any> => api.post('/missions', data).then(r => r.data)
export const updateMission = (id: string, data: object): Promise<any> =>
    api.patch(`/missions/${id}`, data).then(r => r.data)
export const deleteMission = (id: string): Promise<void> => api.delete(`/missions/${id}`)
export const launchMission = (id: string, data?: object): Promise<any> => api.post(`/missions/${id}/launch`, data ?? {}).then(r => r.data)
export const pauseMission = (id: string): Promise<any> => api.post(`/missions/${id}/pause`).then(r => r.data)
export const resumeMission = (id: string): Promise<any> => api.post(`/missions/${id}/resume`).then(r => r.data)
export const disableMission = (id: string): Promise<any> => api.post(`/missions/${id}/disable`).then(r => r.data)
export const activateMission = (id: string): Promise<any> => api.post(`/missions/${id}/activate`).then(r => r.data)
export const getMissionHealth = (id: string): Promise<any> => api.get(`/missions/${id}/health`).then(r => r.data)
export const getMissionRuns = (id: string, params?: { limit?: number }): Promise<any> => api.get(`/missions/${id}/runs`, { params }).then(r => r.data)
export const getMissionArtifacts = (id: string, params?: { limit?: number }): Promise<any> => api.get(`/missions/${id}/artifacts`, { params }).then(r => r.data)
export const getMissionDiagnostics = (id: string): Promise<any> => api.get(`/missions/${id}/diagnostics`).then(r => r.data)

// Triggers
export const listTriggers = (params?: { skip?: number; limit?: number }): Promise<any> =>
    api.get('/triggers', { params }).then(r => r.data)
export const getTrigger = (id: string): Promise<any> => api.get(`/triggers/${id}`).then(r => r.data)
export const createTrigger = (data: object): Promise<any> => api.post('/triggers', data).then(r => r.data)
export const updateTrigger = (id: string, data: object): Promise<any> =>
    api.patch(`/triggers/${id}`, data).then(r => r.data)
export const deleteTrigger = (id: string): Promise<void> => api.delete(`/triggers/${id}`)
export const enableTrigger = (id: string): Promise<any> => api.post(`/triggers/${id}/enable`).then(r => r.data)
export const disableTrigger = (id: string): Promise<any> => api.post(`/triggers/${id}/disable`).then(r => r.data)
export const getTriggerFireHistory = (id: string, params?: { limit?: number }): Promise<any> => api.get(`/triggers/${id}/fire-history`, { params }).then(r => r.data)
export const getTriggerDiagnostics = (id: string): Promise<any> => api.get(`/triggers/${id}/diagnostics`).then(r => r.data)

// Runs
export const listRuns = (params?: {
    skip?: number
    limit?: number
    workspace_id?: string
    status?: string
    run_type?: string
}): Promise<{ runs: Run[]; total: number }> =>
    api.get('/runs', { params }).then(r => r.data)
export const getRun = (id: string): Promise<Run> => api.get(`/runs/${id}`).then(r => r.data)
export const listRunSteps = (id: string): Promise<{ steps: RunStep[]; total: number }> =>
    api.get(`/runs/${id}/steps`).then(r => r.data)
export const getRunLineage = (id: string): Promise<RunLineage> => api.get(`/runs/${id}/lineage`).then(r => r.data)
export const getRunCompositeDebug = (id: string): Promise<RunCompositeDebug> => api.get(`/runs/${id}/composite`).then(r => r.data)
export const listRunCheckpoints = (id: string): Promise<{ checkpoints: Checkpoint[]; total: number }> =>
    api.get(`/runs/${id}/checkpoints`).then(r => r.data)
export const listRunEvents = (id: string): Promise<{ events: RuntimeEvent[]; total: number }> =>
    api.get(`/runs/${id}/events`).then(r => r.data)
export const createRun = (data: object): Promise<Run> => api.post('/runs', data).then(r => r.data)
export const updateRun = (id: string, data: object): Promise<Run> =>
    api.patch(`/runs/${id}`, data).then(r => r.data)

// Artifacts
export const listArtifacts = (params?: ArtifactQueryParams): Promise<ArtifactsResponse> =>
    api.get('/artifacts', { params }).then(r => r.data)
export const getArtifact = (id: string): Promise<Artifact> => api.get(`/artifacts/${id}`).then(r => r.data)
export const createArtifact = (data: ArtifactCreate): Promise<Artifact> => api.post('/artifacts', data).then(r => r.data)
export const updateArtifact = (id: string, data: ArtifactUpdate): Promise<Artifact> =>
    api.patch(`/artifacts/${id}`, data).then(r => r.data)
export const deleteArtifact = (id: string): Promise<void> => api.delete(`/artifacts/${id}`)
export const listArtifactVersions = (id: string): Promise<ArtifactVersionsResponse> =>
    api.get(`/artifacts/${id}/versions`).then(r => r.data)
export const createArtifactVersion = (id: string, data: ArtifactVersionCreate): Promise<Artifact> =>
    api.post(`/artifacts/${id}/versions`, data).then(r => r.data)
export const getArtifactVersion = (artifactId: string, versionId: string): Promise<ArtifactVersion> =>
    api.get(`/artifacts/${artifactId}/versions/${versionId}`).then(r => r.data)
export const getArtifactVersionDiff = (
    artifactId: string,
    versionId: string,
    compareToVersionId: string,
): Promise<ArtifactDiff> =>
    api.get(`/artifacts/${artifactId}/versions/${versionId}/diff`, { params: { compare_to_version_id: compareToVersionId } }).then(r => r.data)
export const promoteArtifactVersion = (artifactId: string, versionId: string): Promise<Artifact> =>
    api.post(`/artifacts/${artifactId}/versions/${versionId}/promote`).then(r => r.data)
export const getArtifactLineage = (id: string): Promise<ArtifactLineage> =>
    api.get(`/artifacts/${id}/lineage`).then(r => r.data)
export const listArtifactSinks = (id: string): Promise<ArtifactSinksResponse> =>
    api.get(`/artifacts/${id}/sinks`).then(r => r.data)
export const addArtifactSink = (
    id: string,
    data: Pick<ArtifactSink, 'sink_type' | 'sink_state' | 'destination_ref' | 'sync_status' | 'metadata'>,
): Promise<ArtifactSink> => api.post(`/artifacts/${id}/sinks`, data).then(r => r.data)

// Catalog
export const listCatalog = (params?: CatalogQueryParams): Promise<CatalogListResponse> =>
    api.get('/catalog', { params }).then(r => r.data)
export const checkCatalogReadiness = (catalogType: string, itemId: string): Promise<CatalogReadinessResponse> =>
    api.get(`/catalog/readiness/${catalogType}/${itemId}`).then(r => r.data)

// Profile Templates
export const listProfileTemplates = (params?: { skip?: number; limit?: number; is_featured?: boolean; tags?: string[] }): Promise<any> =>
    api.get('/profiles/templates', { params }).then(r => r.data)
export const getProfileTemplate = (id: string): Promise<any> => api.get(`/profiles/templates/${id}`).then(r => r.data)
export const cloneProfileTemplate = (id: string, data: { name?: string; slug?: string }): Promise<any> =>
    api.post(`/profiles/templates/${id}/clone`, data).then(r => r.data)

// Mission Templates
export const listMissionTemplates = (params?: { skip?: number; limit?: number; is_featured?: boolean; tags?: string[] }): Promise<any> =>
    api.get('/missions/templates', { params }).then(r => r.data)
export const getMissionTemplate = (id: string): Promise<any> => api.get(`/missions/templates/${id}`).then(r => r.data)
export const cloneMissionTemplate = (id: string, data: { workspace_id?: string; name?: string; slug?: string }): Promise<any> =>
    api.post(`/missions/templates/${id}/clone`, data).then(r => r.data)

export default api
