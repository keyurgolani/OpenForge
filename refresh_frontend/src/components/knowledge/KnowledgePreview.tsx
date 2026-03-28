import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Download,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Loader2,
  Tag,
  Calendar,
  FileText,
  ZoomIn,
  ZoomOut,
  X,
  Music,
  Globe,
  Image as ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  getKnowledgeFileUrl,
  getKnowledgeThumbnailUrl,
  reprocessKnowledge,
  generateKnowledgeIntelligence,
} from '@/lib/api'
import { getTypeConfig } from './KnowledgeCard'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface KnowledgeData {
  id: string
  title: string
  content?: string | null
  knowledge_type: string
  tags?: string[] | null
  source_url?: string | null
  thumbnail_url?: string | null
  word_count?: number | null
  created_at?: string | null
  updated_at?: string | null
  ai_summary?: string | null
  ai_insights?: any | null
  extracted_content?: string | null
}

interface KnowledgePreviewProps {
  workspaceId: string
  knowledge: KnowledgeData
}

/* -------------------------------------------------------------------------- */
/* Action button                                                              */
/* -------------------------------------------------------------------------- */

interface ActionButtonProps {
  icon: typeof Download
  label: string
  onClick: () => void
  loading?: boolean
  variant?: 'default' | 'primary' | 'secondary'
}

function ActionButton({ icon: Icon, label, onClick, loading, variant = 'default' }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3.5 py-2',
        'font-label text-xs font-medium',
        'transition-colors focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-primary text-fg-on-primary hover:bg-primary-hover',
        variant === 'secondary' && 'bg-secondary/10 text-secondary hover:bg-secondary/20',
        variant === 'default' &&
          'border border-border/40 bg-bg-elevated text-fg-muted hover:bg-bg-sunken hover:text-fg',
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      )}
      {label}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Image preview with zoom                                                    */
/* -------------------------------------------------------------------------- */

function ImagePreview({ workspaceId, knowledge }: KnowledgePreviewProps) {
  const [zoomed, setZoomed] = useState(false)
  const fileUrl = getKnowledgeFileUrl(workspaceId, knowledge.id)

  return (
    <>
      <div className="flex items-center justify-center rounded-lg bg-bg-sunken p-4">
        <img
          src={fileUrl}
          alt={knowledge.title}
          className={cn(
            'max-h-[60vh] rounded-md object-contain transition-transform duration-300',
            'cursor-zoom-in',
          )}
          onClick={() => setZoomed(true)}
        />
      </div>

      {/* Zoom overlay */}
      {zoomed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setZoomed(false)}
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={fileUrl}
            alt={knowledge.title}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* PDF preview                                                                */
/* -------------------------------------------------------------------------- */

function PDFPreview({ workspaceId, knowledge }: KnowledgePreviewProps) {
  const fileUrl = getKnowledgeFileUrl(workspaceId, knowledge.id)

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border/40 bg-bg-sunken">
        <iframe
          src={fileUrl}
          title={knowledge.title}
          className="h-[60vh] w-full"
        />
      </div>
      <div className="flex items-center gap-2">
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border border-border/40 bg-bg-elevated px-3.5 py-2',
            'font-label text-xs font-medium text-fg-muted',
            'transition-colors hover:bg-bg-sunken hover:text-fg',
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in new tab
        </a>
      </div>

      {/* Extracted content */}
      {(knowledge.content || knowledge.extracted_content) && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-4">
          <h4 className="mb-2 font-label text-xs font-medium text-fg-muted">Extracted Content</h4>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
            {knowledge.extracted_content ?? knowledge.content}
          </p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Audio preview                                                              */
/* -------------------------------------------------------------------------- */

function AudioPreview({ workspaceId, knowledge }: KnowledgePreviewProps) {
  const fileUrl = getKnowledgeFileUrl(workspaceId, knowledge.id)

  return (
    <div className="space-y-4">
      {/* Player */}
      <div className="flex flex-col items-center gap-6 rounded-lg bg-bg-sunken p-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-amber-500/10">
          <Music className="h-12 w-12 text-amber-500" strokeWidth={1.25} />
        </div>
        <audio
          controls
          src={fileUrl}
          className="w-full max-w-lg"
        >
          Your browser does not support the audio element.
        </audio>
      </div>

      {/* Transcription */}
      {knowledge.content && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-4">
          <h4 className="mb-2 font-label text-xs font-medium text-fg-muted">Transcription</h4>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
            {knowledge.content}
          </p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Bookmark preview                                                           */
/* -------------------------------------------------------------------------- */

function BookmarkPreview({ workspaceId, knowledge }: KnowledgePreviewProps) {
  const thumbnailUrl = getKnowledgeThumbnailUrl(workspaceId, knowledge.id)

  return (
    <div className="space-y-4">
      {/* URL card */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated p-5">
        <div className="flex items-start gap-4">
          {/* Thumbnail */}
          <div className="shrink-0">
            <img
              src={thumbnailUrl}
              alt=""
              className="h-16 w-24 rounded-md border border-border/30 bg-bg-sunken object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold text-fg">
              {knowledge.title}
            </h3>
            {knowledge.source_url && (
              <a
                href={knowledge.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Globe className="h-3 w-3" />
                {knowledge.source_url}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Extracted content */}
      {(knowledge.content || knowledge.extracted_content) && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-4">
          <h4 className="mb-2 font-label text-xs font-medium text-fg-muted">Extracted Content</h4>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
            {knowledge.extracted_content ?? knowledge.content}
          </p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Generic file preview                                                       */
/* -------------------------------------------------------------------------- */

function GenericPreview({ workspaceId, knowledge }: KnowledgePreviewProps) {
  const cfg = getTypeConfig(knowledge.knowledge_type)
  const Icon = cfg.icon

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4 rounded-lg bg-bg-sunken p-12">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl"
          style={{ backgroundColor: cfg.bg }}
        >
          <Icon className="h-10 w-10" style={{ color: cfg.color }} strokeWidth={1.25} />
        </div>
        <p className="font-display text-base font-medium text-fg">{knowledge.title}</p>
        <p className="text-xs text-fg-muted">{cfg.label}</p>
      </div>

      {knowledge.content && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-4">
          <h4 className="mb-2 font-label text-xs font-medium text-fg-muted">Content</h4>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
            {knowledge.content}
          </p>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function KnowledgePreview({ workspaceId, knowledge }: KnowledgePreviewProps) {
  const queryClient = useQueryClient()
  const fileUrl = getKnowledgeFileUrl(workspaceId, knowledge.id)
  const tags = knowledge.tags ?? []

  const reprocessMutation = useMutation({
    mutationFn: () => reprocessKnowledge(workspaceId, knowledge.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId, knowledge.id] })
    },
  })

  const intelligenceMutation = useMutation({
    mutationFn: () => generateKnowledgeIntelligence(workspaceId, knowledge.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId, knowledge.id] })
    },
  })

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = knowledge.title || 'download'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const knowledgeType = knowledge.knowledge_type?.toLowerCase()
  const createdAt = knowledge.created_at
    ? format(new Date(knowledge.created_at), 'MMM d, yyyy')
    : null
  const updatedAt = knowledge.updated_at
    ? formatDistanceToNow(new Date(knowledge.updated_at), { addSuffix: true })
    : null

  /* -- Render the right preview -------------------------------------------- */

  const renderPreview = () => {
    switch (knowledgeType) {
      case 'image':
        return <ImagePreview workspaceId={workspaceId} knowledge={knowledge} />
      case 'pdf':
        return <PDFPreview workspaceId={workspaceId} knowledge={knowledge} />
      case 'audio':
        return <AudioPreview workspaceId={workspaceId} knowledge={knowledge} />
      case 'bookmark':
        return <BookmarkPreview workspaceId={workspaceId} knowledge={knowledge} />
      default:
        return <GenericPreview workspaceId={workspaceId} knowledge={knowledge} />
    }
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
          {knowledge.title || 'Untitled'}
        </h1>
        {updatedAt && (
          <p className="mt-1 text-xs text-fg-muted">Last updated {updatedAt}</p>
        )}
      </div>

      {/* Preview area */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {renderPreview()}
      </motion.div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {['image', 'pdf', 'audio', 'document', 'sheet', 'slide'].includes(knowledgeType) && (
          <ActionButton
            icon={Download}
            label="Download"
            onClick={handleDownload}
          />
        )}
        <ActionButton
          icon={RefreshCw}
          label="Reprocess"
          onClick={() => reprocessMutation.mutate()}
          loading={reprocessMutation.isPending}
        />
        <ActionButton
          icon={Sparkles}
          label="Generate Intelligence"
          onClick={() => intelligenceMutation.mutate()}
          loading={intelligenceMutation.isPending}
          variant="secondary"
        />
      </div>

      {/* Metadata */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated p-5">
        <h3 className="mb-4 font-display text-sm font-semibold text-fg">Metadata</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Tags */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-label text-xs font-medium text-fg-muted">
              <Tag className="h-3.5 w-3.5" />
              Tags
            </label>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-bg-sunken px-2 py-0.5 font-label text-xs text-fg-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-fg-subtle">No tags</span>
            )}
          </div>

          {/* Dates */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-label text-xs font-medium text-fg-muted">
              <Calendar className="h-3.5 w-3.5" />
              Dates
            </label>
            <div className="space-y-1 text-xs text-fg-muted">
              {createdAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-fg-subtle">Created</span>
                  <span>{createdAt}</span>
                </div>
              )}
              {updatedAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-fg-subtle">Updated</span>
                  <span>{updatedAt}</span>
                </div>
              )}
            </div>
          </div>

          {/* Word count */}
          {knowledge.word_count != null && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 font-label text-xs font-medium text-fg-muted">
                <FileText className="h-3.5 w-3.5" />
                Word Count
              </label>
              <span className="text-xs text-fg-muted">{knowledge.word_count.toLocaleString()} words</span>
            </div>
          )}

          {/* Source URL */}
          {knowledge.source_url && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 font-label text-xs font-medium text-fg-muted">
                <Globe className="h-3.5 w-3.5" />
                Source
              </label>
              <a
                href={knowledge.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {knowledge.source_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {/* AI Summary */}
        {knowledge.ai_summary && (
          <div className="mt-4 border-t border-border/30 pt-4">
            <label className="mb-1.5 flex items-center gap-1.5 font-label text-xs font-medium text-fg-muted">
              <Sparkles className="h-3.5 w-3.5" />
              AI Summary
            </label>
            <p className="text-xs leading-relaxed text-fg-muted">{knowledge.ai_summary}</p>
          </div>
        )}
      </div>
    </div>
  )
}
