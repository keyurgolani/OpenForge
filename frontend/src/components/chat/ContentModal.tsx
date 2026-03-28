import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Loader2, CheckCircle2, Pencil } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import ModalShell from '@/components/knowledge/shared/ModalShell'
import { WorkspaceDropdown } from './WorkspaceDropdown'
import { pipelineToKnowledgeType } from '@/lib/knowledgeTypeMapping'
import { formatBytes } from '@/lib/formatters'
import { useWorkspaces } from '@/hooks/useWorkspace'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

interface ContentModalProps {
  open: boolean
  onClose: () => void
  attachmentId: string
  filename: string
  pipeline: string
  fileSize: number
  extractedText: string
  contentType: string
}

const pipelineBadgeColors: Record<string, string> = {
  text: 'bg-blue-500/15 text-blue-400',
  pdf: 'bg-red-500/15 text-red-400',
  image: 'bg-green-500/15 text-green-400',
  audio: 'bg-purple-500/15 text-purple-400',
  document: 'bg-orange-500/15 text-orange-400',
  sheet: 'bg-emerald-500/15 text-emerald-400',
  slides: 'bg-yellow-500/15 text-yellow-400',
}

export function ContentModal({
  open,
  onClose,
  attachmentId,
  filename,
  pipeline,
  fileSize,
  extractedText,
  contentType,
}: ContentModalProps) {
  const [editorContent, setEditorContent] = useState(extractedText)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successWorkspaceName, setSuccessWorkspaceName] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: workspaces } = useWorkspaces()

  // Reset editor content when modal opens (discard edits on close/reopen)
  useEffect(() => {
    if (open) {
      setEditorContent(extractedText)
      setIsEditing(false)
      setSelectedWorkspaceId(null)
      setError(null)
      setSuccessWorkspaceName(null)
      setSaving(false)
    }
  }, [open, extractedText])

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isEditing])

  const renderedHtml = useMemo(() => md.render(editorContent || ''), [editorContent])

  const handleSave = useCallback(async () => {
    if (!selectedWorkspaceId) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/v1/attachments/${attachmentId}/save-to-knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: selectedWorkspaceId,
          knowledge_type: pipelineToKnowledgeType(pipeline),
          content: editorContent,
        }),
      })

      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Save failed (${res.status})`)
      }

      const wsName =
        (workspaces as { id: string; name: string }[] | undefined)?.find(
          (w) => w.id === selectedWorkspaceId,
        )?.name ?? 'workspace'

      setSuccessWorkspaceName(wsName)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save to workspace')
    } finally {
      setSaving(false)
    }
  }, [selectedWorkspaceId, attachmentId, pipeline, editorContent, workspaces])

  const badgeColors = pipelineBadgeColors[pipeline] ?? 'bg-muted text-muted-foreground'

  const header = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-medium text-foreground truncate">{filename}</span>
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeColors}`}>
        {pipeline}
      </span>
      <span className="text-xs text-muted-foreground">{formatBytes(fileSize)}</span>
    </div>
  )

  const footer = successWorkspaceName ? (
    <div className="flex items-center gap-2 text-sm text-green-400">
      <CheckCircle2 className="w-4 h-4" />
      <span>Saved to {successWorkspaceName}</span>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-muted/50 text-foreground hover:bg-muted transition-colors"
      >
        Close
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-3 w-full">
      {error && <span className="text-xs text-red-400 flex-1 truncate">{error}</span>}
      <div className="ml-auto flex items-center gap-2">
        <WorkspaceDropdown
          onSelect={setSelectedWorkspaceId}
          trigger={
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded-lg border border-border/60 text-foreground hover:bg-muted/50 transition-colors"
            >
              {selectedWorkspaceId
                ? (workspaces as { id: string; name: string }[] | undefined)?.find(
                    (w) => w.id === selectedWorkspaceId,
                  )?.name ?? 'Workspace'
                : 'Select workspace'}
            </button>
          }
        />
        <button
          type="button"
          disabled={!selectedWorkspaceId || saving}
          onClick={handleSave}
          className="px-3 py-1.5 text-xs rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          Save to Workspace
        </button>
      </div>
    </div>
  )

  return (
    <ModalShell isOpen={open} onClose={onClose} title={filename} size="xl" footer={footer}>
      <div className="flex flex-col h-full min-h-0">
        {header}
        <div className="relative flex-1 min-h-0 mt-3 rounded-lg border border-border/60 overflow-hidden">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              onBlur={() => setIsEditing(false)}
              className="absolute inset-0 w-full h-full p-4 bg-muted/30 text-sm text-foreground font-mono resize-none focus:outline-none"
              aria-label="Extracted content editor"
            />
          ) : (
            <div
              className="group relative h-full overflow-y-auto cursor-text p-4 bg-muted/10 hover:bg-muted/20 transition-colors"
              onClick={() => setIsEditing(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditing(true) } }}
              aria-label="Click to edit extracted content"
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground bg-muted/60">
                  <Pencil className="w-3 h-3" />
                  Click to edit
                </span>
              </div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-foreground/85 leading-relaxed [&_pre]:bg-muted/50 [&_pre]:rounded-md [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-medium [&_h4]:text-xs [&_h4]:font-medium [&_h5]:text-xs [&_h6]:text-xs"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  )
}
