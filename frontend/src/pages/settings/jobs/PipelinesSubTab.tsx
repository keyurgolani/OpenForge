import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, StickyNote, Bookmark, Image, Mic, FileText, Sheet,
    Presentation, ChevronRight, GitBranch,
} from 'lucide-react'
import { listSettings, updateSetting } from '@/lib/api'

// ── Pipeline definitions per knowledge type ─────────────────────────────────
const PIPELINE_CONFIG_KEY = 'pipeline_config'

type PipelineStep = { key: string; label: string }

const PIPELINES: Array<{
    type: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    color: string
    steps: PipelineStep[]
}> = [
    {
        type: 'note', label: 'Note', icon: StickyNote,
        color: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
        steps: [
            { key: 'chunking', label: 'Chunking' },
            { key: 'embedding', label: 'Embedding' },
            { key: 'intelligence', label: 'Intelligence' },
        ],
    },
    {
        type: 'bookmark', label: 'Bookmark', icon: Bookmark,
        color: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
        steps: [
            { key: 'extraction', label: 'Content Extraction' },
            { key: 'chunking', label: 'Chunking' },
            { key: 'embedding', label: 'Embedding' },
            { key: 'intelligence', label: 'Intelligence' },
        ],
    },
    {
        type: 'image', label: 'Image', icon: Image,
        color: 'text-pink-400 bg-pink-500/15 border-pink-500/30',
        steps: [
            { key: 'thumbnail', label: 'Thumbnail' },
            { key: 'ocr', label: 'OCR' },
            { key: 'clip_embedding', label: 'CLIP Embedding' },
            { key: 'vision_description', label: 'Vision Description' },
            { key: 'intelligence', label: 'Intelligence' },
        ],
    },
    {
        type: 'audio', label: 'Audio', icon: Mic,
        color: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
        steps: [
            { key: 'transcription', label: 'Transcription' },
            { key: 'chunking', label: 'Chunking' },
            { key: 'embedding', label: 'Embedding' },
            { key: 'intelligence', label: 'Intelligence' },
        ],
    },
    {
        type: 'pdf', label: 'PDF', icon: FileText,
        color: 'text-red-400 bg-red-500/15 border-red-500/30',
        steps: [
            { key: 'extraction', label: 'Text Extraction' },
            { key: 'chunking', label: 'Chunking' },
            { key: 'embedding', label: 'Embedding' },
            { key: 'intelligence', label: 'Intelligence' },
        ],
    },
    {
        type: 'document', label: 'Document', icon: FileText,
        color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30',
        steps: [
            { key: 'extraction', label: 'Text Extraction' },
            { key: 'chunking', label: 'Chunking' },
            { key: 'embedding', label: 'Embedding' },
            { key: 'intelligence', label: 'Intelligence' },
        ],
    },
    {
        type: 'sheet', label: 'Sheet', icon: Sheet,
        color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
        steps: [
            { key: 'conversion', label: 'Conversion' },
            { key: 'chunking', label: 'Chunking' },
            { key: 'embedding', label: 'Embedding' },
            { key: 'intelligence', label: 'Intelligence' },
        ],
    },
    {
        type: 'slides', label: 'Slides', icon: Presentation,
        color: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
        steps: [
            { key: 'conversion', label: 'Conversion' },
            { key: 'chunking', label: 'Chunking' },
            { key: 'embedding', label: 'Embedding' },
            { key: 'intelligence', label: 'Intelligence' },
        ],
    },
]

type PipelineConfig = Record<string, Record<string, boolean>>

function buildDefaultConfig(): PipelineConfig {
    const config: PipelineConfig = {}
    for (const pipeline of PIPELINES) {
        config[pipeline.type] = {}
        for (const step of pipeline.steps) {
            config[pipeline.type][step.key] = true
        }
    }
    return config
}

export function PipelinesSubTab() {
    const qc = useQueryClient()
    const { data: settings = [], isLoading } = useQuery<Array<{ key: string; value: unknown; category: string }>>({
        queryKey: ['app-settings'],
        queryFn: listSettings,
    })
    const [saving, setSaving] = useState(false)

    const pipelineConfig = useMemo<PipelineConfig>(() => {
        const raw = settings.find(item => item.key === PIPELINE_CONFIG_KEY)?.value
        const defaults = buildDefaultConfig()
        if (!raw || typeof raw !== 'object') return defaults
        const parsed = raw as PipelineConfig
        // Merge with defaults so new types/steps get enabled by default
        for (const pipeline of PIPELINES) {
            if (!parsed[pipeline.type]) {
                parsed[pipeline.type] = {}
            }
            for (const step of pipeline.steps) {
                if (parsed[pipeline.type][step.key] === undefined) {
                    parsed[pipeline.type][step.key] = true
                }
            }
        }
        return parsed
    }, [settings])

    const toggleStep = useCallback(async (knowledgeType: string, stepKey: string) => {
        setSaving(true)
        const updated = { ...pipelineConfig }
        updated[knowledgeType] = { ...updated[knowledgeType] }
        updated[knowledgeType][stepKey] = !updated[knowledgeType][stepKey]
        await updateSetting(PIPELINE_CONFIG_KEY, {
            value: updated,
            category: 'pipeline',
            sensitive: false,
        })
        qc.invalidateQueries({ queryKey: ['app-settings'] })
        setSaving(false)
    }, [pipelineConfig, qc])

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
                            Each knowledge type follows a processing pipeline. Click any step to enable or disable it.
                            Disabled steps will be skipped during processing.
                        </p>
                    </div>
                </div>
            </div>

            {PIPELINES.map(pipeline => {
                const Icon = pipeline.icon
                const typeConfig = pipelineConfig[pipeline.type] ?? {}
                const enabledCount = pipeline.steps.filter(s => typeConfig[s.key] !== false).length

                return (
                    <div key={pipeline.type} className="glass-card p-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${pipeline.color}`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium">{pipeline.label}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    {enabledCount}/{pipeline.steps.length} steps active
                                </p>
                            </div>
                        </div>

                        {/* Pipeline flow visualization */}
                        <div className="flex items-center gap-0 overflow-x-auto pb-1">
                            {pipeline.steps.map((step, idx) => {
                                const enabled = typeConfig[step.key] !== false
                                return (
                                    <div key={step.key} className="flex items-center flex-shrink-0">
                                        {/* Step node */}
                                        <button
                                            onClick={() => { void toggleStep(pipeline.type, step.key) }}
                                            disabled={saving}
                                            className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200 ${
                                                enabled
                                                    ? 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25 hover:border-accent/50'
                                                    : 'bg-muted/20 border-border/60 text-muted-foreground/70 hover:bg-muted/30 hover:border-border/60'
                                            } disabled:opacity-60`}
                                            title={`${enabled ? 'Disable' : 'Enable'} ${step.label}`}
                                        >
                                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors ${
                                                enabled ? 'bg-accent shadow-[0_0_6px_rgba(var(--accent-rgb),0.4)]' : 'bg-muted-foreground/30'
                                            }`} />
                                            <span className="text-xs font-medium whitespace-nowrap">{step.label}</span>
                                        </button>

                                        {/* Connector arrow between steps */}
                                        {idx < pipeline.steps.length - 1 && (
                                            <ChevronRight className={`w-4 h-4 mx-0.5 flex-shrink-0 ${
                                                enabled && typeConfig[pipeline.steps[idx + 1].key] !== false
                                                    ? 'text-accent/40'
                                                    : 'text-muted-foreground/70'
                                            }`} />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
