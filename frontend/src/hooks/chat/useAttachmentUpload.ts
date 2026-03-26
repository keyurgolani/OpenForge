import { useState, useCallback, useRef } from 'react'

export interface ManagedAttachment {
  id: string
  localId: string
  filename: string
  content_type: string
  size: number
  status: 'uploading' | 'extracted' | 'error'
  extracted_text: string | null
  pipeline: string | null
  error?: string
  /** Original File object retained for retry */
  file: File
}

interface AttachmentUploadResult {
  id: string
  filename: string
  content_type: string
  file_size: number
  extracted_text: string | null
  pipeline: string | null
}

let localIdCounter = 0

function nextLocalId(): string {
  localIdCounter += 1
  return `local-${localIdCounter}-${Date.now()}`
}

async function uploadFile(file: File): Promise<AttachmentUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/v1/attachments/upload', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(detail || `Upload failed (${res.status})`)
  }
  return res.json()
}

export function useAttachmentUpload() {
  const [attachments, setAttachments] = useState<ManagedAttachment[]>([])
  const attachmentsRef = useRef<ManagedAttachment[]>([])

  // Keep ref in sync for use inside async callbacks
  const updateAttachments = useCallback((updater: (prev: ManagedAttachment[]) => ManagedAttachment[]) => {
    setAttachments((prev) => {
      const next = updater(prev)
      attachmentsRef.current = next
      return next
    })
  }, [])

  const performUpload = useCallback(async (localId: string, file: File) => {
    try {
      const result = await uploadFile(file)
      updateAttachments((prev) =>
        prev.map((a) =>
          a.localId === localId
            ? {
                ...a,
                id: result.id,
                extracted_text: result.extracted_text,
                pipeline: result.pipeline,
                status: 'extracted' as const,
                error: undefined,
              }
            : a,
        ),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      updateAttachments((prev) =>
        prev.map((a) =>
          a.localId === localId
            ? { ...a, status: 'error' as const, error: message }
            : a,
        ),
      )
    }
  }, [updateAttachments])

  const addFiles = useCallback((files: File[]) => {
    const newAttachments: ManagedAttachment[] = files.map((file) => ({
      id: '',
      localId: nextLocalId(),
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      size: file.size,
      status: 'uploading' as const,
      extracted_text: null,
      pipeline: null,
      file,
    }))

    updateAttachments((prev) => [...prev, ...newAttachments])

    // Fire uploads concurrently — don't block the caller
    for (const attachment of newAttachments) {
      performUpload(attachment.localId, attachment.file)
    }
  }, [updateAttachments, performUpload])

  const removeAttachment = useCallback((localId: string) => {
    updateAttachments((prev) => prev.filter((a) => a.localId !== localId))
  }, [updateAttachments])

  const retryAttachment = useCallback((localId: string) => {
    const target = attachmentsRef.current.find((a) => a.localId === localId)
    if (!target || target.status !== 'error') return

    updateAttachments((prev) =>
      prev.map((a) =>
        a.localId === localId
          ? { ...a, status: 'uploading' as const, error: undefined }
          : a,
      ),
    )

    performUpload(localId, target.file)
  }, [updateAttachments, performUpload])

  const clearAll = useCallback(() => {
    updateAttachments(() => [])
  }, [updateAttachments])

  const readyAttachmentIds = attachments
    .filter((a) => a.status === 'extracted' && a.id)
    .map((a) => a.id)

  const hasPending = attachments.some((a) => a.status === 'uploading')

  return {
    attachments,
    addFiles,
    removeAttachment,
    retryAttachment,
    clearAll,
    readyAttachmentIds,
    hasPending,
  }
}
