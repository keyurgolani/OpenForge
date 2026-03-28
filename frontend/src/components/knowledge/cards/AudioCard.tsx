import { useState, useRef, useCallback, useEffect } from 'react'
import { Music, Play, Pause } from 'lucide-react'
import { getKnowledgeFileUrl } from '@/lib/api'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp } from './shared'

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

export function AudioCard({ item, workspaceId, slim, isProcessing }: { item: KnowledgeListItem; workspaceId: string; slim?: boolean; isProcessing?: boolean }) {
    const displayTitle = item.title?.trim() || item.ai_title?.trim() || null
    const duration = item.file_metadata?.duration as number | undefined
    const contentSnippet = item.content_preview?.trim() || null

    const audioRef = useRef<HTMLAudioElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const [playing, setPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [audioDuration, setAudioDuration] = useState(duration ?? 0)

    const fileUrl = getKnowledgeFileUrl(workspaceId, item.id)

    const togglePlay = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        const audio = audioRef.current
        if (!audio) return
        if (playing) {
            audio.pause()
        } else {
            audio.play()
        }
    }, [playing])

    const handleSeek = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        const audio = audioRef.current
        const bar = progressRef.current
        if (!audio || !bar || !audioDuration) return
        const rect = bar.getBoundingClientRect()
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        audio.currentTime = pct * audioDuration
    }, [audioDuration])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        const onPlay = () => setPlaying(true)
        const onPause = () => setPlaying(false)
        const onTime = () => setCurrentTime(audio.currentTime)
        const onLoaded = () => {
            if (audio.duration && isFinite(audio.duration)) setAudioDuration(audio.duration)
        }
        const onEnded = () => { setPlaying(false); setCurrentTime(0) }
        audio.addEventListener('play', onPlay)
        audio.addEventListener('pause', onPause)
        audio.addEventListener('timeupdate', onTime)
        audio.addEventListener('loadedmetadata', onLoaded)
        audio.addEventListener('ended', onEnded)
        return () => {
            audio.removeEventListener('play', onPlay)
            audio.removeEventListener('pause', onPause)
            audio.removeEventListener('timeupdate', onTime)
            audio.removeEventListener('loadedmetadata', onLoaded)
            audio.removeEventListener('ended', onEnded)
        }
    }, [])

    const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0

    return (
        <div className="flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Music className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">
                        Audio
                    </span>
                </div>
                <PinIndicator isPinned={item.is_pinned} />
            </div>

            {/* Inline audio player */}
            <div className="rounded-lg border border-border/20 bg-violet-500/5 px-3 py-3 space-y-2">
                <audio ref={audioRef} src={fileUrl} preload="metadata" />

                <div className="flex items-center gap-2.5">
                    {/* Play/Pause button */}
                    <button
                        type="button"
                        onClick={togglePlay}
                        className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-violet-300 hover:bg-violet-500/30 hover:text-violet-200 transition-colors shrink-0"
                        aria-label={playing ? 'Pause' : 'Play'}
                    >
                        {playing ? (
                            <Pause className="w-3.5 h-3.5" />
                        ) : (
                            <Play className="w-3.5 h-3.5 ml-0.5" />
                        )}
                    </button>

                    {/* Progress bar + times */}
                    <div className="flex-1 min-w-0 space-y-1">
                        <div
                            ref={progressRef}
                            onClick={handleSeek}
                            className="h-1.5 rounded-full bg-violet-500/15 cursor-pointer relative overflow-hidden"
                        >
                            <div
                                className="absolute inset-y-0 left-0 rounded-full bg-violet-400/60 transition-[width] duration-100"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-[9px] font-mono text-violet-300/70">
                            <span>{formatDuration(currentTime)}</span>
                            <span>{audioDuration > 0 ? formatDuration(audioDuration) : '--:--'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Title */}
            <h3 className={`font-semibold text-[14px] leading-snug line-clamp-2 ${displayTitle ? 'text-foreground' : 'text-muted-foreground/60 italic'}`}>
                {displayTitle ?? 'Untitled Audio'}
            </h3>

            {/* Transcript snippet */}
            {contentSnippet && (
                <p className="text-[11px] text-foreground/55 line-clamp-2 leading-relaxed italic">
                    &ldquo;{contentSnippet}&rdquo;
                </p>
            )}

            {!slim && (
                <>
                    {/* Tags */}
                    <TagRow tags={item.tags} />

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/25">
                        <span className="text-[10px] text-muted-foreground/80">
                            {formatTimestamp(item.updated_at)}
                        </span>
                    </div>
                </>
            )}
        </div>
    )
}
