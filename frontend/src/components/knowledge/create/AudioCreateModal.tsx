import { useState, useRef, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Upload, X, Music, Mic, Square, Pause, Play } from 'lucide-react'
import ModalShell from '@/components/knowledge/shared/ModalShell'
import TagInput from '@/components/knowledge/shared/TagInput'
import { uploadKnowledge, updateKnowledge, updateKnowledgeTags } from '@/lib/api'
import { ACCEPTED_MIMES } from '@/lib/quick-knowledge'

interface AudioCreateModalProps {
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onCreated?: (knowledge: any) => void
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'done'
type Tab = 'upload' | 'record'

export default function AudioCreateModal({ isOpen, onClose, workspaceId, onCreated }: AudioCreateModalProps) {
    const qc = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [tab, setTab] = useState<Tab>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [title, setTitle] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [dragOver, setDragOver] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Recording state
    const [recordingState, setRecordingState] = useState<RecordingState>('idle')
    const [duration, setDuration] = useState(0)
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
    const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const reset = () => {
        setFile(null)
        setTitle('')
        setTags([])
        setDragOver(false)
        setError(null)
        stopRecording(true)
        setRecordingState('idle')
        setDuration(0)
        setRecordedBlob(null)
        if (recordedUrl) URL.revokeObjectURL(recordedUrl)
        setRecordedUrl(null)
        setTab('upload')
    }

    // Cleanup on unmount / close
    useEffect(() => {
        if (!isOpen) {
            stopRecording(true)
            if (recordedUrl) URL.revokeObjectURL(recordedUrl)
        }
    }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleClose = () => {
        reset()
        onClose()
    }

    const handleFileSelect = useCallback((f: File) => {
        setFile(f)
        setError(null)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFileSelect(f)
    }, [handleFileSelect])

    // --- Recording ---
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream
            chunksRef.current = []

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4'

            const recorder = new MediaRecorder(stream, { mimeType })
            mediaRecorderRef.current = recorder

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType })
                setRecordedBlob(blob)
                if (recordedUrl) URL.revokeObjectURL(recordedUrl)
                setRecordedUrl(URL.createObjectURL(blob))
                setRecordingState('done')
                clearTimer()
            }

            recorder.start(250) // collect chunks every 250ms
            setRecordingState('recording')
            setDuration(0)
            setError(null)

            // Duration timer
            const start = Date.now()
            timerRef.current = setInterval(() => {
                setDuration((Date.now() - start) / 1000)
            }, 200)
        } catch (err: any) {
            if (err?.name === 'NotAllowedError') {
                setError('Microphone access denied. Please allow microphone access and try again.')
            } else {
                setError('Could not access microphone. Please check your device settings.')
            }
        }
    }

    const pauseRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.pause()
            setRecordingState('paused')
            clearTimer()
        }
    }

    const resumeRecording = () => {
        if (mediaRecorderRef.current?.state === 'paused') {
            mediaRecorderRef.current.resume()
            setRecordingState('recording')
            // Resume timer from current duration
            const resumeStart = Date.now() - duration * 1000
            timerRef.current = setInterval(() => {
                setDuration((Date.now() - resumeStart) / 1000)
            }, 200)
        }
    }

    const stopRecording = (cleanup = false) => {
        clearTimer()
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        if (cleanup || !mediaRecorderRef.current) {
            // Release mic
            streamRef.current?.getTracks().forEach(t => t.stop())
            streamRef.current = null
            mediaRecorderRef.current = null
        } else {
            // Release mic but keep recorder reference for onstop handler
            streamRef.current?.getTracks().forEach(t => t.stop())
            streamRef.current = null
        }
    }

    const clearTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
    }

    const discardRecording = () => {
        if (recordedUrl) URL.revokeObjectURL(recordedUrl)
        setRecordedBlob(null)
        setRecordedUrl(null)
        setRecordingState('idle')
        setDuration(0)
    }

    // --- Save ---
    const handleSave = async () => {
        let audioFile: File | null = null
        if (tab === 'upload') {
            audioFile = file
        } else if (recordedBlob) {
            // Use a clean MIME type (strip codec params) and a readable filename
            const cleanMime = recordedBlob.type.split(';')[0].trim()
            const ext = cleanMime === 'audio/mp4' ? '.m4a' : '.webm'
            const now = new Date()
            const ts = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
            audioFile = new File([recordedBlob], `recording-${ts}${ext}`, { type: cleanMime })
        }

        if (!audioFile) {
            setError(tab === 'upload' ? 'Please select an audio file.' : 'Please record audio first.')
            return
        }
        setSaving(true)
        setError(null)
        try {
            const result = await uploadKnowledge(workspaceId, audioFile)

            // Persist user-provided title
            if (title.trim() && result?.id) {
                await updateKnowledge(workspaceId, result.id, { title: title.trim() })
            }
            // Persist tags via dedicated endpoint
            if (tags.length > 0 && result?.id) {
                await updateKnowledgeTags(workspaceId, result.id, tags)
            }

            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            onCreated?.(result)
            reset()
            onClose()
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to upload. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const canSave = tab === 'upload' ? !!file : recordingState === 'done'

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={handleClose}
            title="Audio"
            size="md"
            footer={
                <>
                    <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={handleClose}>
                        Discard
                    </button>
                    <button
                        type="button"
                        className="btn-primary text-xs py-1.5 px-4 gap-1.5"
                        onClick={handleSave}
                        disabled={saving || !canSave}
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                    </button>
                </>
            }
        >
            {/* Tab switcher */}
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted/30 border border-border/60">
                <button
                    type="button"
                    onClick={() => setTab('upload')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        tab === 'upload' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Upload className="w-3.5 h-3.5" />
                    Upload
                </button>
                <button
                    type="button"
                    onClick={() => setTab('record')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        tab === 'record' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Mic className="w-3.5 h-3.5" />
                    Record
                </button>
            </div>

            {tab === 'upload' ? (
                /* ---- Upload tab ---- */
                <>
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
                            accept={ACCEPTED_MIMES.audio}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                            className="hidden"
                        />
                        {file ? (
                            <div className="flex items-center gap-3 w-full p-3">
                                <div className="w-16 h-16 rounded-lg bg-muted/40 border border-border/60 flex items-center justify-center flex-shrink-0">
                                    <Music className="w-7 h-7 text-orange-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{file.name}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(file.size)}</p>
                                </div>
                                <button
                                    type="button"
                                    className="btn-ghost p-1.5 flex-shrink-0"
                                    onClick={e => { e.stopPropagation(); setFile(null) }}
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
                                    <p className="text-xs text-muted-foreground mt-0.5">Audio</p>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                /* ---- Record tab ---- */
                <div className="flex flex-col items-center gap-4 py-4">
                    {recordingState === 'idle' && (
                        <>
                            <button
                                type="button"
                                onClick={startRecording}
                                className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center hover:bg-red-500/30 transition-all hover:scale-105 active:scale-95"
                            >
                                <Mic className="w-8 h-8 text-red-400" />
                            </button>
                            <p className="text-xs text-muted-foreground">Tap to start recording</p>
                        </>
                    )}

                    {(recordingState === 'recording' || recordingState === 'paused') && (
                        <>
                            {/* Animated recording indicator */}
                            <div className="relative w-20 h-20 flex items-center justify-center">
                                {recordingState === 'recording' && (
                                    <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                                )}
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                                    recordingState === 'recording' ? 'bg-red-500/30 border-2 border-red-500' : 'bg-yellow-500/20 border-2 border-yellow-500/50'
                                }`}>
                                    <Mic className={`w-8 h-8 ${recordingState === 'recording' ? 'text-red-400' : 'text-yellow-400'}`} />
                                </div>
                            </div>

                            {/* Duration */}
                            <span className="text-2xl font-mono text-foreground tabular-nums">
                                {formatDuration(duration)}
                            </span>

                            {/* Controls */}
                            <div className="flex items-center gap-3">
                                {recordingState === 'recording' ? (
                                    <button
                                        type="button"
                                        onClick={pauseRecording}
                                        className="p-2.5 rounded-full bg-muted/50 border border-border/60 text-foreground hover:bg-muted/70 transition-colors"
                                        title="Pause"
                                    >
                                        <Pause className="w-5 h-5" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={resumeRecording}
                                        className="p-2.5 rounded-full bg-muted/50 border border-border/60 text-foreground hover:bg-muted/70 transition-colors"
                                        title="Resume"
                                    >
                                        <Play className="w-5 h-5" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => stopRecording()}
                                    className="p-2.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-colors"
                                    title="Stop"
                                >
                                    <Square className="w-5 h-5" />
                                </button>
                            </div>

                            <p className="text-[10px] text-muted-foreground">
                                {recordingState === 'recording' ? 'Recording...' : 'Paused'}
                            </p>
                        </>
                    )}

                    {recordingState === 'done' && recordedUrl && (
                        <>
                            {/* Playback */}
                            <div className="w-full rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <Music className="w-4 h-4 text-orange-400 flex-shrink-0" />
                                    <span className="text-sm font-medium text-foreground">Recording</span>
                                    <span className="text-xs text-muted-foreground ml-auto">
                                        {formatDuration(duration)}
                                        {recordedBlob && ` · ${formatFileSize(recordedBlob.size)}`}
                                    </span>
                                </div>
                                <audio controls src={recordedUrl} className="w-full" preload="metadata" />
                            </div>

                            <button
                                type="button"
                                onClick={discardRecording}
                                className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
                            >
                                Discard & record again
                            </button>
                        </>
                    )}
                </div>
            )}

            <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title (optional)"
                className="w-full input text-sm"
            />

            <TagInput tags={tags} onChange={setTags} placeholder="Add tags..." />

            {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                </p>
            )}
        </ModalShell>
    )
}
