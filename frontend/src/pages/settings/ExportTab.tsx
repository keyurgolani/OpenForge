import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    exportAllData, exportWorkspaceData, listWorkspaces,
} from '@/lib/api'
import {
    Loader2, AlertCircle, Download, Archive, FileArchive, FolderOpen,
} from 'lucide-react'
import type { WorkspaceRow } from './types'
import { getWorkspaceIcon } from './constants'

function ExportTab() {
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const [exporting, setExporting] = useState<'all' | string | null>(null)
    const [exportError, setExportError] = useState<string | null>(null)

    const handleExportAll = async () => {
        setExporting('all')
        setExportError(null)
        try {
            const blob = await exportAllData()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `openforge-export-${new Date().toISOString().split('T')[0]}.zip`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ?? (err as Error)?.message ?? 'Export failed'
            setExportError(msg)
        } finally {
            setExporting(null)
        }
    }

    const handleExportWorkspace = async (wsId: string) => {
        setExporting(wsId)
        setExportError(null)
        try {
            const blob = await exportWorkspaceData(wsId)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const ws = (workspaces as WorkspaceRow[]).find(w => w.id === wsId)
            a.download = `${ws?.name ?? 'workspace'}-export-${new Date().toISOString().split('T')[0]}.zip`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ?? (err as Error)?.message ?? 'Export failed'
            setExportError(msg)
        } finally {
            setExporting(null)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-semibold text-sm">Export Data</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Download your data as ZIP archives. Exports include chat threads, knowledge, attachments, and settings.
                </p>
            </div>

            {exportError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{exportError}</span>
                </div>
            )}

            {/* Export All */}
            <div className="glass-card p-4 border-accent/20 bg-accent/5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                            <Archive className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-medium text-sm">Export All Data</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Download a complete backup of all workspaces, including chat threads, knowledge, attachments, and settings configuration.
                            </p>
                        </div>
                    </div>
                    <button
                        className="btn-primary text-xs py-2 px-4 gap-2 shrink-0"
                        onClick={handleExportAll}
                        disabled={exporting !== null}
                    >
                        {exporting === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {exporting === 'all' ? 'Exporting...' : 'Export All'}
                    </button>
                </div>
            </div>

            {/* Per-workspace exports */}
            <div>
                <h4 className="text-sm font-medium mb-3">Export Individual Workspaces</h4>
                <div className="space-y-2">
                    {(workspaces as WorkspaceRow[]).map(ws => (
                        <div key={ws.id} className="glass-card px-4 py-3 flex items-center justify-between gap-3 rounded-xl border-border/20">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center flex-shrink-0">
                                    {getWorkspaceIcon(ws.icon)}
                                </div>
                                <div>
                                    <span className="font-medium text-sm">{ws.name}</span>
                                    <p className="text-xs text-muted-foreground">
                                        {ws.knowledge_count} knowledge · {ws.conversation_count} chats
                                    </p>
                                </div>
                            </div>
                            <button
                                className="btn-ghost text-xs py-1.5 px-3 gap-1.5 shrink-0"
                                onClick={() => handleExportWorkspace(ws.id)}
                                disabled={exporting !== null}
                            >
                                {exporting === ws.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
                                {exporting === ws.id ? 'Exporting...' : 'Export'}
                            </button>
                        </div>
                    ))}
                    {(workspaces as WorkspaceRow[]).length === 0 && (
                        <div className="text-center py-8 text-muted-foreground glass-card rounded-xl">
                            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No workspaces to export.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default ExportTab
