import { FileText, X, Loader2, AlertCircle, RotateCcw, CheckCircle2 } from 'lucide-react'

interface AttachmentChipProps {
  filename: string
  size?: number
  status?: 'uploading' | 'extracted' | 'error'
  onRemove?: () => void
  onRetry?: () => void
  onClick?: () => void
}

export function AttachmentChip({ filename, size, status, onRemove, onRetry, onClick }: AttachmentChipProps) {
  const sizeLabel = size ? `${(size / 1024).toFixed(1)}KB` : null
  const isClickable = status === 'extracted' && !!onClick

  const icon =
    status === 'uploading' ? (
      <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
    ) : status === 'error' ? (
      <AlertCircle className="w-3 h-3 text-destructive" />
    ) : status === 'extracted' ? (
      <CheckCircle2 className="w-3 h-3 text-green-400" />
    ) : (
      <FileText className="w-3 h-3 text-muted-foreground" />
    )

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded-sm text-xs${isClickable ? ' cursor-pointer hover:border-accent/40 transition-colors' : ''}`}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!() } } : undefined}
    >
      {icon}
      <span className="text-foreground truncate max-w-[120px]">{filename}</span>
      {sizeLabel && <span className="text-muted-foreground">{sizeLabel}</span>}
      {status === 'error' && onRetry && (
        <button onClick={(e) => { e.stopPropagation(); onRetry() }} className="text-destructive hover:text-foreground ml-0.5" aria-label={`Retry ${filename}`}>
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="text-muted-foreground hover:text-foreground ml-0.5" aria-label={`Remove ${filename}`}>
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
