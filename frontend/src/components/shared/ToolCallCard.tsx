import { useState, useEffect, useMemo, useRef } from 'react'
import {
    Wrench, CheckCircle2, XCircle, Loader2,
    File, Folder, Terminal, Globe, BookOpen, MessageSquare, Circle,
    Code2, GitBranch, ListChecks, User, Bot, Package, Cpu,
    Database, MemoryStick
} from 'lucide-react'
import { TimelineBadge } from './TimelineBadge'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolResult {
    success: boolean
    output: unknown
    error?: string
}

interface HITLInfo {
    hitl_id: string
    action_summary: string
    risk_level: string
    status: 'pending' | 'approved' | 'denied'
    resolution_note?: string | null
}

interface ToolCallCardProps {
    callId: string
    toolName: string
    arguments: Record<string, unknown>
    result?: ToolResult
    isRunning: boolean
    hitl?: HITLInfo | null
    nestedTimeline?: unknown[] | null
    delegatedConversationId?: string | null
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function unwrapUntrustedContent(value: string): string {
    const match = value.match(/^<untrusted_content\b[^>]*>\s*([\s\S]*?)\s*<\/untrusted_content>$/i)
    return match ? match[1].trim() : value
}

function tryParseJSON(val: unknown): unknown {
    if (typeof val !== 'string') return val

    const normalized = unwrapUntrustedContent(val).trim()
    if (!normalized) return normalized

    try { return JSON.parse(normalized) } catch { return normalized }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ts: string | number): string {
    try {
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return String(ts) }
}

function humanizeKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function truncate(s: string, max = 60): string {
    return s.length > max ? s.slice(0, max) + '…' : s
}

const TOOL_OUTPUT_PREVIEW_MAX_LINES = 12
const TOOL_OUTPUT_PREVIEW_MAX_CHARS = 1400

function buildOutputPreview(content: string): { text: string; truncated: boolean } {
    if (!content) return { text: content, truncated: false }

    let next = content
    let truncated = false
    const lines = next.split('\n')

    if (lines.length > TOOL_OUTPUT_PREVIEW_MAX_LINES) {
        next = lines.slice(0, TOOL_OUTPUT_PREVIEW_MAX_LINES).join('\n')
        truncated = true
    }

    if (next.length > TOOL_OUTPUT_PREVIEW_MAX_CHARS) {
        next = next.slice(0, TOOL_OUTPUT_PREVIEW_MAX_CHARS).trimEnd()
        truncated = true
    }

    if (truncated) next = `${next}\n…`
    return { text: next, truncated }
}

// ── Header hint: primary arg shown inline in the collapsed toggle ─────────────

const PRIMARY_ARG: Record<string, string> = {
    'filesystem.read_file': 'path', 'filesystem.write_file': 'path',
    'filesystem.list_directory': 'path', 'filesystem.search_files': 'pattern',
    'filesystem.file_info': 'path', 'filesystem.move_file': 'source',
    'filesystem.delete_file': 'path',
    'http.get': 'url', 'http.post': 'url', 'http.fetch_page': 'url',
    'shell.execute': 'command', 'shell.execute_python': 'code',
    'git.add': 'path', 'git.commit': 'message', 'git.diff': 'path',
    'language.parse_ast': 'path', 'language.find_definition': 'name',
    'language.find_references': 'name', 'language.apply_diff': 'path',
    'memory.store': 'key', 'memory.recall': 'key', 'memory.forget': 'key',
    'memory.search_workspace': 'query', 'memory.delete_knowledge': 'knowledge_id',
    'memory.read_conversation': 'conversation_id',
    'workspace.search': 'query', 'workspace.save_knowledge': 'title',
    'workspace.list_knowledge': 'type', 'workspace.delete_knowledge': 'knowledge_id',
    'workspace.read_chat': 'conversation_id',
    'task.create_plan': 'title', 'task.update_step': 'step_id',
    'skills.read': 'name', 'skills.install': 'source', 'skills.remove': 'name',
    'agent.invoke': 'instruction',
}

function getHeaderHint(toolName: string, args: Record<string, unknown>): string | null {
    const key = PRIMARY_ARG[toolName]
    if (!key || !(key in args)) return null
    const val = args[key]
    if (val === null || val === undefined) return null
    const str = String(val)
    if (!str.trim()) return null
    // For URLs, show just the path part
    if (key === 'url') {
        try { const u = new URL(str); return truncate(u.hostname + u.pathname, 55) } catch { /* */ }
    }
    // Show full instruction for agent tools — the badge wraps to fit
    if (toolName.startsWith('agent.')) return str
    return truncate(str, 55)
}

// ── Input section ─────────────────────────────────────────────────────────────

const CODE_LIKE_KEYS = new Set(['command', 'code', 'content', 'snippet', 'diff', 'new_string', 'old_string', 'message'])
const SKIP_KEYS = new Set(['workspace_id'])

function InputField({ argKey, value }: { argKey: string; value: unknown }) {
    const isCode = CODE_LIKE_KEYS.has(argKey) || (argKey === 'path' && typeof value === 'string')
    const isMultiline = typeof value === 'string' && value.includes('\n')
    const isArray = Array.isArray(value)
    const isObject = value !== null && typeof value === 'object' && !isArray

    return (
        <div className={isCode && isMultiline ? 'flex flex-col gap-0.5' : isCode ? 'flex flex-col gap-0.5' : 'flex items-baseline gap-2'}>
            <span className="text-[10px] uppercase tracking-wide text-accent/55 font-medium shrink-0">
                {humanizeKey(argKey)}
            </span>
            {isCode && typeof value === 'string' ? (
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/30 px-2 py-1.5 text-[11px] text-foreground/75 max-h-32 font-mono">
                    {value}
                </pre>
            ) : isArray ? (
                <ArrayOutput items={value as unknown[]} />
            ) : isObject ? (
                <KeyValueOutput obj={value as Record<string, unknown>} />
            ) : typeof value === 'boolean' ? (
                <span className={value ? 'text-emerald-400 text-[11px]' : 'text-red-400 text-[11px]'}>{String(value)}</span>
            ) : typeof value === 'number' ? (
                <span className="text-sky-400/80 text-[11px]">{value}</span>
            ) : (
                <span className="break-all text-foreground/75 text-[11px]">{String(value)}</span>
            )}
        </div>
    )
}

export function InputSection({ toolName: _toolName, args }: { toolName: string; args: Record<string, unknown> }) {
    const entries = Object.entries(args).filter(([k]) => !SKIP_KEYS.has(k))
    if (entries.length === 0) return null
    return (
        <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Input</div>
            <div className="space-y-1.5">
                {entries.map(([k, v]) => <InputField key={k} argKey={k} value={v} />)}
            </div>
        </div>
    )
}

// ── Output sub-components ─────────────────────────────────────────────────────

function FileListOutput({ items }: { items: Array<{ name: string; type: string; size?: number; modified?: string }> }) {
    return (
        <div className="space-y-0.5">
            {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 text-[11px]">
                    {item.type === 'directory'
                        ? <Folder className="h-3 w-3 text-accent/60 shrink-0" />
                        : <File className="h-3 w-3 text-muted-foreground/70 shrink-0" />}
                    <span className="flex-1 truncate text-foreground/80">{item.name}</span>
                    {item.size !== undefined && item.type !== 'directory' && (
                        <span className="text-muted-foreground/60 shrink-0">{formatBytes(item.size)}</span>
                    )}
                    {item.modified && (
                        <span className="text-muted-foreground/35 shrink-0 hidden sm:block">{formatDate(item.modified)}</span>
                    )}
                </div>
            ))}
        </div>
    )
}

function SearchResultsOutput({ results }: {
    results: Array<{ title: string; chunk_text?: string; snippet?: string; knowledge_type?: string; score?: number; knowledge_id?: string; conversation_id?: string }>
}) {
    if (results.length === 0) return <span className="text-[11px] text-muted-foreground/70 italic">No results found</span>
    return (
        <div className="space-y-1.5">
            {results.map((r, i) => (
                <div key={i} className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className="text-[11px] font-medium text-foreground/85 leading-tight">{r.title}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                            {r.knowledge_type && (
                                <span className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide bg-accent/15 text-accent/70">{r.knowledge_type}</span>
                            )}
                            {r.score !== undefined && (
                                <span className="text-[10px] text-muted-foreground/70">{Math.round(r.score * 100)}%</span>
                            )}
                        </div>
                    </div>
                    {(r.chunk_text || r.snippet) && (
                        <p className="text-[10px] leading-relaxed text-muted-foreground/65 line-clamp-2">{r.chunk_text ?? r.snippet}</p>
                    )}
                </div>
            ))}
        </div>
    )
}

function KnowledgeListOutput({ total, knowledge }: { total: number; knowledge: Array<{ id: string; title: string; type: string; tags?: string[] }> }) {
    return (
        <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground/70 mb-1">{total} item{total !== 1 ? 's' : ''}</div>
            {knowledge.slice(0, 20).map((k, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 text-[11px]">
                    <BookOpen className="h-3 w-3 text-accent/50 shrink-0" />
                    <span className="flex-1 truncate text-foreground/80">{k.title}</span>
                    <span className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide bg-muted/40 text-muted-foreground/60 shrink-0">{k.type}</span>
                </div>
            ))}
            {total > 20 && <div className="text-[10px] text-muted-foreground/60 pt-0.5">+{total - 20} more…</div>}
        </div>
    )
}

function ChatListOutput({ chats }: { chats: Array<{ id: string; title: string; message_count: number; updated_at: string }> }) {
    if (chats.length === 0) return <span className="text-[11px] text-muted-foreground/70 italic">No chats found</span>
    return (
        <div className="space-y-0.5">
            {chats.map((c, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 text-[11px]">
                    <MessageSquare className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                    <span className="flex-1 truncate text-foreground/80">{c.title}</span>
                    <span className="text-muted-foreground/60 shrink-0 tabular-nums">{c.message_count} msgs</span>
                </div>
            ))}
        </div>
    )
}

function ConversationOutput({ data }: { data: { id: string; title: string; message_count: number; messages: Array<{ role: string; content: string }> } }) {
    return (
        <div className="space-y-1.5">
            <div className="text-[10px] text-muted-foreground/70 mb-1">
                {data.title} · {data.message_count} message{data.message_count !== 1 ? 's' : ''}
            </div>
            {data.messages.map((m, i) => (
                <div key={i} className={`flex gap-2 text-[11px] ${m.role === 'user' ? '' : ''}`}>
                    {m.role === 'user'
                        ? <User className="h-3 w-3 text-muted-foreground/70 shrink-0 mt-0.5" />
                        : <Bot className="h-3 w-3 text-accent/50 shrink-0 mt-0.5" />}
                    <span className="text-foreground/75 leading-relaxed line-clamp-3 break-words">{m.content}</span>
                </div>
            ))}
        </div>
    )
}

function HttpOutput({ data }: { data: { status: number; body: string; headers?: Record<string, string> } }) {
    const isOk = data.status >= 200 && data.status < 300
    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-[11px] font-mono font-medium ${isOk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {data.status}
                </span>
                <span className="text-[10px] text-muted-foreground/70">{isOk ? 'OK' : 'Error'}</span>
            </div>
            {data.body && (
                <ExpandablePre content={data.body} className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/30 px-2 py-1.5 text-[11px] text-foreground/70 max-h-48 font-mono" />
            )}
        </div>
    )
}

function TaskPlanOutput({ plan }: { plan: { title: string; steps: Array<{ id: string; description: string; status: string; note?: string }> } }) {
    const statusIcon = (status: string) => {
        if (status === 'done') return <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
        if (status === 'failed') return <XCircle className="h-3 w-3 text-red-400 shrink-0" />
        if (status === 'in_progress') return <Loader2 className="h-3 w-3 text-accent/70 animate-spin shrink-0" />
        return <Circle className="h-3 w-3 text-muted-foreground/70 shrink-0" />
    }
    return (
        <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-foreground/80 mb-1">{plan.title}</div>
            {plan.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                    {statusIcon(s.status)}
                    <div className="flex-1 min-w-0">
                        <span className={`leading-tight ${s.status === 'done' ? 'text-muted-foreground/70 line-through' : 'text-foreground/80'}`}>
                            {s.description}
                        </span>
                        {s.note && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{s.note}</div>}
                    </div>
                </div>
            ))}
        </div>
    )
}

function AstOutput({ data }: { data: { classes: Array<{ name: string; line: number }>; functions: Array<{ name: string; line: number }>; imports: string[]; lines: number } }) {
    return (
        <div className="space-y-2 text-[11px]">
            <div className="text-[10px] text-muted-foreground/70">{data.lines} lines</div>
            {data.classes.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Classes</div>
                    {data.classes.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5">
                            <Code2 className="h-3 w-3 text-accent/50 shrink-0" />
                            <span className="text-foreground/80 font-mono">{c.name}</span>
                            <span className="text-muted-foreground/60 ml-auto">L{c.line}</span>
                        </div>
                    ))}
                </div>
            )}
            {data.functions.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Functions</div>
                    {data.functions.slice(0, 20).map((f, i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5">
                            <span className="text-accent/40 font-mono text-[10px] shrink-0">ƒ</span>
                            <span className="text-foreground/75 font-mono">{f.name}</span>
                            <span className="text-muted-foreground/60 ml-auto">L{f.line}</span>
                        </div>
                    ))}
                    {data.functions.length > 20 && <div className="text-[10px] text-muted-foreground/60">+{data.functions.length - 20} more…</div>}
                </div>
            )}
            {data.imports.length > 0 && (
                <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Imports</div>
                    <div className="flex flex-wrap gap-1">
                        {data.imports.slice(0, 12).map((imp, i) => (
                            <span key={i} className="rounded bg-muted/30 px-1.5 py-0.5 text-[10px] font-mono text-foreground/60">{imp}</span>
                        ))}
                        {data.imports.length > 12 && <span className="text-[10px] text-muted-foreground/60">+{data.imports.length - 12}</span>}
                    </div>
                </div>
            )}
        </div>
    )
}

function DefinitionOutput({ data }: { data: { name: string; type: string; line: number; end_line: number; snippet: string } }) {
    return (
        <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2">
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-accent/70">{data.type}</span>
                <span className="font-mono text-foreground/80">{data.name}</span>
                <span className="text-muted-foreground/60 ml-auto">L{data.line}–{data.end_line}</span>
            </div>
            {data.snippet && (
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/30 px-2 py-1.5 text-[11px] text-foreground/75 max-h-48 font-mono">
                    {data.snippet}
                </pre>
            )}
        </div>
    )
}

function ReferencesOutput({ data }: { data: { references: Array<{ line: number; content: string }>; count: number } }) {
    return (
        <div className="space-y-1 text-[11px]">
            <div className="text-[10px] text-muted-foreground/70 mb-1">{data.count} reference{data.count !== 1 ? 's' : ''}</div>
            {data.references.map((ref, i) => (
                <div key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 font-mono tabular-nums shrink-0 w-8 text-right">{ref.line}</span>
                    <pre className="text-foreground/70 whitespace-pre-wrap break-words font-mono">{ref.content}</pre>
                </div>
            ))}
        </div>
    )
}

function SkillListOutput({ data }: { data: { skills: Array<{ name: string; description: string }>; count: number } }) {
    return (
        <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground/70 mb-1">{data.count} skill{data.count !== 1 ? 's' : ''}</div>
            {data.skills.map((s, i) => (
                <div key={i} className="flex items-start gap-2 py-0.5 text-[11px]">
                    <Package className="h-3 w-3 text-accent/50 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <div className="font-medium text-foreground/80">{s.name}</div>
                        {s.description && <div className="text-[10px] text-muted-foreground/55 mt-0.5">{s.description}</div>}
                    </div>
                </div>
            ))}
        </div>
    )
}

function DiffOutput({ content }: { content: string }) {
    const lines = content.split('\n')
    return (
        <pre className="overflow-x-auto max-h-64 text-[11px] font-mono rounded bg-muted/20 px-2 py-1.5">
            {lines.map((line, i) => {
                let cls = 'text-foreground/65'
                if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-emerald-400/90'
                else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-red-400/90'
                else if (line.startsWith('@@')) cls = 'text-sky-400/70'
                else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) cls = 'text-muted-foreground/70'
                return <span key={i} className={`block whitespace-pre ${cls}`}>{line}</span>
            })}
        </pre>
    )
}

function ExpandablePre({ content, className }: { content: string; className: string }) {
    const [expanded, setExpanded] = useState(false)
    const preview = useMemo(() => buildOutputPreview(content), [content])
    const displayContent = expanded ? content : preview.text

    return (
        <div className="space-y-1.5">
            <pre className={className}>
                {displayContent}
            </pre>
            {preview.truncated && (
                <button
                    type="button"
                    className="text-[10px] text-muted-foreground/60 hover:text-foreground/80 transition-colors"
                    onClick={() => setExpanded(prev => !prev)}
                >
                    {expanded ? 'Show less output' : 'Show full output'}
                </button>
            )}
        </div>
    )
}

function TerminalOutput({ content }: { content: string }) {
    return <ExpandablePre content={content} className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-[#0d0d0d] border border-border/60 px-3 py-2 text-[11px] text-green-300/80 font-mono max-h-64" />
}

function StringOutput({ content, toolName }: { content: string; toolName: string }) {
    const category = toolName.split('.')[0]
    // Git diff output
    if (category === 'git' && toolName === 'git.diff' && (content.includes('--- ') || content.includes('+++ ') || content.includes('@@'))) {
        return <DiffOutput content={content} />
    }
    // Shell / python output → terminal style
    if (category === 'shell') {
        return <TerminalOutput content={content} />
    }
    // File content → code block
    if (toolName === 'filesystem.read_file' || toolName === 'skills.read') {
        return <ExpandablePre content={content} className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/25 px-2 py-1.5 text-[11px] text-foreground/75 font-mono max-h-64" />
    }
    // Simple single-line success message
    if (!content.includes('\n')) {
        return <span className="text-[11px] text-foreground/75 break-words">{content}</span>
    }
    // Git log / status and anything else multi-line
    if (category === 'git') {
        return <TerminalOutput content={content} />
    }
    return <ExpandablePre content={content} className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/25 px-2 py-1.5 text-[11px] text-foreground/70 max-h-48" />
}

// ── Generic key/value tree — no raw JSON ─────────────────────────────────────

function PrimitiveValue({ val }: { val: unknown }) {
    if (val === null || val === undefined) return <span className="italic text-muted-foreground/60">null</span>
    if (typeof val === 'boolean') return <span className={val ? 'text-emerald-400' : 'text-red-400'}>{String(val)}</span>
    if (typeof val === 'number') return <span className="text-sky-400/80 tabular-nums">{val}</span>
    return <span className="text-foreground/75 break-words">{String(val)}</span>
}

function KeyValueOutput({ obj, depth = 0 }: { obj: Record<string, unknown>; depth?: number }) {
    const entries = Object.entries(obj)
    if (entries.length === 0) return <span className="text-[11px] text-muted-foreground/60 italic">Empty</span>
    return (
        <div className={`space-y-1 text-[11px] ${depth > 0 ? 'pl-3 border-l border-border/50' : ''}`}>
            {entries.map(([k, v]) => {
                const isNested = v !== null && typeof v === 'object' && !Array.isArray(v)
                const isArr = Array.isArray(v)
                const isLongStr = typeof v === 'string' && (v.includes('\n') || v.length > 80)
                return (
                    <div key={k} className={isNested || isArr || isLongStr ? 'flex flex-col gap-0.5' : 'flex items-baseline gap-2'}>
                        <span className="text-[10px] uppercase tracking-wide text-accent/55 font-medium shrink-0">{humanizeKey(k)}</span>
                        {isNested ? (
                            <KeyValueOutput obj={v as Record<string, unknown>} depth={depth + 1} />
                        ) : isArr ? (
                            <ArrayOutput items={v as unknown[]} depth={depth} />
                        ) : isLongStr ? (
                            <ExpandablePre content={String(v)} className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/25 px-2 py-1.5 text-[11px] text-foreground/70 max-h-32" />
                        ) : (
                            <PrimitiveValue val={v} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

function ArrayOutput({ items, depth = 0 }: { items: unknown[]; depth?: number }) {
    if (items.length === 0) return <span className="text-[11px] text-muted-foreground/60 italic">Empty list</span>
    const first = items[0]
    // Array of primitives → comma/badge list
    if (typeof first !== 'object' || first === null) {
        return (
            <div className="flex flex-wrap gap-1">
                {items.slice(0, 20).map((item, i) => (
                    <span key={i} className="rounded bg-muted/30 px-1.5 py-0.5 text-[10px] text-foreground/70">
                        {String(item)}
                    </span>
                ))}
                {items.length > 20 && <span className="text-[10px] text-muted-foreground/60">+{items.length - 20}</span>}
            </div>
        )
    }
    // Array of objects → compact row per item
    return (
        <div className={`space-y-1 ${depth > 0 ? 'pl-2' : ''}`}>
            {(items as Record<string, unknown>[]).slice(0, 15).map((item, i) => (
                <div key={i} className="rounded border border-border/50 bg-muted/15 px-2 py-1.5">
                    <KeyValueOutput obj={item} depth={depth + 1} />
                </div>
            ))}
            {items.length > 15 && <div className="text-[10px] text-muted-foreground/60 pt-0.5">+{items.length - 15} more items</div>}
        </div>
    )
}

// ── Main output dispatcher ────────────────────────────────────────────────────

function SmartOutput({ toolName, output }: { toolName: string; output: unknown }) {
    const parsed = tryParseJSON(output)

    // ── String outputs ──────────────────────────────────────────────────────
    if (typeof parsed === 'string') {
        return <StringOutput content={parsed} toolName={toolName} />
    }

    if (parsed === null || parsed === undefined) {
        return <span className="text-[11px] text-muted-foreground/60 italic">No output</span>
    }

    // ── Array outputs ───────────────────────────────────────────────────────
    if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
            return <span className="text-[11px] text-muted-foreground/60 italic">Empty</span>
        }
        const first = parsed[0]
        if (first && typeof first === 'object') {
            // File list
            if ('name' in first && 'type' in first) {
                return <FileListOutput items={parsed as Array<{ name: string; type: string; size?: number; modified?: string }>} />
            }
            // Chat / conversation list
            if ('id' in first && 'message_count' in first) {
                return <ChatListOutput chats={parsed as Array<{ id: string; title: string; message_count: number; updated_at: string }>} />
            }
        }
        // Generic string array (e.g. filesystem.search_files) or unrecognised object arrays
        return <ArrayOutput items={parsed} />
    }

    // ── Object outputs ──────────────────────────────────────────────────────
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>

        // Search results
        if ('results' in obj && Array.isArray(obj.results)) {
            return <SearchResultsOutput results={obj.results as Array<{ title: string; chunk_text?: string; knowledge_type?: string; score?: number }> } />
        }

        // Knowledge list
        if ('knowledge' in obj && Array.isArray(obj.knowledge)) {
            return <KnowledgeListOutput total={Number(obj.total ?? 0)} knowledge={obj.knowledge as Array<{ id: string; title: string; type: string; tags?: string[] }>} />
        }

        // Conversation content (read_chat / read_conversation)
        if ('messages' in obj && Array.isArray(obj.messages)) {
            return <ConversationOutput data={obj as { id: string; title: string; message_count: number; messages: Array<{ role: string; content: string }> }} />
        }

        // HTTP response
        if ('status' in obj && 'body' in obj) {
            return <HttpOutput data={obj as { status: number; body: string; headers?: Record<string, string> }} />
        }

        // Task plan (nested under "plan")
        if ('plan' in obj && typeof obj.plan === 'object' && obj.plan !== null) {
            const plan = obj.plan as { title: string; steps: Array<{ id: string; description: string; status: string; note?: string }> }
            return <TaskPlanOutput plan={plan} />
        }
        // Task plan (flat)
        if ('steps' in obj && Array.isArray(obj.steps) && 'title' in obj) {
            return <TaskPlanOutput plan={obj as { title: string; steps: Array<{ id: string; description: string; status: string; note?: string }> }} />
        }

        // AST
        if ('classes' in obj && 'functions' in obj && 'imports' in obj) {
            return <AstOutput data={obj as { classes: Array<{ name: string; line: number }>; functions: Array<{ name: string; line: number }>; imports: string[]; lines: number }} />
        }

        // Code definition
        if ('snippet' in obj && 'line' in obj && 'name' in obj) {
            return <DefinitionOutput data={obj as { name: string; type: string; line: number; end_line: number; snippet: string }} />
        }

        // Code references
        if ('references' in obj && 'count' in obj) {
            return <ReferencesOutput data={obj as { references: Array<{ line: number; content: string }>; count: number }} />
        }

        // Skills list
        if ('skills' in obj && Array.isArray(obj.skills)) {
            return <SkillListOutput data={obj as { skills: Array<{ name: string; description: string }>; count: number }} />
        }

        // File info
        if ('path' in obj && 'type' in obj && ('size' in obj || 'modified' in obj)) {
            const fi = obj as { path: string; type: string; size?: number; modified?: string; created?: string; permissions?: string }
            return (
                <div className="space-y-1 text-[11px]">
                    {Object.entries(fi).map(([k, v]) => v !== undefined && (
                        <div key={k} className="flex items-baseline gap-2">
                            <span className="text-[10px] uppercase tracking-wide text-accent/55 font-medium shrink-0">{humanizeKey(k)}</span>
                            <span className="text-foreground/75 font-mono break-all">
                                {k === 'size' ? formatBytes(Number(v)) : k.includes('modified') || k.includes('created') ? formatDate(String(v)) : String(v)}
                            </span>
                        </div>
                    ))}
                </div>
            )
        }

        // Generic object fallback — structured key/value display
        return <KeyValueOutput obj={obj} />
    }

    // Primitive fallback
    return <span className="text-[11px] text-foreground/75 break-words">{String(parsed)}</span>
}

// ── Category icons ────────────────────────────────────────────────────────────

function CategoryIcon({ category }: { category: string }) {
    const cls = "h-3 w-3 text-accent/60"
    switch (category) {
        case 'filesystem': return <File className={cls} />
        case 'shell': return <Terminal className={cls} />
        case 'http': return <Globe className={cls} />
        case 'git': return <GitBranch className={cls} />
        case 'memory': return <MemoryStick className={cls} />
        case 'workspace': return <Database className={cls} />
        case 'language': return <Code2 className={cls} />
        case 'task': return <ListChecks className={cls} />
        case 'skills': return <Package className={cls} />
        case 'agent': return <Cpu className={cls} />
        default: return <Wrench className={cls} />
    }
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function ToolCallCard({ callId: _callId, toolName, arguments: args, result, isRunning, hitl, nestedTimeline: _nestedTimeline, delegatedConversationId: _delegatedConversationId }: ToolCallCardProps) {
    const [isExpanded, setIsExpanded] = useState(isRunning)
    const [userInteracted, setUserInteracted] = useState(false)
    const wasRunning = useRef(isRunning)
    const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!isRunning && wasRunning.current && !userInteracted) {
            autoCollapseTimer.current = setTimeout(() => {
                setIsExpanded(false)
                autoCollapseTimer.current = null
            }, 1000)
        }
        wasRunning.current = isRunning
    }, [isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => { if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current) }
    }, [])

    const toggle = () => {
        if (autoCollapseTimer.current) { clearTimeout(autoCollapseTimer.current); autoCollapseTimer.current = null }
        setUserInteracted(true)
        setIsExpanded(prev => !prev)
    }

    const category = toolName.split('.')[0] ?? toolName
    const action = toolName.split('.').slice(1).join('.')
    const hint = getHeaderHint(toolName, args)

    const hitlPending = hitl?.status === 'pending'
    const statusIcon = hitlPending
        ? <User className="h-3 w-3 text-amber-400 animate-pulse" />
        : isRunning
        ? <Loader2 className="h-3 w-3 animate-spin text-accent/70" />
        : result?.success
            ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            : <XCircle className="h-3 w-3 text-red-400" />

    const hasArgs = Object.entries(args).filter(([k]) => !SKIP_KEYS.has(k)).length > 0
    const hasDetails = hasArgs || result !== undefined || !!hitl

    return (
        <TimelineBadge
            type="tool"
            bare
            open={isExpanded}
            onToggle={toggle}
            hasDetails={hasDetails}
            statusIcon={statusIcon}
            label={<>
                <CategoryIcon category={category} />
                <span className={`flex gap-0.5 min-w-0${toolName.startsWith('agent.') ? ' flex-wrap items-start' : ' items-baseline'}`}>
                    <span className="text-muted-foreground/80 shrink-0">{category}</span>
                    {action && (
                        <>
                            <span className="text-muted-foreground/60">.</span>
                            <span className="text-foreground/70 shrink-0">{action}</span>
                        </>
                    )}
                    {hint && (
                        <span className={`text-muted-foreground/45 ml-1 font-mono text-[10px]${toolName.startsWith('agent.') ? ' whitespace-pre-wrap break-words' : ' truncate max-w-[200px]'}`}>{hint}</span>
                    )}
                </span>
            </>}
        >
            {hasArgs && <InputSection toolName={toolName} args={args} />}

            {hitl && (
                <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70">Approval</div>
                    <div className={`flex items-center gap-1.5 text-[11px] ${
                        hitl.status === 'approved' ? 'text-emerald-400' : hitl.status === 'denied' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                        {hitl.status === 'approved' ? <CheckCircle2 className="h-3 w-3" /> : hitl.status === 'denied' ? <XCircle className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                        <span className="font-medium capitalize">{hitl.status}</span>
                        {hitl.risk_level && <span className="text-muted-foreground/70 text-[10px]">({hitl.risk_level} risk)</span>}
                    </div>
                    {hitl.action_summary && <p className="text-[10px] text-muted-foreground/60">{hitl.action_summary}</p>}
                    {hitl.resolution_note && <p className="text-[10px] text-muted-foreground/70 italic">{hitl.resolution_note}</p>}
                </div>
            )}

            {result !== undefined && (
                <div className="space-y-1.5">
                    <div className={`text-[10px] uppercase tracking-wide font-medium ${result.success ? 'text-muted-foreground/70' : 'text-red-400/70'}`}>
                        {result.success ? 'Output' : 'Error'}
                    </div>
                    {result.success
                        ? <SmartOutput toolName={toolName} output={result.output} />
                        : <span className="break-words text-[11px] text-red-400">{result.error ?? 'Unknown error'}</span>
                    }
                </div>
            )}
        </TimelineBadge>
    )
}
