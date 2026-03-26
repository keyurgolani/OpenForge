import axios from 'axios'
import type {
    Output,
    OutputCreate,
    OutputDiff,
    OutputLineage,
    OutputQueryParams,
    OutputsResponse,
    OutputSink,
    OutputSinksResponse,
    OutputUpdate,
    OutputVersion,
    OutputVersionCreate,
    OutputVersionsResponse,
} from '@/types/outputs'
import type { Checkpoint, Run, RunCompositeDebug, RunLineage, RunStep, RuntimeEvent } from '@/types/runs'
import type {
    AgentDefinition,
    AgentDefinitionCreate,
    AgentDefinitionListResponse,
    AgentDefinitionUpdate,
    AgentDefinitionVersion,
    AgentDefinitionVersionListResponse,
} from '@/types/agents'
import type { AutomationCreate, AutomationRunRequest, AutomationUpdate } from '@/types/automations'

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

// ── TTS Models ──
export const listTTSModels = (): Promise<any> => api.get('/models/tts').then(r => r.data)
export const downloadTTSModel = (modelId: string): Promise<any> => api.post('/models/tts/download', { model_id: modelId }).then(r => r.data)
export const deleteTTSModel = (modelId: string): Promise<any> => api.delete(`/models/tts/${modelId}`).then(r => r.data)
export const getTTSDefault = (): Promise<any> => api.get('/models/tts/default').then(r => r.data)
export const setTTSDefault = (modelId: string): Promise<any> => api.put('/models/tts/default', { model_id: modelId }).then(r => r.data)

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

export const getConversationStreamState = (wid: string, cid: string): Promise<any> =>
    api.get(`/workspaces/${wid}/conversations/${cid}/stream-state`).then(r => r.data)

// ── Policies (used by tools settings) ────────────────────────────────────────
export const listPolicies = (params?: { limit?: number; skip?: number }): Promise<any> =>
    api.get('/policies', { params }).then(r => r.data)
export const createToolPolicy = (data: object): Promise<any> =>
    api.post('/policies/tool', data).then(r => r.data)
export const updateToolPolicy = (id: string, data: object): Promise<any> =>
    api.patch(`/policies/tool/${id}`, data).then(r => r.data)

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

// ── HITL / Approvals (used by audit settings) ────────────────────────────────
export const listApprovalRequests = (params?: { status?: string; limit?: number; offset?: number }): Promise<any> =>
    api.get('/policies/approvals', { params }).then(r => r.data)

export const resolveApproval = (hitlId: string, approved: boolean, resolutionNote?: string): Promise<any> =>
    api.post(`/approvals/${hitlId}/resolve`, { approved, resolution_note: resolutionNote }).then(r => r.data)

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

export const getHITLHistory = async (params?: { workspace_id?: string; limit?: number }): Promise<any> => {
    const payload = await listApprovalRequests({ status: '', limit: params?.limit ?? 200 })
    const approvals = (payload.approvals ?? []).filter((approval: any) => approval.status !== 'pending').map(toLegacyHitl)
    if (!params?.workspace_id) return approvals
    return approvals.filter((approval: any) => approval.workspace_id === params.workspace_id)
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
export const checkAuth = (): Promise<{ authenticated: boolean; auth_enabled: boolean; onboarding_complete: boolean }> =>
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

// ── Runs ──
export const listRuns = (params?: {
    skip?: number
    limit?: number
    workspace_id?: string
    status?: string
    run_type?: string
    agent_id?: string
    automation_id?: string
    deployment_id?: string
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
export const replayRun = (id: string, fromStep: number): Promise<Run> =>
    api.post(`/runs/${id}/replay`, null, { params: { from_step: fromStep } }).then(r => r.data)

// Outputs
export const listOutputs = (params?: OutputQueryParams): Promise<OutputsResponse> =>
    api.get('/outputs', { params }).then(r => {
        const d = r.data
        return { outputs: d.outputs ?? [], total: d.total ?? 0 }
    })
export const getOutput = (id: string): Promise<Output> => api.get(`/outputs/${id}`).then(r => r.data)
export const createOutput = (data: OutputCreate): Promise<Output> => api.post('/outputs', data).then(r => r.data)
export const updateOutput = (id: string, data: OutputUpdate): Promise<Output> =>
    api.patch(`/outputs/${id}`, data).then(r => r.data)
export const deleteOutput = (id: string): Promise<void> => api.delete(`/outputs/${id}`)
export const listOutputVersions = (id: string): Promise<OutputVersionsResponse> =>
    api.get(`/outputs/${id}/versions`).then(r => r.data)
export const createOutputVersion = (id: string, data: OutputVersionCreate): Promise<Output> =>
    api.post(`/outputs/${id}/versions`, data).then(r => r.data)
export const getOutputVersion = (outputId: string, versionId: string): Promise<OutputVersion> =>
    api.get(`/outputs/${outputId}/versions/${versionId}`).then(r => r.data)
export const getOutputVersionDiff = (
    outputId: string,
    versionId: string,
    compareToVersionId: string,
): Promise<OutputDiff> =>
    api.get(`/outputs/${outputId}/versions/${versionId}/diff`, { params: { compare_to_version_id: compareToVersionId } }).then(r => r.data)
export const promoteOutputVersion = (outputId: string, versionId: string): Promise<Output> =>
    api.post(`/outputs/${outputId}/versions/${versionId}/promote`).then(r => r.data)
export const getOutputLineage = (id: string): Promise<OutputLineage> =>
    api.get(`/outputs/${id}/lineage`).then(r => r.data)
export const listOutputSinks = (id: string): Promise<OutputSinksResponse> =>
    api.get(`/outputs/${id}/sinks`).then(r => r.data)
export const addOutputSink = (
    id: string,
    data: Pick<OutputSink, 'sink_type' | 'sink_state' | 'destination_ref' | 'sync_status' | 'metadata'>,
): Promise<OutputSink> => api.post(`/outputs/${id}/sinks`, data).then(r => r.data)

// ── Agents ──
export const listAgents = (params?: { skip?: number; limit?: number }): Promise<AgentDefinitionListResponse> =>
    api.get('/agents', { params }).then(r => r.data)
export const getAgent = (id: string): Promise<AgentDefinition> => api.get(`/agents/${id}`).then(r => r.data)
export const createAgent = (data: AgentDefinitionCreate): Promise<AgentDefinition> => api.post('/agents', data).then(r => r.data)
export const updateAgent = (id: string, data: AgentDefinitionUpdate): Promise<AgentDefinition> => api.patch(`/agents/${id}`, data).then(r => r.data)
export const deleteAgent = (id: string) => api.delete(`/agents/${id}`)
export const listAgentVersions = (agentId: string, params?: { skip?: number; limit?: number }): Promise<AgentDefinitionVersionListResponse> =>
    api.get(`/agents/${agentId}/versions`, { params }).then(r => r.data)
export const getAgentVersion = (agentId: string, versionId: string): Promise<AgentDefinitionVersion> =>
    api.get(`/agents/${agentId}/versions/${versionId}`).then(r => r.data)

// ── Automations ──
export const listAutomations = (params?: { status?: string; agent_id?: string; skip?: number; limit?: number }): Promise<any> =>
    api.get('/automations', { params }).then(r => r.data)
export const getAutomation = (id: string): Promise<any> => api.get(`/automations/${id}`).then(r => r.data)
export const createAutomation = (data: AutomationCreate): Promise<any> => api.post('/automations', data).then(r => r.data)
export const updateAutomation = (id: string, data: AutomationUpdate): Promise<any> => api.patch(`/automations/${id}`, data).then(r => r.data)
export const deleteAutomation = (id: string) => api.delete(`/automations/${id}`)
export const compileAutomation = (id: string): Promise<any> => api.post(`/automations/${id}/compile`).then(r => r.data)
export const pauseAutomation = (id: string): Promise<any> => api.post(`/automations/${id}/pause`).then(r => r.data)
export const resumeAutomation = (id: string): Promise<any> => api.post(`/automations/${id}/resume`).then(r => r.data)
export const activateAutomation = (id: string): Promise<any> => api.post(`/automations/${id}/activate`).then(r => r.data)
export const getAutomationHealth = (id: string): Promise<any> => api.get(`/automations/${id}/health`).then(r => r.data)
export const runAutomation = (id: string, data: AutomationRunRequest): Promise<any> =>
    api.post(`/automations/${id}/run`, data).then(r => r.data)
export const listAutomationTemplates = (params?: { skip?: number; limit?: number }): Promise<any> =>
    api.get('/automations/templates', { params }).then(r => r.data)

// --- Automation Graph ---
export const getAutomationGraph = async (id: string) =>
    (await api.get(`/automations/${id}/graph`)).data
export const saveAutomationGraph = async (id: string, graph: { nodes: unknown[]; edges: unknown[]; static_inputs: unknown[] }) =>
    (await api.put(`/automations/${id}/graph`, graph)).data
export const getDeploymentSchema = async (id: string) =>
    (await api.get(`/automations/${id}/deployment-schema`)).data

// --- Deployments ---
export const deployAutomation = async (automationId: string, data: { workspace_id: string; input_values: Record<string, unknown>; schedule_expression?: string }) =>
    (await api.post(`/automations/${automationId}/deploy`, data)).data
export const listDeployments = async (params?: { status?: string; automation_id?: string; workspace_id?: string; skip?: number; limit?: number }) =>
    (await api.get('/deployments', { params })).data
export const getDeployment = async (id: string) =>
    (await api.get(`/deployments/${id}`)).data
export const pauseDeployment = async (id: string) =>
    (await api.post(`/deployments/${id}/pause`)).data
export const resumeDeployment = async (id: string) =>
    (await api.post(`/deployments/${id}/resume`)).data
export const teardownDeployment = async (id: string) =>
    (await api.post(`/deployments/${id}/teardown`)).data
export const runDeploymentNow = async (id: string) =>
    (await api.post(`/deployments/${id}/run-now`)).data

// --- Global Chat ---
export const listGlobalConversations = async (params?: { agent_id?: string; skip?: number; limit?: number; category?: string }) =>
    (await api.get('/chat/conversations', { params })).data
export const createGlobalConversation = async (data: { agent_id?: string; title?: string }) =>
    (await api.post('/chat/conversations', data)).data
export const getGlobalConversation = async (id: string, includeMessages = true) =>
    (await api.get(`/chat/conversations/${id}`, { params: { include_messages: includeMessages } })).data
export const updateGlobalConversation = async (id: string, data: { title?: string; title_locked?: boolean; is_pinned?: boolean; is_archived?: boolean }) =>
    (await api.put(`/chat/conversations/${id}`, data)).data
export const deleteGlobalConversation = async (id: string) =>
    api.delete(`/chat/conversations/${id}`)
export const permanentlyDeleteGlobalConversation = async (id: string) =>
    api.delete(`/chat/conversations/${id}/permanent`)
export const bulkTrashGlobalConversations = async (category = 'chats') =>
    (await api.post('/chat/conversations/bulk/trash', null, { params: { category } })).data
export const bulkRestoreGlobalConversations = async () =>
    (await api.post('/chat/conversations/bulk/restore')).data
export const bulkPermanentlyDeleteGlobalConversations = async () =>
    (await api.delete('/chat/conversations/bulk/permanent')).data
export const addGlobalMessage = async (conversationId: string, data: { content: string; role?: string; model_id?: string }) =>
    (await api.post(`/chat/conversations/${conversationId}/messages`, data)).data
export const getGlobalConversationStreamState = (cid: string): Promise<any> =>
    api.get(`/chat/conversations/${cid}/stream-state`).then(r => r.data)
export const exportGlobalConversation = (cid: string, format = 'json'): Promise<Blob> =>
    api.get(`/chat/conversations/${cid}/export`, { params: { format }, responseType: 'blob' }).then(r => r.data)

// --- Template Engine ---
export const getTemplateReference = async () =>
    (await api.get('/template-engine/reference')).data

export default api
