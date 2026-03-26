import { FileText, Save } from 'lucide-react'
import { WorkspaceDropdown } from './WorkspaceDropdown'

interface PreviewCardProps {
  attachmentId: string
  filename: string
  pipeline: string
  extractedText: string | null
  contentType: string
  fileSize: number
  onOpenModal: () => void
  onSaveToWorkspace: (workspaceId: string) => void
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

function PipelineBadge({ pipeline }: { pipeline: string }) {
  const colors = pipelineBadgeColors[pipeline] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors}`}>
      {pipeline}
    </span>
  )
}

export function PreviewCard({
  attachmentId,
  filename,
  pipeline,
  extractedText,
  contentType,
  fileSize,
  onOpenModal,
  onSaveToWorkspace,
}: PreviewCardProps) {
  const hasContent = extractedText != null && extractedText.length > 0
  const truncated = hasContent ? extractedText.slice(0, 150) : null

  return (
    <div
      className="group relative flex items-start gap-2 p-2.5 bg-card border border-border rounded-sm text-xs cursor-pointer hover:border-accent/40 transition-colors"
      onClick={onOpenModal}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenModal() } }}
      aria-label={`Preview extracted content from ${filename}`}
    >
      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-foreground font-medium truncate">{filename}</span>
          <PipelineBadge pipeline={pipeline} />
        </div>
        {hasContent ? (
          <p className="text-muted-foreground leading-relaxed line-clamp-2">
            {truncated}{extractedText.length > 150 ? '…' : ''}
          </p>
        ) : (
          <p className="text-muted-foreground/60 italic">No content extracted</p>
        )}
      </div>
      <div
        className="flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <WorkspaceDropdown
          onSelect={(workspaceId) => {
            onSaveToWorkspace(workspaceId)
          }}
          trigger={
            <button
              className="p-1 rounded hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Save ${filename} to workspace`}
            >
              <Save className="w-3.5 h-3.5" />
            </button>
          }
        />
      </div>
    </div>
  )
}
