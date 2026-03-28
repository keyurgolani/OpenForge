import { useState, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Database,
  Download,
  Upload,
  FolderOpen,
  FileArchive,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { exportAllData, exportWorkspaceData, listWorkspaces } from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'

/* -------------------------------------------------------------------------- */
/* Download helper                                                            */
/* -------------------------------------------------------------------------- */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function DataPage() {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState('')

  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  })

  const workspaces: any[] = workspacesQuery.data?.workspaces ?? workspacesQuery.data ?? []

  const exportAllMut = useMutation({
    mutationFn: () => exportAllData(),
    onSuccess: (blob) => {
      downloadBlob(blob, `openforge-export-all-${Date.now()}.zip`)
      toast.success('Export complete')
    },
    onError: (err: any) => toast.error('Export failed', err?.response?.data?.detail ?? err.message),
  })

  const exportWorkspaceMut = useMutation({
    mutationFn: (workspaceId: string) => exportWorkspaceData(workspaceId),
    onSuccess: (blob) => {
      const ws = workspaces.find((w: any) => w.id === selectedWorkspace)
      const name = ws?.name ?? 'workspace'
      downloadBlob(blob, `openforge-export-${name}-${Date.now()}.zip`)
      toast.success('Workspace export complete')
    },
    onError: (err: any) => toast.error('Export failed', err?.response?.data?.detail ?? err.message),
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImportFile(file)
      setImportError('')
    }
  }

  const handleImport = () => {
    if (!importFile) {
      setImportError('Please select a file')
      return
    }
    // Data import is handled via the file upload API
    // For now, show a placeholder message
    toast.info('Import functionality', 'Upload the exported zip file to restore data.')
    setImportFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">Data</h2>
        <p className="text-sm text-fg-muted">Import and export your data for backups and migration</p>
      </div>

      {/* Export Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Download className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-fg">Export</h3>
            <p className="text-sm text-fg-muted">Download your data as a zip archive</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Export All */}
          <div className="rounded-lg border border-border/40 bg-bg-elevated p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-sunken">
                <FileArchive className="h-5 w-5 text-fg-muted" />
              </div>
              <div>
                <h4 className="font-label text-sm font-medium text-fg">Export All Data</h4>
                <p className="text-xs text-fg-muted">
                  Download all workspaces, knowledge, conversations, and settings
                </p>
              </div>
            </div>
            <button
              onClick={() => exportAllMut.mutate()}
              disabled={exportAllMut.isPending}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
                'text-sm font-medium text-fg-on-primary',
                'hover:bg-primary-hover disabled:opacity-50 transition-colors',
              )}
            >
              {exportAllMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export All
            </button>
          </div>

          {/* Export Workspace */}
          <div className="rounded-lg border border-border/40 bg-bg-elevated p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-sunken">
                <FolderOpen className="h-5 w-5 text-fg-muted" />
              </div>
              <div>
                <h4 className="font-label text-sm font-medium text-fg">Export Workspace</h4>
                <p className="text-xs text-fg-muted">
                  Download a single workspace and its contents
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                className={cn(
                  'flex-1 rounded-lg border border-border bg-bg py-2 px-3',
                  'font-body text-sm text-fg',
                  'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                )}
              >
                <option value="">Select workspace...</option>
                {workspaces.map((ws: any) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (selectedWorkspace) exportWorkspaceMut.mutate(selectedWorkspace)
                }}
                disabled={!selectedWorkspace || exportWorkspaceMut.isPending}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
                  'text-sm font-medium text-fg-on-primary',
                  'hover:bg-primary-hover disabled:opacity-50 transition-colors',
                )}
              >
                {exportWorkspaceMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Import Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10">
            <Upload className="h-4.5 w-4.5 text-secondary" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-fg">Import</h3>
            <p className="text-sm text-fg-muted">Restore data from a previous export</p>
          </div>
        </div>

        <div className="rounded-lg border border-border/40 bg-bg-elevated p-5 space-y-4">
          {importError && (
            <div className="flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
              <p className="text-sm text-danger">{importError}</p>
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8',
              'border-border/40 bg-bg-sunken/30',
              'hover:border-border/60 hover:bg-bg-sunken/50 transition-colors',
            )}
          >
            {importFile ? (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                  <Check className="h-5 w-5 text-success" />
                </div>
                <div className="text-center">
                  <p className="font-label text-sm font-medium text-fg">{importFile.name}</p>
                  <p className="text-xs text-fg-muted">
                    {(importFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-sunken">
                  <Upload className="h-5 w-5 text-fg-subtle" />
                </div>
                <div className="text-center">
                  <p className="font-display text-sm font-medium text-fg">
                    Click to select a file
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    Upload an exported .zip archive to restore data
                  </p>
                </div>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleFileSelect}
          />

          {importFile && (
            <button
              onClick={handleImport}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
                'text-sm font-medium text-fg-on-primary',
                'hover:bg-primary-hover transition-colors',
              )}
            >
              <Upload className="h-4 w-4" />
              Import Data
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
