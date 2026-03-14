import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Play, Clock, Timer, Save } from 'lucide-react'
import {
    listSchedules, updateSchedule, runTaskNow, listSettings, updateSetting,
} from '@/lib/api'
import type { ScheduleEntry } from '../types'
import {
    INTERVAL_OPTS, TARGET_SCOPE_OPTS, CATEGORY_LABELS,
    CHAT_TRASH_RETENTION_KEY, DEFAULT_CHAT_TRASH_RETENTION_DAYS,
    MIN_CHAT_TRASH_RETENTION_DAYS, MAX_CHAT_TRASH_RETENTION_DAYS,
} from '../constants'

export function SchedulesTab() {
    const qc = useQueryClient()
    const { data: schedules = [], isLoading } = useQuery<ScheduleEntry[]>({
        queryKey: ['task-schedules'],
        queryFn: listSchedules,
    })
    const { data: settings = [] } = useQuery<Array<{ key: string; value: unknown; category: string }>>({
        queryKey: ['app-settings'],
        queryFn: listSettings,
    })
    const [running, setRunning] = useState<Record<string, boolean>>({})
    const [retentionDaysDraft, setRetentionDaysDraft] = useState(String(DEFAULT_CHAT_TRASH_RETENTION_DAYS))
    const [savingRetention, setSavingRetention] = useState(false)

    const retentionDays = useMemo(() => {
        const raw = settings.find(item => item.key === CHAT_TRASH_RETENTION_KEY)?.value
        const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
        if (!Number.isFinite(parsed)) return DEFAULT_CHAT_TRASH_RETENTION_DAYS
        return Math.max(MIN_CHAT_TRASH_RETENTION_DAYS, Math.min(MAX_CHAT_TRASH_RETENTION_DAYS, parsed))
    }, [settings])

    useEffect(() => {
        setRetentionDaysDraft(String(retentionDays))
    }, [retentionDays])

    const handleToggle = async (s: ScheduleEntry) => {
        await updateSchedule(s.id, { enabled: !s.enabled })
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
    }

    const handleInterval = async (s: ScheduleEntry, hours: number) => {
        await updateSchedule(s.id, { interval_hours: hours })
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
    }

    const handleRunNow = async (s: ScheduleEntry) => {
        setRunning(r => ({ ...r, [s.id]: true }))
        const payload = s.supports_target_scope
            ? {
                target_scope: (s.target_scope || 'remaining') as 'one' | 'remaining' | 'all',
                knowledge_id: s.target_scope === 'one' ? (s.knowledge_id || undefined) : undefined,
            }
            : undefined
        await runTaskNow(s.id, payload)
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
        qc.invalidateQueries({ queryKey: ['task-history'] })
        setTimeout(() => setRunning(r => ({ ...r, [s.id]: false })), 2000)
    }

    const handleTargetScope = async (s: ScheduleEntry, targetScope: 'one' | 'remaining' | 'all') => {
        await updateSchedule(s.id, { target_scope: targetScope })
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
    }

    const handleKnowledgeTarget = async (s: ScheduleEntry, knowledgeId: string) => {
        const trimmed = knowledgeId.trim()
        if (!trimmed) return
        await updateSchedule(s.id, { knowledge_id: trimmed })
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
    }

    const handleSaveRetention = async () => {
        const parsed = parseInt(retentionDaysDraft, 10)
        const normalized = Number.isFinite(parsed)
            ? Math.max(MIN_CHAT_TRASH_RETENTION_DAYS, Math.min(MAX_CHAT_TRASH_RETENTION_DAYS, parsed))
            : DEFAULT_CHAT_TRASH_RETENTION_DAYS

        setSavingRetention(true)
        await updateSetting(CHAT_TRASH_RETENTION_KEY, {
            value: normalized,
            category: 'chat',
            sensitive: false,
        })
        setRetentionDaysDraft(String(normalized))
        qc.invalidateQueries({ queryKey: ['app-settings'] })
        setSavingRetention(false)
    }

    if (isLoading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    )

    const categories = ['indexing', 'intelligence', 'maintenance']

    return (
        <div className="space-y-8">
            <div className="glass-card p-4 border-accent/20 bg-accent/5">
                <div className="flex items-start gap-3">
                    <Timer className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <div className="text-sm flex-1 min-w-0">
                        <p className="font-medium mb-1">Background Task Schedules</p>
                        <p className="text-muted-foreground text-xs leading-relaxed mb-3">
                            Configure which background tasks run automatically and how often.
                            Use "Run Now" to trigger a task immediately.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="text-xs text-muted-foreground" htmlFor="chat-trash-retention-days">
                                Chat trash retention
                            </label>
                            <input
                                id="chat-trash-retention-days"
                                type="number"
                                min={MIN_CHAT_TRASH_RETENTION_DAYS}
                                max={MAX_CHAT_TRASH_RETENTION_DAYS}
                                className="input h-8 w-24 text-xs"
                                value={retentionDaysDraft}
                                onChange={e => setRetentionDaysDraft(e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">days</span>
                            <button
                                className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5"
                                disabled={savingRetention || parseInt(retentionDaysDraft, 10) === retentionDays}
                                onClick={() => { void handleSaveRetention() }}
                            >
                                {savingRetention ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {categories.map(cat => {
                const catSchedules = (schedules as ScheduleEntry[]).filter(s => s.category === cat)
                if (!catSchedules.length) return null
                return (
                    <div key={cat}>
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="font-semibold text-sm">{CATEGORY_LABELS[cat]}</h3>
                            <div className="flex-1 h-px bg-border/50" />
                        </div>
                        <div className="space-y-3">
                            {catSchedules.map(s => (
                                <div key={s.id} className="glass-card p-4">
                                    <div className="flex items-start gap-4">
                                        {/* Enable/Disable toggle */}
                                        <button
                                            className={`mt-0.5 flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 relative ${s.enabled ? 'bg-accent' : 'bg-muted/60 hover:bg-muted'}`}
                                            onClick={() => handleToggle(s)}
                                            aria-label={s.enabled ? 'Disable' : 'Enable'}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${s.enabled ? 'translate-x-5' : ''}`} />
                                        </button>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-3 mb-1">
                                                <span className={`font-medium text-sm ${s.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                                                <button
                                                    className="btn-ghost text-xs py-1 px-2.5 gap-1 flex-shrink-0"
                                                    disabled={running[s.id] || (s.supports_target_scope && (s.target_scope ?? 'remaining') === 'one' && !s.knowledge_id)}
                                                    onClick={() => handleRunNow(s)}
                                                >
                                                    {running[s.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                                    Run now
                                                </button>
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-2">{s.description}</p>

                                            <div className="flex items-center gap-3 flex-wrap">
                                                <select
                                                    className="input text-xs py-1 pr-7 w-auto"
                                                    value={s.interval_hours}
                                                    disabled={!s.enabled}
                                                    onChange={e => handleInterval(s, parseInt(e.target.value))}
                                                >
                                                    {INTERVAL_OPTS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>

                                                {s.last_run && (
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        Last: {new Date(s.last_run).toLocaleString()}
                                                    </span>
                                                )}

                                                {s.supports_target_scope && (
                                                    <select
                                                        className="input text-xs py-1 pr-7 w-auto"
                                                        value={s.target_scope ?? 'remaining'}
                                                        disabled={!s.enabled}
                                                        onChange={e => handleTargetScope(s, e.target.value as 'one' | 'remaining' | 'all')}
                                                    >
                                                        {TARGET_SCOPE_OPTS.map(o => (
                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                )}

                                                {s.supports_target_scope && (s.target_scope ?? 'remaining') === 'one' && (
                                                    <input
                                                        className="input h-8 w-64 text-xs"
                                                        placeholder="Knowledge ID for one-target runs"
                                                        defaultValue={s.knowledge_id ?? ''}
                                                        onBlur={e => { void handleKnowledgeTarget(s, e.target.value) }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
