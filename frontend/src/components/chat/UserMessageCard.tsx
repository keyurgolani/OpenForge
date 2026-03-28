import { useState } from 'react'
import { User, FileText } from 'lucide-react'
import { PreviewCard } from './PreviewCard'
import { ContentModal } from './ContentModal'
import { CopyButton } from '@/components/shared/CopyButton'
import { pipelineToKnowledgeType } from '@/lib/knowledgeTypeMapping'

interface Attachment {
  filename: string
  content_type: string
  id?: string
  extracted_text?: string | null
  pipeline?: string
  file_size?: number
}

interface UserMessageCardProps {
  content: string
  userInitial: string
  attachments?: Attachment[]
  timestamp?: string
}

export function UserMessageCard({ content, userInitial, attachments, timestamp }: UserMessageCardProps) {
  const [modalAttachment, setModalAttachment] = useState<Attachment | null>(null)

  const attachmentsWithContent = (attachments ?? []).filter(
    (att) => att.extracted_text != null && att.extracted_text.length > 0,
  )

  const handleSaveToWorkspace = async (att: Attachment, workspaceId: string) => {
    if (!att.id) return
    await fetch(`/api/v1/attachments/${att.id}/save-to-knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        knowledge_type: pipelineToKnowledgeType(att.pipeline ?? ''),
      }),
    })
  }

  return (
    <div className="group flex gap-2 items-start justify-end">
      <div className="max-w-[90%]">
        <div className="chat-bubble-user px-4 py-3 text-foreground text-sm leading-relaxed">
          {content}
          {attachments && attachments.length > 0 && (() => {
            const chipsOnly = attachments.filter(
              (att) => !att.extracted_text || att.extracted_text.length === 0,
            )
            if (chipsOnly.length === 0) return null
            return (
              <div className="flex flex-wrap gap-2 mt-2">
                {chipsOnly.map((att) => (
                  <div key={att.filename} className="inline-flex items-center gap-1.5 px-2 py-1 bg-card/50 border border-border/25 rounded-sm text-xs text-muted-foreground">
                    <FileText className="w-3 h-3" />
                    <span className="truncate max-w-[120px]">{att.filename}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
        {attachmentsWithContent.length > 0 && (
          <div className="flex flex-col gap-2 mt-2 overflow-hidden" style={{ contain: 'inline-size' }}>
            {attachmentsWithContent.map((att) => (
              <PreviewCard
                key={att.id ?? att.filename}
                attachmentId={att.id ?? ''}
                filename={att.filename}
                pipeline={att.pipeline ?? ''}
                extractedText={att.extracted_text ?? null}
                contentType={att.content_type}
                fileSize={att.file_size ?? 0}
                onOpenModal={() => setModalAttachment(att)}
                onSaveToWorkspace={(workspaceId) => handleSaveToWorkspace(att, workspaceId)}
              />
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton
            content={content}
            iconOnly
            className="text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          />
          {timestamp && (
            <span className="text-[11px] text-muted-foreground/70">{timestamp}</span>
          )}
        </div>
      </div>
      <div className="chat-avatar w-7 h-7 rounded-full bg-accent/24 border border-accent/35 flex-shrink-0 flex items-center justify-center">
        <User className="w-3.5 h-3.5 text-accent" />
      </div>
      {modalAttachment && modalAttachment.extracted_text && (
        <ContentModal
          open={true}
          onClose={() => setModalAttachment(null)}
          attachmentId={modalAttachment.id ?? ''}
          filename={modalAttachment.filename}
          pipeline={modalAttachment.pipeline ?? ''}
          fileSize={modalAttachment.file_size ?? 0}
          extractedText={modalAttachment.extracted_text}
          contentType={modalAttachment.content_type}
        />
      )}
    </div>
  )
}
