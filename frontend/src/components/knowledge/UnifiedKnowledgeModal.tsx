import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X, Maximize2, Link2, Upload, Loader2, Save, Tag, Mic, MicOff, Square,
    FileText, Zap, Bookmark, Code2,
    Image as ImageIcon, FileType2, Table, Presentation,
    Pin, PinOff, Archive, ArchiveX, Trash2, Edit2, Download, Copy, ExternalLink,
} from 'lucide-react'
import BlockNoteEditor from './BlockNoteEditor'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

function RenderedContent({ content, className }: { content: string; className?: string }) {
    const html = useMemo(() => md.render(content || ''), [content])
    return (
        <div
            className={`prose prose-sm prose-invert max-w-none text-foreground/85 leading-relaxed ${className ?? ''}`}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}
import {
    createKnowledge,
    uploadKnowledge,
    getKnowledge,
    updateKnowledge,
    deleteKnowledge,
    togglePin,
    toggleArchive,
    getKnowledgeFileUrl,
} from '@/lib/api'
import { type QuickKnowledgeType, ACCEPTED_MIMES, KNOWLEDGE_TYPE_LABELS, FILE_BASED_TYPES } from '@/lib/quick-knowledge'

// ── Type meta (for view mode badge) ─────────────────────────────────────────
const TYPE_META: Record<string, {
    Icon: React.ComponentType<{ className?: string }>
    label: string
    color: string
}> = {
    standard:  { Icon: FileText,      label: 'Note',        color: 'text-blue-400' },
    fleeting:  { Icon: Zap,           label: 'Fleeting',    color: 'text-yellow-400' },
    bookmark:  { Icon: Bookmark,      label: 'Bookmark',    color: 'text-purple-400' },
    gist:      { Icon: Code2,         label: 'Gist',        color: 'text-green-400' },
    image:     { Icon: ImageIcon,     label: 'Image',       color: 'text-pink-400' },
    audio:     { Icon: Mic,           label: 'Audio',       color: 'text-orange-400' },
    pdf:       { Icon: FileType2,     label: 'PDF',         color: 'text-red-400' },
    docx:      { Icon: FileText,      label: 'Word',        color: 'text-blue-300' },
    xlsx:      { Icon: Table,         label: 'Spreadsheet', color: 'text-emerald-400' },
    pptx:      { Icon: Presentation,  label: 'Slides',      color: 'text-amber-400' },
}

// ── Type chips (for create mode selector) ────────────────────────────────────
const TYPE_CHIPS: { type: QuickKnowledgeType; label: string; Icon: React.ComponentType<{ className?: string }>; color: string }[] = [
    { type: 'standard',  label: 'Note',        Icon: FileText,     color: 'text-blue-400' },
    { type: 'fleeting',  label: 'Fleeting',    Icon: Zap,          color: 'text-yellow-400' },
    { type: 'bookmark',  label: 'Bookmark',    Icon: Bookmark,     color: 'text-purple-400' },
    { type: 'gist',      label: 'Gist',        Icon: Code2,        color: 'text-green-400' },
    { type: 'image',     label: 'Image',       Icon: ImageIcon,    color: 'text-pink-400' },
    { type: 'audio',     label: 'Audio',       Icon: Mic,          color: 'text-orange-400' },
    { type: 'pdf',       label: 'PDF',         Icon: FileType2,    color: 'text-red-400' },
    { type: 'docx',      label: 'Word',        Icon: FileText,     color: 'text-blue-300' },
    { type: 'xlsx',      label: 'Spreadsheet', Icon: Table,        color: 'text-emerald-400' },
    { type: 'pptx',      label: 'Slides',      Icon: Presentation, color: 'text-amber-400' },
]

const GIST_LANGUAGES = ['javascript', 'typescript', 'python', 'go', 'rust', 'html', 'css', 'sql', 'bash', 'json', 'yaml', 'markdown']

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface UnifiedKnowledgeModalProps {
    mode: 'create' | 'view'
    type?: QuickKnowledgeType
    knowledgeId?: string
    workspaceId: string
    isOpen: boolean
    onClose(): void
    onCreated?(knowledge: any): void
}

export function UnifiedKnowledgeModal({
    mode,
    type: defaultType = 'standard',
    knowledgeId,
    workspaceId,
    isOpen,
    onClose,
    onCreated,
}: UnifiedKnowledgeModalProps) {
    const navigate = useNavigate()
    const qc = useQueryClient()

    // ── Create mode state ──────────────────────────────────────────────────────
    const [activeType, setActiveType] = useState<QuickKnowledgeType>(defaultType)
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [url, setUrl] = useState('')
    const [urlTitle, setUrlTitle] = useState('')
    const [notes, setNotes] = useState('')
    const [gistLang, setGistLang] = useState('typescript')
    const [gistCode, setGistCode] = useState('')
    const [tagInput, setTagInput] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // ── View mode state ────────────────────────────────────────────────────────
    const [isEditing, setIsEditing] = useState(false)
    const [editTitle, setEditTitle] = useState('')
    const [editContent, setEditContent] = useState('')
    const [editTags, setEditTags] = useState<string[]>([])
    const [editTagInput, setEditTagInput] = useState('')
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)

    // ── File state ─────────────────────────────────────────────────────────────
    const [file, setFile] = useState<File | null>(null)
    const [filePreview, setFilePreview] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Audio recording ────────────────────────────────────────────────────────
    const [recording, setRecording] = useState(false)
    const [recordingSeconds, setRecordingSeconds] = useState(0)
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const recordingTimerRef = useRef<number | null>(null)
    const chunksRef = useRef<Blob[]>([])

    // ── View mode data ─────────────────────────────────────────────────────────
    const { data: knowledge, isLoading } = useQuery({
        queryKey: ['knowledge-item', knowledgeId],
        queryFn: () => getKnowledge(workspaceId, knowledgeId!),
        enabled: mode === 'view' && !!knowledgeId,
        staleTime: 10_000,
    })

    // Sync edit state from fetched knowledge
    useEffect(() => {
        if (knowledge) {
            setEditTitle(knowledge.title ?? '')
            setEditContent(knowledge.content ?? '')
            setEditTags(knowledge.tags ?? [])
        }
    }, [knowledge])

    // ── Sync active type when modal opens in create mode ──────────────────────
    useEffect(() => {
        if (isOpen && mode === 'create') {
            setActiveType(defaultType)
        }
    }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Reset state on close ───────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) {
            setActiveType(defaultType)
            setTitle('')
            setContent('')
            setUrl('')
            setUrlTitle('')
            setNotes('')
            setGistLang('typescript')
            setGistCode('')
            setTagInput('')
            setTags([])
            setError(null)
            setFile(null)
            if (filePreview) URL.revokeObjectURL(filePreview)
            setFilePreview(null)
            setRecording(false)
            setRecordingSeconds(0)
            setRecordedBlob(null)
            setIsEditing(false)
            setConfirmDelete(false)
        }
    }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Cleanup recording timer on unmount ────────────────────────────────────
    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
        }
    }, [])

    // ── Keyboard: Escape closes modal ─────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [isOpen, onClose])

    // ── File handling ─────────────────────────────────────────────────────────
    const handleFileSelect = useCallback((f: File) => {
        setFile(f)
        setError(null)
        if (activeType === 'image' && f.type.startsWith('image/')) {
            if (filePreview) URL.revokeObjectURL(filePreview)
            setFilePreview(URL.createObjectURL(f))
        } else {
            setFilePreview(null)
        }
    }, [activeType, filePreview])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFileSelect(f)
    }, [handleFileSelect])

    // ── Audio recording ───────────────────────────────────────────────────────
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mr = new MediaRecorder(stream)
            chunksRef.current = []
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
            mr.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
                setRecordedBlob(blob)
                stream.getTracks().forEach(t => t.stop())
            }
            mr.start()
            mediaRecorderRef.current = mr
            setRecording(true)
            setRecordingSeconds(0)
            recordingTimerRef.current = window.setInterval(() => {
                setRecordingSeconds(s => s + 1)
            }, 1000)
        } catch {
            setError('Microphone access denied.')
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        setRecording(false)
        if (recordingTimerRef.current) {
            window.clearInterval(recordingTimerRef.current)
            recordingTimerRef.current = null
        }
    }

    // ── Tags ──────────────────────────────────────────────────────────────────
    const addTag = () => {
        const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
        if (t && !tags.includes(t)) setTags(p => [...p, t])
        setTagInput('')
    }

    const addEditTag = () => {
        const t = editTagInput.trim().toLowerCase().replace(/\s+/g, '-')
        if (t && !editTags.includes(t)) setEditTags(p => [...p, t])
        setEditTagInput('')
    }

    // ── Build create payload ──────────────────────────────────────────────────
    const buildCreatePayload = () => {
        const payload: any = { type: activeType, tags }
        if (activeType === 'standard') {
            payload.title = title.trim() || null
            payload.content = content
        } else if (activeType === 'fleeting') {
            payload.title = null
            payload.content = content
        } else if (activeType === 'bookmark') {
            payload.url = url.trim() || null
            payload.title = urlTitle.trim() || null
            payload.content = notes
        } else if (activeType === 'gist') {
            payload.title = title.trim() || null
            payload.content = gistCode
            payload.gist_language = gistLang
        }
        return payload
    }

    // ── Save (create mode) ────────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            let result: any
            if (FILE_BASED_TYPES.has(activeType)) {
                let fileToUpload: File | null = file
                if (activeType === 'audio' && recordedBlob) {
                    fileToUpload = new File([recordedBlob], 'recording.webm', { type: 'audio/webm' })
                }
                if (!fileToUpload) { setError('Please select a file.'); setSaving(false); return }
                result = await uploadKnowledge(workspaceId, fileToUpload)
            } else {
                result = await createKnowledge(workspaceId, buildCreatePayload())
            }
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            onCreated?.(result)
            onClose()
            if (FILE_BASED_TYPES.has(activeType)) {
                navigate(`/w/${workspaceId}/knowledge/${result.id}`)
            }
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to save. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    // ── Expand (create mode: save draft then navigate) ────────────────────────
    const handleExpand = async () => {
        if (mode === 'view') {
            onClose()
            navigate(`/w/${workspaceId}/knowledge/${knowledgeId}`)
            return
        }
        // Create mode: save draft then navigate to full editor
        setSaving(true)
        try {
            const isFileBased = FILE_BASED_TYPES.has(activeType)
            let result: any
            if (isFileBased) {
                let fileToUpload: File | null = file
                if (activeType === 'audio' && recordedBlob) {
                    fileToUpload = new File([recordedBlob], 'recording.webm', { type: 'audio/webm' })
                }
                if (fileToUpload) {
                    result = await uploadKnowledge(workspaceId, fileToUpload)
                } else {
                    // Nothing to save yet — navigate to fresh standard note
                    result = await createKnowledge(workspaceId, { type: 'standard', title: null, content: '' })
                }
            } else {
                result = await createKnowledge(workspaceId, buildCreatePayload())
            }
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            onClose()
            navigate(`/w/${workspaceId}/knowledge/${result.id}`)
        } finally {
            setSaving(false)
        }
    }

    // ── View mode actions ─────────────────────────────────────────────────────
    const handlePin = async () => {
        if (!knowledgeId) return
        await togglePin(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
    }

    const handleArchive = async () => {
        if (!knowledgeId) return
        await toggleArchive(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
        onClose()
    }

    const handleDelete = async () => {
        if (!knowledgeId) return
        if (!confirmDelete) { setConfirmDelete(true); return }
        setDeleting(true)
        try {
            await deleteKnowledge(workspaceId, knowledgeId)
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            onClose()
        } finally {
            setDeleting(false)
        }
    }

    const handleViewSave = async () => {
        if (!knowledgeId) return
        setSaving(true)
        try {
            await updateKnowledge(workspaceId, knowledgeId, {
                title: editTitle.trim() || null,
                content: editContent,
                tags: editTags,
            })
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
            setIsEditing(false)
        } finally {
            setSaving(false)
        }
    }

    // ── Derived values ─────────────────────────────────────────────────────────
    const isFileBased = FILE_BASED_TYPES.has(activeType)
    const acceptMimes = ACCEPTED_MIMES[activeType] ?? '*'
    const meta = knowledge ? (TYPE_META[knowledge.type] ?? TYPE_META.standard) : null
    const displayTitle = knowledge?.title?.trim() || knowledge?.ai_title?.trim() || 'Untitled'
    const isFileType = knowledge && FILE_BASED_TYPES.has(knowledge.type as QuickKnowledgeType)
    const fileUrl = knowledgeId ? getKnowledgeFileUrl(workspaceId, knowledgeId) : ''
    const fileMetadata = knowledge?.file_metadata ?? {}

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-md"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4 pt-20 pb-6">
                        <motion.div
                            key="modal"
                            initial={{ scale: 0.94, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.94, opacity: 0, y: 16 }}
                            transition={{ type: 'spring', damping: 24, stiffness: 320, mass: 0.8 }}
                            className="pointer-events-auto w-full max-w-2xl glass-card border border-white/10 rounded-2xl shadow-glass-lg overflow-hidden flex flex-col max-h-[calc(100vh-6.5rem)]"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Inner glow line */}
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

                            {/* Header */}
                            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-border/50">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {/* View mode: type badge + title */}
                                    {mode === 'view' && meta && (
                                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-border/60 bg-muted/40 ${meta.color} flex-shrink-0`}>
                                            <meta.Icon className="w-3 h-3" />
                                            {meta.label}
                                        </span>
                                    )}
                                    {mode === 'view' && knowledge && knowledge.type !== 'fleeting' && (
                                        isEditing ? (
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={e => setEditTitle(e.target.value)}
                                                placeholder="Untitled"
                                                className="flex-1 bg-transparent text-base font-semibold placeholder-muted-foreground/40 outline-none min-w-0"
                                                autoFocus
                                            />
                                        ) : (
                                            <h2 className="text-base font-semibold truncate text-foreground min-w-0">
                                                {displayTitle}
                                            </h2>
                                        )
                                    )}
                                    {mode === 'create' && (
                                        <h2 className="text-sm font-semibold text-foreground">New Knowledge</h2>
                                    )}
                                </div>

                                {/* Header action buttons */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {/* View mode actions */}
                                    {mode === 'view' && knowledge && (
                                        <>
                                            <button
                                                type="button"
                                                className="btn-ghost p-1.5 text-muted-foreground hover:text-foreground"
                                                onClick={handlePin}
                                                title={knowledge.is_pinned ? 'Unpin' : 'Pin'}
                                            >
                                                {knowledge.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-ghost p-1.5 text-muted-foreground hover:text-foreground"
                                                onClick={handleArchive}
                                                title={knowledge.is_archived ? 'Unarchive' : 'Archive'}
                                            >
                                                {knowledge.is_archived ? <ArchiveX className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                                            </button>
                                            {!isFileType && (
                                                <button
                                                    type="button"
                                                    className="btn-ghost p-1.5"
                                                    onClick={() => { if (isEditing) handleViewSave(); else setIsEditing(true) }}
                                                    title={isEditing ? 'Save' : 'Edit'}
                                                >
                                                    {saving ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : isEditing ? (
                                                        <Save className="w-4 h-4" />
                                                    ) : (
                                                        <Edit2 className="w-4 h-4" />
                                                    )}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className={`btn-ghost p-1.5 gap-1 text-xs ${confirmDelete ? 'text-red-400 hover:bg-red-500/10' : 'text-muted-foreground hover:text-red-400'}`}
                                                onClick={handleDelete}
                                                disabled={deleting}
                                                title="Delete"
                                            >
                                                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                {confirmDelete && <span>Confirm?</span>}
                                            </button>
                                        </>
                                    )}
                                    {/* Expand button */}
                                    <button
                                        type="button"
                                        className="btn-ghost p-1.5 text-muted-foreground hover:text-foreground"
                                        onClick={handleExpand}
                                        disabled={saving}
                                        title="Expand"
                                    >
                                        <Maximize2 className="w-4 h-4" />
                                    </button>
                                    {/* Close button */}
                                    <button
                                        type="button"
                                        className="btn-ghost p-1.5"
                                        onClick={onClose}
                                        aria-label="Close"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Type chips row (create mode only) */}
                            {mode === 'create' && (
                                <div className="flex-shrink-0 px-5 py-3 border-b border-border/30 overflow-x-auto">
                                    <div className="flex gap-1.5 min-w-max">
                                        {TYPE_CHIPS.map(({ type, label, Icon, color }) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => { setActiveType(type); setError(null) }}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                                    activeType === type
                                                        ? `border-accent/60 bg-accent/10 ${color}`
                                                        : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-muted/20'
                                                }`}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

                                {/* ── CREATE MODE ── */}
                                {mode === 'create' && (
                                    <>
                                        {/* Standard note */}
                                        {activeType === 'standard' && (
                                            <>
                                                <input
                                                    type="text"
                                                    value={title}
                                                    onChange={e => setTitle(e.target.value)}
                                                    placeholder="Give your note a title..."
                                                    className="w-full bg-transparent text-lg font-semibold placeholder-muted-foreground/40 outline-none border-none"
                                                    autoFocus
                                                />
                                                <div className="border border-border/30 rounded-xl p-3 min-h-[160px]">
                                                    <BlockNoteEditor
                                                        onChange={md => setContent(md)}
                                                        placeholder="Start writing..."
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {/* Fleeting note */}
                                        {activeType === 'fleeting' && (
                                            <div className="border border-border/30 rounded-xl p-3 min-h-[220px]">
                                                <BlockNoteEditor
                                                    onChange={md => setContent(md)}
                                                    placeholder="What's on your mind?"
                                                />
                                            </div>
                                        )}

                                        {/* Bookmark */}
                                        {activeType === 'bookmark' && (
                                            <>
                                                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-muted/20">
                                                    <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                    <input
                                                        type="url"
                                                        value={url}
                                                        onChange={e => setUrl(e.target.value)}
                                                        placeholder="https://..."
                                                        className="flex-1 bg-transparent text-sm placeholder-muted-foreground/50 outline-none"
                                                        autoFocus
                                                    />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={urlTitle}
                                                    onChange={e => setUrlTitle(e.target.value)}
                                                    placeholder="Title (optional)"
                                                    className="w-full input text-sm"
                                                />
                                                <div className="border border-border/30 rounded-xl p-3 min-h-[100px]">
                                                    <BlockNoteEditor
                                                        onChange={md => setNotes(md)}
                                                        placeholder="Notes (optional)"
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {/* Gist */}
                                        {activeType === 'gist' && (
                                            <>
                                                <div className="flex items-center gap-3">
                                                    <select
                                                        value={gistLang}
                                                        onChange={e => setGistLang(e.target.value)}
                                                        className="input text-sm w-48"
                                                    >
                                                        {GIST_LANGUAGES.map(l => (
                                                            <option key={l} value={l}>{l}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="text"
                                                        value={title}
                                                        onChange={e => setTitle(e.target.value)}
                                                        placeholder="Gist title (optional)"
                                                        className="flex-1 input text-sm"
                                                    />
                                                </div>
                                                <textarea
                                                    value={gistCode}
                                                    onChange={e => setGistCode(e.target.value)}
                                                    placeholder="Paste code here..."
                                                    className="w-full bg-muted/20 border border-border/40 rounded-xl p-3 text-sm font-mono resize-none outline-none focus:border-accent/50 transition-colors"
                                                    rows={12}
                                                    spellCheck={false}
                                                    autoFocus
                                                />
                                            </>
                                        )}

                                        {/* File-based types */}
                                        {isFileBased && (
                                            <>
                                                {/* Audio: record or upload */}
                                                {activeType === 'audio' && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/20">
                                                            {recording ? (
                                                                <>
                                                                    <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                                                                    <span className="text-sm font-mono text-red-400">{formatDuration(recordingSeconds)}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={stopRecording}
                                                                        className="btn-ghost gap-1.5 text-xs ml-auto"
                                                                    >
                                                                        <Square className="w-3.5 h-3.5" />
                                                                        Stop Recording
                                                                    </button>
                                                                </>
                                                            ) : recordedBlob ? (
                                                                <>
                                                                    <MicOff className="w-4 h-4 text-muted-foreground" />
                                                                    <span className="text-sm text-muted-foreground">Recorded: {formatDuration(recordingSeconds)}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { setRecordedBlob(null); setRecordingSeconds(0) }}
                                                                        className="btn-ghost text-xs ml-auto gap-1"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                        Discard
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Mic className="w-4 h-4 text-muted-foreground" />
                                                                    <span className="text-sm text-muted-foreground">Record audio</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={startRecording}
                                                                        className="btn-primary text-xs ml-auto gap-1.5"
                                                                    >
                                                                        <Mic className="w-3.5 h-3.5" />
                                                                        Start Recording
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground text-center">- or -</p>
                                                    </div>
                                                )}

                                                {/* Drop zone */}
                                                <div
                                                    className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all cursor-pointer
                                                        ${dragOver ? 'border-accent bg-accent/5 scale-[1.01]' : file ? 'border-accent/40 bg-accent/5' : 'border-border/60 hover:border-accent/50 hover:bg-muted/10'}`}
                                                    style={{ minHeight: file ? undefined : '9rem' }}
                                                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                                                    onDragLeave={() => setDragOver(false)}
                                                    onDrop={handleDrop}
                                                    onClick={() => !file && fileInputRef.current?.click()}
                                                >
                                                    <input
                                                        ref={fileInputRef}
                                                        type="file"
                                                        accept={acceptMimes}
                                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                                                        className="hidden"
                                                    />
                                                    {file ? (
                                                        <div className="flex items-center gap-3 w-full p-3">
                                                            {filePreview ? (
                                                                <img src={filePreview} alt="Preview" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-border/50" />
                                                            ) : (
                                                                <div className="w-16 h-16 rounded-lg bg-muted/40 border border-border/60 flex items-center justify-center flex-shrink-0">
                                                                    <Upload className="w-7 h-7 text-muted-foreground" />
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{file.name}</p>
                                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                                    {file.size < 1024 * 1024
                                                                        ? `${(file.size / 1024).toFixed(1)} KB`
                                                                        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className="btn-ghost p-1.5 flex-shrink-0"
                                                                onClick={e => { e.stopPropagation(); setFile(null); setFilePreview(null) }}
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-2 text-center p-6">
                                                            <div className="w-11 h-11 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-center">
                                                                <Upload className="w-5 h-5 text-muted-foreground" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm text-foreground">
                                                                    Drag & drop or <span className="text-accent font-medium">click to browse</span>
                                                                </p>
                                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                                    {KNOWLEDGE_TYPE_LABELS[activeType]}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        {error && (
                                            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                                {error}
                                            </p>
                                        )}
                                    </>
                                )}

                                {/* ── VIEW MODE ── */}
                                {mode === 'view' && (
                                    <>
                                        {isLoading ? (
                                            <div className="space-y-3">
                                                {[...Array(4)].map((_, i) => (
                                                    <div key={i} className="h-4 bg-muted/40 rounded skeleton" style={{ width: `${80 - i * 12}%` }} />
                                                ))}
                                            </div>
                                        ) : knowledge ? (
                                            <div className="space-y-4">
                                                {/* Standard */}
                                                {knowledge.type === 'standard' && (
                                                    isEditing ? (
                                                        <div className="border border-border/30 rounded-xl p-3 min-h-[200px]">
                                                            <BlockNoteEditor
                                                                initialContent={editContent}
                                                                onChange={mkd => setEditContent(mkd)}
                                                                placeholder="Start writing..."
                                                            />
                                                        </div>
                                                    ) : (
                                                        <RenderedContent content={knowledge.content ?? ''} />
                                                    )
                                                )}

                                                {/* Fleeting */}
                                                {knowledge.type === 'fleeting' && (
                                                    isEditing ? (
                                                        <div className="border border-border/30 rounded-xl p-3 min-h-[200px]">
                                                            <BlockNoteEditor
                                                                initialContent={editContent}
                                                                onChange={mkd => setEditContent(mkd)}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <RenderedContent content={knowledge.content ?? ''} />
                                                    )
                                                )}

                                                {/* Bookmark */}
                                                {knowledge.type === 'bookmark' && (
                                                    <div className="space-y-3">
                                                        {knowledge.url && (
                                                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/50 bg-muted/20">
                                                                <Bookmark className="w-4 h-4 text-purple-400 flex-shrink-0" />
                                                                <a
                                                                    href={knowledge.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex-1 text-sm text-accent truncate hover:underline"
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                    {knowledge.url}
                                                                </a>
                                                                <button
                                                                    type="button"
                                                                    className="btn-ghost p-1"
                                                                    onClick={() => navigator.clipboard.writeText(knowledge.url)}
                                                                    title="Copy URL"
                                                                >
                                                                    <Copy className="w-3.5 h-3.5" />
                                                                </button>
                                                                <a
                                                                    href={knowledge.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="btn-ghost p-1"
                                                                    onClick={e => e.stopPropagation()}
                                                                    title="Open URL"
                                                                >
                                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                                </a>
                                                            </div>
                                                        )}
                                                        {knowledge.content && (
                                                            <RenderedContent content={knowledge.content} />
                                                        )}
                                                    </div>
                                                )}

                                                {/* Gist */}
                                                {knowledge.type === 'gist' && (
                                                    isEditing ? (
                                                        <textarea
                                                            value={editContent}
                                                            onChange={e => setEditContent(e.target.value)}
                                                            className="w-full bg-muted/20 border border-border/40 rounded-xl p-3 text-sm font-mono resize-none outline-none focus:border-accent/50 transition-colors"
                                                            rows={14}
                                                            spellCheck={false}
                                                        />
                                                    ) : (
                                                        <div className="relative">
                                                            {knowledge.gist_language && (
                                                                <div className="absolute top-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-300 border border-green-500/30">
                                                                    {knowledge.gist_language}
                                                                </div>
                                                            )}
                                                            <pre className="text-xs font-mono bg-muted/20 border border-border/40 rounded-xl p-4 overflow-x-auto whitespace-pre leading-relaxed">
                                                                {knowledge.content}
                                                            </pre>
                                                        </div>
                                                    )
                                                )}

                                                {/* Image */}
                                                {knowledge.type === 'image' && (
                                                    <div className="space-y-4">
                                                        <img
                                                            src={fileUrl}
                                                            alt={displayTitle}
                                                            className="w-full max-h-72 object-contain rounded-xl border border-border/40 bg-muted/20"
                                                        />
                                                        {/* OCR / vision content */}
                                                        {knowledge.content?.trim() && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                                                <RenderedContent content={knowledge.content} />
                                                            </div>
                                                        )}
                                                        {/* EXIF metadata */}
                                                        {fileMetadata.exif && Object.keys(fileMetadata.exif).length > 0 && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                                                <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                                    {fileMetadata.exif.width && fileMetadata.exif.height && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Dimensions</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.exif.width)}×{String(fileMetadata.exif.height)}</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.exif.format && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Format</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.exif.format)}</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.exif.Make && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Camera</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.exif.Make)}{fileMetadata.exif.Model ? ` ${fileMetadata.exif.Model}` : ''}</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.exif.DateTime && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Date Taken</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.exif.DateTime)}</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.exif.ExposureTime && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Exposure</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.exif.ExposureTime)}s</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.exif.FNumber && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Aperture</span>
                                                                            <span className="font-mono text-foreground/80">f/{String(fileMetadata.exif.FNumber)}</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.exif.ISOSpeedRatings && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">ISO</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.exif.ISOSpeedRatings)}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Audio */}
                                                {knowledge.type === 'audio' && (
                                                    <div className="space-y-4">
                                                        <audio controls src={fileUrl} className="w-full rounded-xl" />
                                                        {knowledge.content && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Transcript</p>
                                                                <RenderedContent content={knowledge.content} />
                                                            </div>
                                                        )}
                                                        {(fileMetadata.duration != null || fileMetadata.format || fileMetadata.sample_rate != null || fileMetadata.channels != null || fileMetadata.bitrate != null) && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                                                <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                                    {fileMetadata.duration != null && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Duration</span>
                                                                            <span className="font-mono text-foreground/80">{Math.floor((fileMetadata.duration as number) / 60)}:{String(Math.floor((fileMetadata.duration as number) % 60)).padStart(2, '0')}</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.format && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Format</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.format)}</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.sample_rate != null && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Sample Rate</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.sample_rate)} Hz</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.channels != null && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Channels</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.channels)}</span>
                                                                        </div>
                                                                    )}
                                                                    {fileMetadata.bitrate != null && (
                                                                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <span className="text-muted-foreground/70">Bitrate</span>
                                                                            <span className="font-mono text-foreground/80">{String(fileMetadata.bitrate)} kbps</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* PDF */}
                                                {knowledge.type === 'pdf' && (
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/15">
                                                            <FileType2 className="w-8 h-8 text-red-400 flex-shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{knowledge.original_filename ?? displayTitle}</p>
                                                                {fileMetadata.page_count != null && (
                                                                    <p className="text-xs text-muted-foreground">{String(fileMetadata.page_count)} pages</p>
                                                                )}
                                                            </div>
                                                            <a href={fileUrl} download className="btn-ghost p-2 flex-shrink-0" onClick={e => e.stopPropagation()} title="Download">
                                                                <Download className="w-4 h-4" />
                                                            </a>
                                                        </div>
                                                        {knowledge.content?.trim() && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                                                <RenderedContent content={knowledge.content.slice(0, 3000)} />
                                                            </div>
                                                        )}
                                                        {(fileMetadata.pdf_title || fileMetadata.author || fileMetadata.creation_date || fileMetadata.producer) && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                                                <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                                    {fileMetadata.pdf_title && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Title</span><span className="text-foreground/80 text-right max-w-[60%] truncate">{String(fileMetadata.pdf_title)}</span></div>}
                                                                    {fileMetadata.author && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Author</span><span className="text-foreground/80">{String(fileMetadata.author)}</span></div>}
                                                                    {fileMetadata.creation_date && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Created</span><span className="font-mono text-foreground/80">{String(fileMetadata.creation_date)}</span></div>}
                                                                    {fileMetadata.producer && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Producer</span><span className="text-foreground/80 text-right max-w-[60%] truncate">{String(fileMetadata.producer)}</span></div>}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* DOCX */}
                                                {knowledge.type === 'docx' && (
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/15">
                                                            <FileText className="w-8 h-8 text-blue-300 flex-shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{knowledge.original_filename ?? displayTitle}</p>
                                                                {fileMetadata.word_count != null && <p className="text-xs text-muted-foreground">{String(fileMetadata.word_count)} words</p>}
                                                            </div>
                                                            <a href={fileUrl} download className="btn-ghost p-2 flex-shrink-0" onClick={e => e.stopPropagation()} title="Download"><Download className="w-4 h-4" /></a>
                                                        </div>
                                                        {knowledge.content?.trim() && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                                                <RenderedContent content={knowledge.content.slice(0, 3000)} />
                                                            </div>
                                                        )}
                                                        {(fileMetadata.doc_title || fileMetadata.author || fileMetadata.paragraph_count != null || fileMetadata.section_count != null) && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                                                <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                                    {fileMetadata.doc_title && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Title</span><span className="text-foreground/80 truncate max-w-[60%] text-right">{String(fileMetadata.doc_title)}</span></div>}
                                                                    {fileMetadata.author && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Author</span><span className="text-foreground/80">{String(fileMetadata.author)}</span></div>}
                                                                    {fileMetadata.paragraph_count != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Paragraphs</span><span className="font-mono text-foreground/80">{String(fileMetadata.paragraph_count)}</span></div>}
                                                                    {fileMetadata.section_count != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Sections</span><span className="font-mono text-foreground/80">{String(fileMetadata.section_count)}</span></div>}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* XLSX */}
                                                {knowledge.type === 'xlsx' && (
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/15">
                                                            <Table className="w-8 h-8 text-emerald-400 flex-shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{knowledge.original_filename ?? displayTitle}</p>
                                                                {fileMetadata.total_sheets != null && <p className="text-xs text-muted-foreground">{String(fileMetadata.total_sheets)} sheets</p>}
                                                            </div>
                                                            <a href={fileUrl} download className="btn-ghost p-2 flex-shrink-0" onClick={e => e.stopPropagation()} title="Download"><Download className="w-4 h-4" /></a>
                                                        </div>
                                                        {knowledge.content?.trim() && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                                                <RenderedContent content={knowledge.content.slice(0, 3000)} />
                                                            </div>
                                                        )}
                                                        {(fileMetadata.total_sheets != null || fileMetadata.total_rows != null || (fileMetadata.sheet_names && (fileMetadata.sheet_names as string[]).length > 0)) && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                                                <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                                    {fileMetadata.total_sheets != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Sheets</span><span className="font-mono text-foreground/80">{String(fileMetadata.total_sheets)}</span></div>}
                                                                    {fileMetadata.total_rows != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Total Rows</span><span className="font-mono text-foreground/80">{String(fileMetadata.total_rows)}</span></div>}
                                                                    {fileMetadata.sheet_names && (fileMetadata.sheet_names as string[]).length > 0 && (
                                                                        <div className="flex items-start justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Sheets</span><span className="text-foreground/80 text-right">{(fileMetadata.sheet_names as string[]).join(', ')}</span></div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* PPTX */}
                                                {knowledge.type === 'pptx' && (
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/15">
                                                            <Presentation className="w-8 h-8 text-amber-400 flex-shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{knowledge.original_filename ?? displayTitle}</p>
                                                                {fileMetadata.slide_count != null && <p className="text-xs text-muted-foreground">{String(fileMetadata.slide_count)} slides</p>}
                                                            </div>
                                                            <a href={fileUrl} download className="btn-ghost p-2 flex-shrink-0" onClick={e => e.stopPropagation()} title="Download"><Download className="w-4 h-4" /></a>
                                                        </div>
                                                        {knowledge.content?.trim() && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                                                <RenderedContent content={knowledge.content.slice(0, 3000)} />
                                                            </div>
                                                        )}
                                                        {(fileMetadata.slide_count != null || (fileMetadata.slide_titles && (fileMetadata.slide_titles as string[]).length > 0)) && (
                                                            <div>
                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                                                <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                                    {fileMetadata.slide_count != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Slides</span><span className="font-mono text-foreground/80">{String(fileMetadata.slide_count)}</span></div>}
                                                                    {fileMetadata.has_notes && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Speaker Notes</span><span className="text-foreground/80">Yes</span></div>}
                                                                    {fileMetadata.slide_titles && (fileMetadata.slide_titles as string[]).length > 0 && (
                                                                        <div className="px-3 py-2 text-sm">
                                                                            <p className="text-muted-foreground/70 mb-1.5">Slide Titles</p>
                                                                            <div className="space-y-0.5">
                                                                                {(fileMetadata.slide_titles as string[]).slice(0, 10).map((t: string, i: number) => (
                                                                                    <p key={i} className="text-xs text-foreground/70 truncate">{i + 1}. {t}</p>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Tags display / edit */}
                                                {isEditing ? (
                                                    <div className="pt-2 border-t border-border/30">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                                                            {editTags.map(t => (
                                                                <span
                                                                    key={t}
                                                                    className="chip-accent text-[10px] cursor-pointer hover:bg-destructive/20 hover:text-red-300 transition-colors flex items-center gap-1"
                                                                    onClick={() => setEditTags(p => p.filter(x => x !== t))}
                                                                >
                                                                    {t} <X className="w-2.5 h-2.5" />
                                                                </span>
                                                            ))}
                                                            <input
                                                                type="text"
                                                                value={editTagInput}
                                                                onChange={e => setEditTagInput(e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEditTag() } }}
                                                                placeholder="Add tag..."
                                                                className="bg-transparent text-xs placeholder-muted-foreground/50 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : knowledge.tags && knowledge.tags.length > 0 ? (
                                                    <div className="pt-2 border-t border-border/30 flex items-center gap-1.5 flex-wrap">
                                                        <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                                                        {knowledge.tags.map((tag: string) => (
                                                            <span key={tag} className="chip-accent text-[10px]">{tag}</span>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </>
                                )}
                            </div>

                            {/* Footer (create mode only — tags + action buttons) */}
                            {mode === 'create' && (
                                <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t border-border/40 bg-muted/10">
                                    {/* Tags */}
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
                                        <Tag className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                        <div className="flex items-center gap-1 flex-wrap min-w-0">
                                            {tags.map(t => (
                                                <span
                                                    key={t}
                                                    className="chip-accent text-[10px] cursor-pointer hover:bg-destructive/20 hover:text-red-300 transition-colors flex items-center gap-1"
                                                    onClick={() => setTags(p => p.filter(x => x !== t))}
                                                >
                                                    {t} <X className="w-2.5 h-2.5" />
                                                </span>
                                            ))}
                                            <input
                                                type="text"
                                                value={tagInput}
                                                onChange={e => setTagInput(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
                                                }}
                                                placeholder="Add tag..."
                                                className="bg-transparent text-xs placeholder-muted-foreground/50 outline-none w-20"
                                            />
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={onClose}>
                                            Discard
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-primary text-xs py-1.5 px-4 gap-1.5"
                                            onClick={handleSave}
                                            disabled={saving}
                                        >
                                            {saving ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Save className="w-3.5 h-3.5" />
                                            )}
                                            Save
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    )
}
