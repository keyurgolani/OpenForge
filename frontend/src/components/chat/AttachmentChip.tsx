import { FileText, X, Loader2, AlertCircle, RotateCcw } from 'lucide-react'

interface AttachmentChipProps {
  filename: string
  size?: number
  status?: 'uploading' | 'extracted' | 'error'
  onRemove?: () => void
  onRetry?: () => void
}

export function AttachmentChip({ filename, size, status, onRemove, onRetry }: AttachmentChipProps) {
  const sizeLabel = size ? `${(size / 1024).toFixed(1)}KB` : null

  const icon =
    status === 'uploading' ? (
      <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
    ) : status === 'error' ? (
      <AlertCircle className="w-3 h-3 text-destructive" />
    ) : (
      <FileText className="w-3 h-3 text-muted-foreground" />
    )

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded-sm text-xs">
      {icon}
      <span className="text-foreground truncate max-w-[120px]">{filename}</span>
      {sizeLabel && <span className="text-muted-foreground">{sizeLabel}</span>}
      {status === 'error' && onRetry && (
        <button onClick={onRetry} className="text-destructive hover:text-foreground ml-0.5" aria-label={`Retry ${filename}`}>
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
      {onRemove && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-foreground ml-0.5" aria-label={`Remove ${filename}`}>
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
