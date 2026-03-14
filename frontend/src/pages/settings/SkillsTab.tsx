import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, Plus, Search, CheckCircle2, AlertCircle, RefreshCw, Wrench, Trash2,
} from 'lucide-react'
import { listInstalledSkills, installSkill, searchSkills, removeSkill } from '@/lib/api'
import type { InstalledSkill } from './types'

function SkillsTab() {
    const qc = useQueryClient()
    const { data: skillsData, isLoading: loadingList } = useQuery({
        queryKey: ['installed-skills'],
        queryFn: listInstalledSkills,
        retry: false,
    })
    const installedSkills: InstalledSkill[] = skillsData?.skills ?? []
    const toolServerUnavailable = skillsData?.tool_server_available === false

    // Install panel state
    const [source, setSource] = useState('')
    const [skillNames, setSkillNames] = useState('')
    const [installing, setInstalling] = useState(false)
    const [installResult, setInstallResult] = useState<{ ok: boolean; message: string } | null>(null)

    // Search panel state
    const [searchSource, setSearchSource] = useState('')
    const [searching, setSearching] = useState(false)
    const [searchOutput, setSearchOutput] = useState<string | null>(null)
    const [searchError, setSearchError] = useState<string | null>(null)

    const [removing, setRemoving] = useState<string | null>(null)

    const handleInstall = async () => {
        if (!source.trim()) return
        setInstalling(true)
        setInstallResult(null)
        try {
            const names = skillNames.split(',').map(s => s.trim()).filter(Boolean)
            await installSkill(source.trim(), names.length ? names : undefined)
            setInstallResult({ ok: true, message: 'Skills installed successfully.' })
            setSource('')
            setSkillNames('')
            qc.invalidateQueries({ queryKey: ['installed-skills'] })
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(err)
            setInstallResult({ ok: false, message: msg })
        } finally {
            setInstalling(false)
        }
    }

    const handleSearch = async () => {
        if (!searchSource.trim()) return
        setSearching(true)
        setSearchOutput(null)
        setSearchError(null)
        try {
            const result = await searchSkills(searchSource.trim())
            setSearchOutput(result?.available_skills ?? JSON.stringify(result))
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(err)
            setSearchError(msg)
        } finally {
            setSearching(false)
        }
    }

    const handleRemove = async (name: string) => {
        if (!confirm(`Remove skill "${name}"?`)) return
        setRemoving(name)
        try {
            await removeSkill(name)
            qc.invalidateQueries({ queryKey: ['installed-skills'] })
        } finally {
            setRemoving(null)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-semibold text-sm">Agent Skills</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Install and manage reusable agent skill sets from GitHub repositories using the{' '}
                    <span className="font-mono text-accent">skills.sh</span> CLI.
                    Installed skills are shared across all workspaces.
                </p>
            </div>

            {toolServerUnavailable && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                        <span className="font-medium">Tool server not running.</span> The skills feature requires the{' '}
                        <span className="font-mono">tool-server</span> container. Start it with the full{' '}
                        <span className="font-mono">docker-compose.yml</span> to manage skills.
                    </span>
                </div>
            )}

            {/* Install */}
            <div className="glass-card p-4 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2"><Plus className="w-3.5 h-3.5 text-accent" /> Install Skills</h4>
                <div className="space-y-2">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Source</label>
                        <input
                            className="input text-sm"
                            placeholder="owner/repo/skill  or  https://skills.sh/owner/repo/skill"
                            value={source}
                            onChange={e => setSource(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void handleInstall() }}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                            Skill names <span className="opacity-60">(comma-separated, leave blank to install all)</span>
                        </label>
                        <input
                            className="input text-sm"
                            placeholder="react-best-practices, web-design-guidelines"
                            value={skillNames}
                            onChange={e => setSkillNames(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void handleInstall() }}
                        />
                    </div>
                </div>
                <button
                    className="btn-primary text-xs py-1.5 px-3"
                    onClick={handleInstall}
                    disabled={installing || !source.trim()}
                >
                    {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {installing ? 'Installing…' : 'Install'}
                </button>
                {installResult && (
                    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${installResult.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {installResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                        {installResult.message}
                    </div>
                )}
            </div>

            {/* Discover */}
            <div className="glass-card p-4 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2"><Search className="w-3.5 h-3.5 text-accent" /> Discover Skills</h4>
                <div className="flex gap-2">
                    <input
                        className="input text-sm flex-1"
                        placeholder="owner/repo to browse available skills"
                        value={searchSource}
                        onChange={e => setSearchSource(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleSearch() }}
                    />
                    <button
                        className="btn-ghost text-xs py-1.5 px-3"
                        onClick={handleSearch}
                        disabled={searching || !searchSource.trim()}
                    >
                        {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        Browse
                    </button>
                </div>
                {searchOutput && (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-foreground/70 bg-muted/30 rounded-lg p-3 max-h-48 border border-border/40">
                        {searchOutput}
                    </pre>
                )}
                {searchError && (
                    <p className="text-xs text-red-400">{searchError}</p>
                )}
            </div>

            {/* Installed list */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Installed Skills ({installedSkills.length})</h4>
                    <button className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5" onClick={() => qc.invalidateQueries({ queryKey: ['installed-skills'] })}>
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                </div>

                {loadingList && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                )}

                {!loadingList && installedSkills.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground glass-card rounded-xl">
                        <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No skills installed yet.</p>
                        <p className="text-xs mt-1 opacity-60">Use the install panel above or ask the agent to install a skill.</p>
                    </div>
                )}

                {!loadingList && installedSkills.length > 0 && (
                    <div className="space-y-2">
                        {installedSkills.map(skill => (
                            <div key={skill.name} className="glass-card px-4 py-3 flex items-start gap-3 rounded-xl border-border/50">
                                <Wrench className="w-4 h-4 text-accent/60 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <span className="font-medium text-sm">{skill.name}</span>
                                    {skill.description && (
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
                                    )}
                                    <p className="text-[10px] font-mono text-muted-foreground/50 mt-1 truncate">{skill.path}</p>
                                </div>
                                <button
                                    className="btn-ghost p-1.5 text-red-400 hover:bg-destructive/10 flex-shrink-0"
                                    onClick={() => void handleRemove(skill.name)}
                                    disabled={removing === skill.name}
                                    title="Remove skill"
                                >
                                    {removing === skill.name
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default SkillsTab
