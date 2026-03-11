import { useRef, useState, useEffect, useCallback } from 'react'
import { FileType2, FileText, Table, Presentation, Music, Play, Pause } from 'lucide-react'
import { getKnowledgeThumbnailUrl, getKnowledgeFileUrl } from '@/lib/api'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp, formatFileSize, ThumbnailSkeleton, ProcessingSkeleton } from './shared'

type FileType = 'pdf' | 'document' | 'sheet' | 'slides' | 'audio'

interface FileTypeMeta {
    Icon: React.ComponentType<{ className?: string }>
    label: string
    color: string
    bgColor: string
    accentBorder: string
}

const FILE_META: Record<FileType, FileTypeMeta> = {
    pdf: { Icon: FileType2, label: 'PDF', color: 'text-red-400', bgColor: 'bg-red-400/10', accentBorder: 'border-red-500/20' },
    document: { Icon: FileText, label: 'Document', color: 'text-blue-300', bgColor: 'bg-blue-300/10', accentBorder: 'border-blue-400/20' },
    sheet: { Icon: Table, label: 'Sheet', color: 'text-emerald-400', bgColor: 'bg-emerald-400/10', accentBorder: 'border-emerald-500/20' },
    slides: { Icon: Presentation, label: 'Slides', color: 'text-amber-400', bgColor: 'bg-amber-400/10', accentBorder: 'border-amber-500/20' },
    audio: { Icon: Music, label: 'Audio', color: 'text-violet-400', bgColor: 'bg-violet-400/10', accentBorder: 'border-violet-500/20' },
}

function getPageOrSlideCount(item: KnowledgeListItem): string | null {
    const meta = item.file_metadata
    if (!meta) return null

    const pageCount = meta.page_count ?? meta.pages ?? meta.num_pages
    if (pageCount !== undefined && pageCount !== null) {
        return `${pageCount} page${Number(pageCount) !== 1 ? 's' : ''}`
    }

    const slideCount = meta.slide_count ?? meta.slides ?? meta.num_slides
    if (slideCount !== undefined && slideCount !== null) {
        return `${slideCount} slide${Number(slideCount) !== 1 ? 's' : ''}`
    }

    const sheetCount = meta.sheet_count ?? meta.sheets ?? meta.num_sheets
    if (sheetCount !== undefined && sheetCount !== null) {
        return `${sheetCount} sheet${Number(sheetCount) !== 1 ? 's' : ''}`
    }

    return null
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    if (m >= 60) {
        const h = Math.floor(m / 60)
        const rm = m % 60
        return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${m}:${String(s).padStart(2, '0')}`
}

const WAVEFORM_BARS = [0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.3, 0.7, 0.5, 0.4, 0.8, 0.6, 0.3, 0.7, 0.5, 0.9, 0.4, 0.6, 0.5, 0.7, 0.4, 0.8, 0.6, 0.3]

function AudioWaveformPlayer({ fileUrl, duration, format }: { fileUrl: string; duration?: number; format?: string }) {
    const audioRef = useRef<HTMLAudioElement>(null)
    const scrubberRef = useRef<HTMLDivElement>(null)
    const [playing, setPlaying] = useState(false)
    const [progress, setProgress] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)
    const [audioDuration, setAudioDuration] = useState(duration ?? 0)
    const [scrubbing, setScrubbing] = useState(false)

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        const onTimeUpdate = () => {
            if (audio.duration && isFinite(audio.duration) && !scrubbing) {
                setProgress(audio.currentTime / audio.duration)
                setCurrentTime(audio.currentTime)
            }
        }
        const onLoadedMetadata = () => {
            if (audio.duration && isFinite(audio.duration)) {
                setAudioDuration(audio.duration)
            }
        }
        const onEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0) }
        const onPlay = () => setPlaying(true)
        const onPause = () => setPlaying(false)

        audio.addEventListener('timeupdate', onTimeUpdate)
        audio.addEventListener('loadedmetadata', onLoadedMetadata)
        audio.addEventListener('ended', onEnded)
        audio.addEventListener('play', onPlay)
        audio.addEventListener('pause', onPause)
        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate)
            audio.removeEventListener('loadedmetadata', onLoadedMetadata)
            audio.removeEventListener('ended', onEnded)
            audio.removeEventListener('play', onPlay)
            audio.removeEventListener('pause', onPause)
        }
    }, [scrubbing])

    const togglePlay = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        const audio = audioRef.current
        if (!audio) return
        if (playing) { audio.pause() } else { audio.play() }
    }, [playing])

    const seekToFraction = useCallback((fraction: number) => {
        const audio = audioRef.current
        if (!audio || !audio.duration || !isFinite(audio.duration)) return
        const clamped = Math.max(0, Math.min(1, fraction))
        audio.currentTime = clamped * audio.duration
        setProgress(clamped)
        setCurrentTime(clamped * audio.duration)
    }, [])

    const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        seekToFraction((e.clientX - rect.left) / rect.width)
    }, [seekToFraction])

    const onScrubStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation()
        e.preventDefault()
        setScrubbing(true)
        const track = scrubberRef.current
        if (!track) return
        const rect = track.getBoundingClientRect()
        seekToFraction((e.clientX - rect.left) / rect.width)

        const onMove = (ev: MouseEvent) => {
            const r = track.getBoundingClientRect()
            seekToFraction((ev.clientX - r.left) / r.width)
        }
        const onUp = () => {
            setScrubbing(false)
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }, [seekToFraction])

    const filledBars = Math.floor(progress * WAVEFORM_BARS.length)
    const displayTime = playing || currentTime > 0 ? currentTime : audioDuration

    return (
        <div className="flex items-center gap-2.5 rounded-lg border border-violet-500/20 bg-violet-400/10 px-3 py-2.5">
            {/* Hidden audio element */}
            <audio ref={audioRef} preload="metadata" src={fileUrl} />

            {/* Play/Pause button */}
            <button
                onClick={togglePlay}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 transition-colors shrink-0"
            >
                {playing
                    ? <Pause className="w-3.5 h-3.5 text-violet-300 fill-violet-300" />
                    : <Play className="w-3.5 h-3.5 text-violet-300 fill-violet-300 ml-0.5" />
                }
            </button>

            {/* Waveform + scrubber + time */}
            <div className="flex-1 min-w-0">
                {/* Clickable waveform bars */}
                <div
                    className="flex items-end gap-[2px] h-5 cursor-pointer"
                    onClick={seek}
                >
                    {WAVEFORM_BARS.map((h, i) => (
                        <div
                            key={i}
                            className={`flex-1 rounded-full transition-colors ${
                                i < filledBars ? 'bg-violet-400/80' : 'bg-violet-400/25'
                            }`}
                            style={{ height: `${h * 100}%`, minWidth: 2, maxWidth: 4 }}
                        />
                    ))}
                </div>
                {/* Scrubber track */}
                <div
                    ref={scrubberRef}
                    className="relative h-3 cursor-pointer group/scrub mt-1"
                    onMouseDown={onScrubStart}
                >
                    {/* Track background */}
                    <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[3px] rounded-full bg-violet-400/20" />
                    {/* Filled portion */}
                    <div
                        className="absolute top-1/2 -translate-y-1/2 left-0 h-[3px] rounded-full bg-violet-400/70"
                        style={{ width: `${progress * 100}%` }}
                    />
                    {/* Thumb */}
                    <div
                        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-violet-300 shadow-sm transition-opacity ${scrubbing ? 'opacity-100 scale-110' : 'opacity-0 group-hover/scrub:opacity-100'}`}
                        style={{ left: `${progress * 100}%` }}
                    />
                </div>
                {/* Time + format */}
                <div className="flex items-center gap-2">
                    {displayTime > 0 && (
                        <span className="text-[10px] font-mono text-violet-300/80">
                            {formatDuration(displayTime)}
                        </span>
                    )}
                    {format && (
                        <span className="text-[9px] text-muted-foreground/60 uppercase">{format}</span>
                    )}
                </div>
            </div>
        </div>
    )
}

export function FileCard({ item, workspaceId, slim, isProcessing }: { item: KnowledgeListItem; workspaceId: string; slim?: boolean; isProcessing?: boolean }) {
    const fileType = (item.type as FileType) in FILE_META ? (item.type as FileType) : 'pdf'
    const meta = FILE_META[fileType]
    const { Icon } = meta
    const displayTitle = item.title?.trim() || item.ai_title?.trim() || null
    const hasThumbnail = !!item.thumbnail_path
    const sizeLabel = formatFileSize(item.file_size)
    const countLabel = getPageOrSlideCount(item)
    const fileUrl = getKnowledgeFileUrl(workspaceId, item.id)

    // Audio-specific metadata
    const isAudio = fileType === 'audio'
    const duration = item.file_metadata?.duration as number | undefined
    const format = item.file_metadata?.format as string | undefined

    // Content preview snippet
    const contentSnippet = item.content_preview?.trim() || null

    return (
        <div className="flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 ${meta.color} shrink-0`} />
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>
                        {meta.label}
                    </span>
                    {sizeLabel && (
                        <span className="text-[10px] text-muted-foreground/70 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5">
                            {sizeLabel}
                        </span>
                    )}
                </div>
                <PinIndicator isPinned={item.is_pinned} />
            </div>

            {/* Visual area — skeleton when processing, thumbnail, audio waveform, or type icon */}
            {isProcessing && !hasThumbnail && !isAudio ? (
                <ThumbnailSkeleton className="h-24" />
            ) : hasThumbnail ? (
                <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/20">
                    <img
                        src={getKnowledgeThumbnailUrl(workspaceId, item.id)}
                        alt={displayTitle ?? `${meta.label} preview`}
                        className="w-full object-cover max-h-36"
                        loading="lazy"
                    />
                </div>
            ) : isAudio ? (
                /* Audio: unified waveform player */
                <AudioWaveformPlayer fileUrl={fileUrl} duration={duration} format={format} />
            ) : (
                /* Document icon placeholder */
                <div className={`flex items-center justify-center rounded-lg border border-border/30 ${meta.bgColor} py-5`}>
                    <Icon className={`w-8 h-8 ${meta.color} opacity-40`} />
                </div>
            )}

            {/* Title */}
            <h3 className={`font-semibold text-[14px] leading-snug line-clamp-2 ${displayTitle ? 'text-foreground' : 'text-muted-foreground/60 italic'}`}>
                {displayTitle ?? `Untitled ${meta.label}`}
            </h3>

            {/* Content snippet for documents */}
            {isProcessing && !contentSnippet ? (
                <ProcessingSkeleton lines={2} />
            ) : contentSnippet && !isAudio ? (
                <p className="text-[11px] text-foreground/55 line-clamp-2 leading-relaxed">
                    {contentSnippet}
                </p>
            ) : contentSnippet && isAudio ? (
                <p className="text-[11px] text-foreground/55 line-clamp-2 leading-relaxed italic">
                    &ldquo;{contentSnippet}&rdquo;
                </p>
            ) : null}

            {!slim && (
                <>
                    {/* Tags */}
                    <TagRow tags={item.tags} />

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/40">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground/80">
                                {formatTimestamp(item.updated_at)}
                            </span>
                            {countLabel && (
                                <span className="text-[10px] text-muted-foreground/60">
                                    {countLabel}
                                </span>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
