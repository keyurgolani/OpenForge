import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
    FolderOpen, Bot, Sliders, Timer, Wrench, Settings2, Layers,
    ShieldAlert, History, Download, Upload, Loader2, LogOut,
} from 'lucide-react'
import { checkAuth, logoutAuth } from '@/lib/api'
import type { SettingsTab } from './types'
import { toSettingsTab } from './constants'
import WorkspacesSettings from './WorkspacesTab'
import LLMSettings from './LLMSettingsTab'
import PromptsTab from './PromptsTab'
import JobsTab from './JobsTab'
import SkillsTab from './SkillsTab'
import ToolsTab from './ToolsTab'
import MCPTab from './MCPTab'
import HITLDashboardTab from './HITLDashboardTab'
import AuditTab from './AuditTab'
import ExportTab from './ExportTab'
import ImportTab from './ImportTab'

export default function SettingsPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const queryTab = searchParams.get('tab')
    const newWorkspaceRequested = searchParams.get('newWorkspace') === '1'
    const [activeTab, setActiveTab] = useState<SettingsTab>(() => toSettingsTab(queryTab))
    const [authEnabled, setAuthEnabled] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)

    useEffect(() => {
        const nextTab = toSettingsTab(queryTab)
        setActiveTab(prev => (prev === nextTab ? prev : nextTab))
    }, [queryTab])

    useEffect(() => {
        if (!newWorkspaceRequested) return
        setActiveTab('workspaces')
    }, [newWorkspaceRequested])

    useEffect(() => {
        checkAuth().then(d => setAuthEnabled(d.auth_enabled)).catch(() => {})
    }, [])

    const handleLogout = useCallback(async () => {
        setLoggingOut(true)
        try {
            await logoutAuth()
            window.dispatchEvent(new Event('openforge:unauthorized'))
        } finally {
            setLoggingOut(false)
        }
    }, [])

    const TABS: { id: SettingsTab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
        { id: 'workspaces', label: 'Workspaces', Icon: FolderOpen },
        { id: 'llm', label: 'AI Models', Icon: Bot },
        { id: 'prompts', label: 'Prompts', Icon: Sliders },
        { id: 'jobs', label: 'Pipelines', Icon: Timer },
        { id: 'skills', label: 'Skills', Icon: Wrench },
        { id: 'tools', label: 'Native Tools', Icon: Settings2 },
        { id: 'mcp', label: 'MCP', Icon: Layers },
        { id: 'hitl', label: 'HITL', Icon: ShieldAlert },
        { id: 'audit', label: 'Audit', Icon: History },
        { id: 'import', label: 'Import', Icon: Upload },
        { id: 'export', label: 'Export', Icon: Download },
    ]

    return (
        <div className="flex-1 min-h-0 overflow-hidden p-6 lg:p-8 flex flex-col">
            {/* Tabs + logout — always pinned */}
            <div className="flex shrink-0 items-start gap-3 mb-8">
                <div className="flex shrink-0 gap-2 p-1.5 glass-card w-full sm:w-fit rounded-2xl overflow-x-auto min-h-[52px]">
                    {TABS.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            onClick={() => {
                                setActiveTab(id)
                                const next = new URLSearchParams(searchParams)
                                next.set('tab', id)
                                if (id !== 'workspaces') {
                                    next.delete('newWorkspace')
                                }
                                setSearchParams(next, { replace: true })
                            }}
                            className={`flex min-h-9 items-center justify-center gap-2 px-5 py-2 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeTab === id
                                ? 'bg-accent/20 text-accent shadow-glass-inset ring-1 ring-accent/30'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </div>
                {authEnabled && (
                    <button
                        onClick={handleLogout}
                        disabled={loggingOut}
                        title="Sign out"
                        className="flex shrink-0 items-center gap-2 h-[52px] px-4 rounded-2xl glass-card text-sm text-muted-foreground hover:text-red-400 hover:border-red-500/20 transition-all disabled:opacity-50"
                    >
                        {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                        <span className="hidden sm:inline">Sign out</span>
                    </button>
                )}
            </div>

            {/* Tab content — fills remaining height; each tab manages its own scroll */}
            <div className="flex-1 min-h-0 flex flex-col">
                {activeTab === 'workspaces' && (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <WorkspacesSettings
                            openCreateRequested={newWorkspaceRequested}
                            onCreateRequestConsumed={() => {
                                if (!newWorkspaceRequested) return
                                const next = new URLSearchParams(searchParams)
                                next.delete('newWorkspace')
                                setSearchParams(next, { replace: true })
                            }}
                        />
                    </div>
                )}
                {activeTab === 'llm' && <LLMSettings />}
                {activeTab === 'prompts' && <PromptsTab />}
                {activeTab === 'jobs' && <JobsTab />}
                {activeTab === 'skills' && (
                    <div className="flex-1 min-h-0 overflow-y-auto"><SkillsTab /></div>
                )}
                {activeTab === 'tools' && (
                    <div className="flex-1 min-h-0 overflow-y-auto"><ToolsTab /></div>
                )}
                {activeTab === 'mcp' && (
                    <div className="flex-1 min-h-0 overflow-y-auto"><MCPTab /></div>
                )}
                {activeTab === 'hitl' && (
                    <div className="flex-1 min-h-0 overflow-y-auto"><HITLDashboardTab /></div>
                )}
                {activeTab === 'audit' && <AuditTab />}
                {activeTab === 'import' && (
                    <div className="flex-1 min-h-0 overflow-y-auto"><ImportTab /></div>
                )}
                {activeTab === 'export' && (
                    <div className="flex-1 min-h-0 overflow-y-auto"><ExportTab /></div>
                )}
            </div>
        </div>
    )
}
