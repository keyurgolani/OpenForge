import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, CheckCircle, Play, Timer, Database, ScanEye, Zap,
    Star, Globe2, GitBranch,
} from 'lucide-react'
import { listSettings, updateSetting, reindexImages, reindexKnowledge } from '@/lib/api'
import type { JobsSubTab } from './types'
import {
    AUTO_KNOWLEDGE_INTELLIGENCE_KEY, AUTO_BOOKMARK_EXTRACTION_KEY,
} from './constants'
import { parseBoolSetting, TogglePill } from './components'
import { PipelinesSubTab } from './jobs/PipelinesSubTab'
import { SchedulesTab } from './jobs/SchedulesTab'

function JobsTab() {
    const [activeSubTab, setActiveSubTab] = useState<JobsSubTab>('pipelines')

    const tabs: Array<{ id: JobsSubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
        { id: 'pipelines', label: 'Pipelines', icon: GitBranch },
        { id: 'schedules', label: 'Schedules', icon: Timer },
        { id: 'automated-triggers', label: 'Automated Triggers', icon: Zap },
        { id: 'indexing', label: 'Indexing', icon: Database },
    ]

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-5">
            <div className="flex shrink-0 gap-2 p-1.5 glass-card w-fit rounded-2xl overflow-x-auto min-h-[48px]">
                {tabs.map(tab => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`flex min-h-8 items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeSubTab === tab.id
                                ? 'bg-accent/25 text-accent shadow-glass-inset ring-1 ring-accent/30'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
                {activeSubTab === 'pipelines' && <PipelinesSubTab />}
                {activeSubTab === 'schedules' && <SchedulesTab />}
                {activeSubTab === 'automated-triggers' && <AutomatedTriggersTab />}
                {activeSubTab === 'indexing' && <IndexingJobsTab />}
            </div>
        </div>
    )
}

export function IndexingJobsTab() {
    const [reindexingImages, setReindexingImages] = useState(false)
    const [reindexingKnowledge, setReindexingKnowledge] = useState(false)
    const [imageStarted, setImageStarted] = useState(false)
    const [knowledgeStarted, setKnowledgeStarted] = useState(false)

    const jobs = [
        {
            title: 'Image Embedding (CLIP)',
            description: 'Re-process CLIP visual embeddings for all image knowledge items. Required when changing the CLIP model.',
            icon: ScanEye,
            loading: reindexingImages,
            started: imageStarted,
            onRun: async () => {
                setReindexingImages(true)
                try {
                    await reindexImages()
                    setImageStarted(true)
                    setTimeout(() => setImageStarted(false), 3000)
                } finally {
                    setReindexingImages(false)
                }
            },
        },
        {
            title: 'Knowledge Embedding',
            description: 'Re-process text embeddings for all knowledge items. Required when changing the embedding model.',
            icon: Database,
            loading: reindexingKnowledge,
            started: knowledgeStarted,
            onRun: async () => {
                setReindexingKnowledge(true)
                try {
                    await reindexKnowledge()
                    setKnowledgeStarted(true)
                    setTimeout(() => setKnowledgeStarted(false), 3000)
                } finally {
                    setReindexingKnowledge(false)
                }
            },
        },
    ]

    return (
        <div className="space-y-3">
            <div>
                <h3 className="font-semibold text-sm">Indexing Jobs</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Manually trigger re-indexing of embeddings. These jobs run in the background.
                </p>
            </div>

            {jobs.map(job => {
                const Icon = job.icon
                return (
                    <div key={job.title} className="glass-card p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Icon className="w-4 h-4 text-accent" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">{job.title}</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{job.description}</p>
                                    {job.started && (
                                        <span className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                                            <CheckCircle className="w-3.5 h-3.5" /> Started in background
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={job.onRun}
                                disabled={job.loading}
                                className="btn-primary text-xs py-1.5 px-4 gap-1.5 flex-shrink-0"
                            >
                                {job.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                Run Now
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export function AutomatedTriggersTab() {
    const qc = useQueryClient()
    const { data: settings = [], isLoading } = useQuery<Array<{ key: string; value: unknown; category: string }>>({
        queryKey: ['app-settings'],
        queryFn: listSettings,
    })
    const [savingKey, setSavingKey] = useState<string | null>(null)

    const autoKnowledgeEnabled = useMemo(() => {
        const raw = settings.find(item => item.key === AUTO_KNOWLEDGE_INTELLIGENCE_KEY)?.value
        return parseBoolSetting(raw, true)
    }, [settings])

    const autoBookmarkEnabled = useMemo(() => {
        const raw = settings.find(item => item.key === AUTO_BOOKMARK_EXTRACTION_KEY)?.value
        return parseBoolSetting(raw, true)
    }, [settings])

    const toggleSetting = async (key: string, currentValue: boolean) => {
        setSavingKey(key)
        await updateSetting(key, {
            value: !currentValue,
            category: 'automation',
            sensitive: false,
        })
        qc.invalidateQueries({ queryKey: ['app-settings'] })
        setSavingKey(null)
    }

    if (isLoading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    )

    return (
        <div className="space-y-4">
            <div className="glass-card p-4 border-accent/20 bg-accent/5">
                <div className="flex items-start gap-3">
                    <Zap className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <div className="text-sm flex-1 min-w-0">
                        <p className="font-medium mb-1">Automated Triggers</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                            Control which job triggers run automatically when new knowledge is created.
                        </p>
                    </div>
                </div>
            </div>

            <button
                type="button"
                className="w-full rounded-xl border border-border/25 bg-muted/20 p-4 text-left hover:bg-muted/30 transition-colors disabled:opacity-70"
                onClick={() => { void toggleSetting(AUTO_KNOWLEDGE_INTELLIGENCE_KEY, autoKnowledgeEnabled) }}
                disabled={savingKey === AUTO_KNOWLEDGE_INTELLIGENCE_KEY}
            >
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                        <Star className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Knowledge Intelligence On Create</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Auto-generate title, keywords, summary, and insights when new Note knowledge is created.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {savingKey === AUTO_KNOWLEDGE_INTELLIGENCE_KEY && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                        <TogglePill checked={autoKnowledgeEnabled} />
                    </div>
                </div>
            </button>

            <button
                type="button"
                className="w-full rounded-xl border border-border/25 bg-muted/20 p-4 text-left hover:bg-muted/30 transition-colors disabled:opacity-70"
                onClick={() => { void toggleSetting(AUTO_BOOKMARK_EXTRACTION_KEY, autoBookmarkEnabled) }}
                disabled={savingKey === AUTO_BOOKMARK_EXTRACTION_KEY}
            >
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-300">
                        <Globe2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Bookmark Content Extraction On Create</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Auto-run bookmark extraction when bookmark knowledge is created or link-based knowledge is discovered.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {savingKey === AUTO_BOOKMARK_EXTRACTION_KEY && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                        <TogglePill checked={autoBookmarkEnabled} />
                    </div>
                </div>
            </button>
        </div>
    )
}

export default JobsTab
