import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, StickyNote, Bookmark, Image, Mic, FileText, Sheet,
    Presentation, GitBranch, Film, FileCode, BookOpen, File,
} from 'lucide-react'
import { listPipelines, getBackendSchemas, updatePipeline, listAvailableModels, getUnifiedModelStatus } from '@/lib/api'
import PipelineFlowGraph from '@/components/pipelines/PipelineFlowGraph'

// ── Types ───────────────────────────────────────────────────────────────────

interface PipelineSlot {
    slot_type: string
    display_name: string
    enabled: boolean
    active_backend: string
    available_backends: string[]
    execution: string
    timeout_seconds: number
    produces_vectors: boolean
    backend_config: Record<string, any>
}

interface PostStep { name: string; description: string; toggleable?: boolean; enabled?: boolean; config_key?: string | null }

interface PipelineDefinition {
    knowledge_type: string
    slots: PipelineSlot[]
    post_steps: PostStep[]
    consolidation_enabled: boolean
    consolidation_model: string | null
}

interface BackendSchema {
    label: string
    fields: Record<string, { label: string; type: string; description?: string; default?: any; options?: string[] }>
}

// ── Icon + color mapping ────────────────────────────────────────────────────

const TYPE_META: Record<string, {
    label: string
    icon: React.ComponentType<{ className?: string }>
    color: string
}> = {
    note: { label: 'Note', icon: StickyNote, color: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' },
    bookmark: { label: 'Bookmark', icon: Bookmark, color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
    file: { label: 'File', icon: File, color: 'text-slate-400 bg-slate-500/15 border-slate-500/30' },
    document: { label: 'Document', icon: FileText, color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30' },
    sheet: { label: 'Sheet', icon: Sheet, color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
    slides: { label: 'Slides', icon: Presentation, color: 'text-orange-400 bg-orange-500/15 border-orange-500/30' },
    pdf: { label: 'PDF', icon: FileText, color: 'text-red-400 bg-red-500/15 border-red-500/30' },
    image: { label: 'Image', icon: Image, color: 'text-pink-400 bg-pink-500/15 border-pink-500/30' },
    audio: { label: 'Audio', icon: Mic, color: 'text-purple-400 bg-purple-500/15 border-purple-500/30' },
    video: { label: 'Video', icon: Film, color: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' },
    gist: { label: 'Gist', icon: FileCode, color: 'text-teal-400 bg-teal-500/15 border-teal-500/30' },
    journal: { label: 'Journal', icon: BookOpen, color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
}

const FALLBACK_META = { label: 'Unknown', icon: File, color: 'text-muted-foreground bg-muted/20 border-border/30' }

const TYPE_ORDER = ['note', 'bookmark', 'pdf', 'document', 'sheet', 'slides', 'image', 'audio', 'video', 'file', 'gist', 'journal']

function sortPipelines(pipelines: PipelineDefinition[]): PipelineDefinition[] {
    return [...pipelines].sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.knowledge_type)
        const bi = TYPE_ORDER.indexOf(b.knowledge_type)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
}

// ── Component ───────────────────────────────────────────────────────────────

export function PipelinesSubTab() {
    const qc = useQueryClient()
    const { data: pipelines = [], isLoading } = useQuery<PipelineDefinition[]>({
        queryKey: ['pipelines'],
        queryFn: listPipelines,
    })
    const { data: schemas = {} } = useQuery<Record<string, BackendSchema>>({
        queryKey: ['backend-schemas'],
        queryFn: getBackendSchemas,
    })
    const { data: availableModels = [] } = useQuery<any[]>({
        queryKey: ['available-models'],
        queryFn: listAvailableModels,
    })
    const { data: modelStatus } = useQuery({
        queryKey: ['model-status'],
        queryFn: getUnifiedModelStatus,
    })
    const [saving, setSaving] = useState(false)
    const [openConfig, setOpenConfig] = useState<string | null>(null)

    const configurableBackends = useMemo(
        () => new Set(Object.keys(schemas).filter(k => Object.keys(schemas[k]?.fields ?? {}).length > 0)),
        [schemas],
    )

    const downloadedModels = useMemo(() => {
        const set = new Set<string>()
        for (const cat of modelStatus?.categories ?? []) {
            for (const m of cat.models) {
                if (m.downloaded) set.add(m.model_id)
            }
        }
        return set
    }, [modelStatus])

    const toggleSlot = useCallback(async (knowledgeType: string, slotType: string, currentEnabled: boolean) => {
        setSaving(true)
        try {
            await updatePipeline(knowledgeType, { slots: { [slotType]: { enabled: !currentEnabled } } })
            qc.invalidateQueries({ queryKey: ['pipelines'] })
        } finally { setSaving(false) }
    }, [qc])

    const updateConfig = useCallback(async (knowledgeType: string, slotType: string, key: string, value: any) => {
        setSaving(true)
        try {
            await updatePipeline(knowledgeType, { slots: { [slotType]: { backend_config: { [key]: value } } } })
            qc.invalidateQueries({ queryKey: ['pipelines'] })
            setOpenConfig(null)
        } finally { setSaving(false) }
    }, [qc])

    const togglePostStep = useCallback(async (knowledgeType: string, configKey: string, currentEnabled: boolean) => {
        setSaving(true)
        try {
            await updatePipeline(knowledgeType, { post_step_toggles: { [configKey]: !currentEnabled } } as any)
            qc.invalidateQueries({ queryKey: ['pipelines'] })
        } finally { setSaving(false) }
    }, [qc])

    const updatePostStepModel = useCallback(async (knowledgeType: string, stepKey: string, providerId: string, modelName: string) => {
        setSaving(true)
        try {
            await updatePipeline(knowledgeType, {
                post_step_models: { [stepKey]: { provider_id: providerId, model_name: modelName } }
            } as any)
            qc.invalidateQueries({ queryKey: ['pipelines'] })
            setOpenConfig(null)
        } finally { setSaving(false) }
    }, [qc])

    const updateSlotModel = useCallback(async (knowledgeType: string, slotType: string, providerId: string, modelName: string) => {
        setSaving(true)
        try {
            await updatePipeline(knowledgeType, {
                slots: { [slotType]: { backend_config: { provider_id: providerId, model_name: modelName } } }
            } as any)
            qc.invalidateQueries({ queryKey: ['pipelines'] })
            setOpenConfig(null)
        } finally { setSaving(false) }
    }, [qc])

    if (isLoading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    )

    return (
        <div className="space-y-4">
            <div className="glass-card p-4 border-accent/20 bg-accent/5">
                <div className="flex items-start gap-3">
                    <GitBranch className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <div className="text-sm flex-1 min-w-0">
                        <p className="font-medium mb-1">Processing Pipelines</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                            Each knowledge type flows through a configurable pipeline of extraction slots.
                            Toggle slots on/off and click the gear icon to configure per-slot settings.
                        </p>
                    </div>
                </div>
            </div>

            {sortPipelines(pipelines).map(pipeline => {
                const meta = TYPE_META[pipeline.knowledge_type] ?? FALLBACK_META
                const Icon = meta.icon
                const enabledCount = pipeline.slots.filter(s => s.enabled).length

                const hasExpanded = openConfig?.startsWith(`${pipeline.knowledge_type}:`) ?? false

                return (
                    <div key={pipeline.knowledge_type} className={`glass-card p-4 ${hasExpanded ? 'relative z-10 overflow-visible' : ''}`}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium">{meta.label}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    {enabledCount}/{pipeline.slots.length} slots active
                                </p>
                            </div>
                        </div>

                        <PipelineFlowGraph
                            slots={pipeline.slots}
                            postSteps={pipeline.post_steps ?? []}
                            knowledgeType={pipeline.knowledge_type}
                            schemas={schemas as any}
                            configurableBackends={configurableBackends}
                            saving={saving}
                            openConfig={openConfig}
                            providers={availableModels}
                            downloadedModels={downloadedModels}
                            onToggle={toggleSlot}
                            onToggleConfig={(key) => setOpenConfig(prev => prev === key ? null : key)}
                            onUpdateConfig={updateConfig}
                            onTogglePostStep={togglePostStep}
                            onUpdatePostStepModel={updatePostStepModel}
                            onUpdateSlotModel={updateSlotModel}
                        />
                    </div>
                )
            })}
        </div>
    )
}
