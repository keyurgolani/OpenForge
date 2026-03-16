import React from 'react'
import {
    Brain, Folder, Briefcase, Microscope, BookOpen, Target, Globe, Lightbulb,
    Wrench, Palette, BarChart3, Rocket, Shield, FlaskConical, Leaf, Key,
    Settings2, PenLine, Database, Sprout, FolderOpen, Bot, FileText, Terminal,
    GitBranch,
} from 'lucide-react'
import type { SettingsTab, ModelQuality, VramTier, LocalModel, CLIPModelInfo, LogLevel } from './types'

// ── Provider registry ────────────────────────────────────────────────────────
export const PROVIDER_META: Record<string, {
    name: string; color: string
    needsKey: boolean; needsUrl: boolean; placeholder: string; urlPlaceholder?: string
}> = {
    openai: { name: 'OpenAI', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300', needsKey: true, needsUrl: false, placeholder: 'sk-proj-…' },
    anthropic: { name: 'Anthropic', color: 'bg-orange-500/10 border-orange-500/20 text-orange-300', needsKey: true, needsUrl: false, placeholder: 'sk-ant-…' },
    gemini: { name: 'Google Gemini', color: 'bg-blue-500/10 border-blue-500/20 text-blue-300', needsKey: true, needsUrl: false, placeholder: 'AIza…' },
    groq: { name: 'Groq', color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300', needsKey: true, needsUrl: false, placeholder: 'gsk_…' },
    deepseek: { name: 'DeepSeek', color: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300', needsKey: true, needsUrl: false, placeholder: 'sk-…' },
    mistral: { name: 'Mistral AI', color: 'bg-purple-500/10 border-purple-500/20 text-purple-300', needsKey: true, needsUrl: false, placeholder: 'Key…' },
    openrouter: { name: 'OpenRouter', color: 'bg-pink-500/10 border-pink-500/20 text-pink-300', needsKey: true, needsUrl: false, placeholder: 'sk-or-…' },
    xai: { name: 'xAI (Grok)', color: 'bg-gray-500/10 border-gray-500/20 text-gray-300', needsKey: true, needsUrl: false, placeholder: 'xai-…' },
    cohere: { name: 'Cohere', color: 'bg-teal-500/10 border-teal-500/20 text-teal-300', needsKey: true, needsUrl: false, placeholder: 'API key…' },
    zhipuai: { name: 'Z.AI (ZhipuAI)', color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300', needsKey: true, needsUrl: false, placeholder: 'API key…' },
    huggingface: { name: 'HuggingFace', color: 'bg-orange-400/10 border-orange-400/20 text-orange-200', needsKey: true, needsUrl: false, placeholder: 'hf_…' },
    ollama: { name: 'Ollama', color: 'bg-lime-500/10 border-lime-500/20 text-lime-300', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'http://localhost:11434' },
    'custom-openai': { name: 'Custom OpenAI-compatible', color: 'bg-violet-500/10 border-violet-500/20 text-violet-300', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'https://your-api.com' },
    'custom-anthropic': { name: 'Custom Anthropic-compat.', color: 'bg-rose-500/10 border-rose-500/20 text-rose-300', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'https://your-api.com' },
}
export const PROVIDER_NAMES = Object.keys(PROVIDER_META)

// ── Workspace Icon Registry ─────────────────────────────────────────────────────
export const WORKSPACE_ICONS = {
    'brain': Brain, 'folder': Folder, 'briefcase': Briefcase, 'microscope': Microscope,
    'book-open': BookOpen, 'target': Target, 'globe': Globe, 'lightbulb': Lightbulb,
    'wrench': Wrench, 'palette': Palette, 'bar-chart-3': BarChart3, 'rocket': Rocket,
    'shield': Shield, 'flask-conical': FlaskConical, 'leaf': Leaf, 'key': Key,
    'settings-2': Settings2, 'pen-line': PenLine, 'database': Database, 'sprout': Sprout,
} as const
export type WorkspaceIconName = keyof typeof WORKSPACE_ICONS
export const WORKSPACE_ICON_NAMES = Object.keys(WORKSPACE_ICONS) as WorkspaceIconName[]

export function getWorkspaceIcon(iconName: string | null): React.ReactNode {
    if (!iconName) return React.createElement(FolderOpen, { className: 'w-4 h-4 text-accent' })
    const IconComponent = WORKSPACE_ICONS[iconName as WorkspaceIconName]
    if (!IconComponent) return React.createElement(FolderOpen, { className: 'w-4 h-4 text-accent' })
    return React.createElement(IconComponent, { className: 'w-4 h-4' })
}

// ── Prompts sub-tabs ────────────────────────────────────────────────────────
export const PROMPTS_SUB_TABS: Array<{ id: 'agent' | 'knowledge' | 'extraction'; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'agent', label: 'Agent Prompts', icon: Bot },
    { id: 'knowledge', label: 'Knowledge Intelligence', icon: Brain },
    { id: 'extraction', label: 'Content Extraction', icon: FileText },
]

// ── Model quality & VRAM colors ─────────────────────────────────────────────
export const QUALITY_COLORS: Record<ModelQuality, string> = {
    Fast: 'bg-lime-500/15 text-lime-300 border-lime-500/30',
    Balanced: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    Best: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
}

export const VRAM_TIER_COLORS: Record<VramTier, string> = {
    '≤2GB': 'bg-lime-500/10 text-lime-300 border-lime-500/25',
    '≤4GB': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    '≤8GB': 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
    '≤16GB': 'bg-blue-500/10 text-blue-300 border-blue-500/25',
    '32GB+': 'bg-violet-500/10 text-violet-300 border-violet-500/25',
}

// ── Recommended embedding models ────────────────────────────────────────────
export const RECOMMENDED_EMBEDDING_MODELS: LocalModel[] = [
    { id: 'all-MiniLM-L6-v2', name: 'all-MiniLM-L6-v2', diskSize: '80 MB', vramReq: '<1 GB', dims: 384, quality: 'Fast', desc: 'Lightweight and fast. Great for real-time search with minimal resource usage.', recommendedFor: ['≤2GB', '≤4GB'] },
    { id: 'all-MiniLM-L12-v2', name: 'all-MiniLM-L12-v2', diskSize: '120 MB', vramReq: '<1 GB', dims: 384, quality: 'Fast', desc: 'Slightly deeper variant of L6. Better semantic accuracy at similar speed.', recommendedFor: ['≤2GB', '≤4GB'] },
    { id: 'BAAI/bge-small-en-v1.5', name: 'BGE Small EN v1.5', diskSize: '130 MB', vramReq: '<1 GB', dims: 384, quality: 'Fast', desc: 'State-of-the-art compact model by BAAI. Excellent accuracy for its size.', recommendedFor: ['≤2GB', '≤4GB'] },
    { id: 'intfloat/e5-small-v2', name: 'E5 Small v2', diskSize: '130 MB', vramReq: '<1 GB', dims: 384, quality: 'Fast', desc: 'Compact E5 model. Good quality-to-size ratio for resource-constrained systems.', recommendedFor: ['≤2GB', '≤4GB'] },
    { id: 'BAAI/bge-base-en-v1.5', name: 'BGE Base EN v1.5', diskSize: '440 MB', vramReq: '~1 GB', dims: 768, quality: 'Balanced', desc: 'Excellent retrieval performance. Recommended for most production deployments.', recommendedFor: ['≤4GB', '≤8GB'] },
    { id: 'all-mpnet-base-v2', name: 'all-mpnet-base-v2', diskSize: '420 MB', vramReq: '~1 GB', dims: 768, quality: 'Balanced', desc: 'Top-quality SBERT model. Best semantic search accuracy among base models.', recommendedFor: ['≤4GB', '≤8GB'] },
    { id: 'nomic-ai/nomic-embed-text-v1', name: 'Nomic Embed Text v1', diskSize: '540 MB', vramReq: '~2 GB', dims: 768, quality: 'Balanced', desc: 'Optimized for long documents. Excels at knowledge retrieval tasks.', recommendedFor: ['≤8GB'] },
    { id: 'intfloat/e5-base-v2', name: 'E5 Base v2', diskSize: '440 MB', vramReq: '~1 GB', dims: 768, quality: 'Balanced', desc: 'Strong retrieval performance in the E5 model family.', recommendedFor: ['≤4GB', '≤8GB'] },
    { id: 'thenlper/gte-base', name: 'GTE Base', diskSize: '440 MB', vramReq: '~1 GB', dims: 768, quality: 'Balanced', desc: 'General Text Embeddings from Alibaba DAMO. Competitive accuracy.', recommendedFor: ['≤8GB'] },
    { id: 'BAAI/bge-large-en-v1.5', name: 'BGE Large EN v1.5', diskSize: '1.3 GB', vramReq: '~3 GB', dims: 1024, quality: 'Best', desc: 'Highest quality BGE model. Best for accuracy-critical scenarios.', recommendedFor: ['≤8GB', '≤16GB'] },
    { id: 'intfloat/e5-large-v2', name: 'E5 Large v2', diskSize: '1.3 GB', vramReq: '~3 GB', dims: 1024, quality: 'Best', desc: 'Best quality in the E5 family. Top performance on retrieval benchmarks.', recommendedFor: ['≤16GB', '32GB+'] },
]

// ── Recommended Whisper models ──────────────────────────────────────────────
export const RECOMMENDED_WHISPER_MODELS: LocalModel[] = [
    { id: 'openai/whisper-tiny', name: 'Whisper Tiny', diskSize: '75 MB', vramReq: '<1 GB', quality: 'Fast', desc: 'Fastest transcription. Suitable for low-resource machines or quick drafts.', recommendedFor: ['≤2GB'] },
    { id: 'openai/whisper-base', name: 'Whisper Base', diskSize: '145 MB', vramReq: '<1 GB', quality: 'Fast', desc: 'Small and fast. Good accuracy for clear audio in quiet environments.', recommendedFor: ['≤2GB', '≤4GB'] },
    { id: 'openai/whisper-small', name: 'Whisper Small', diskSize: '460 MB', vramReq: '~2 GB', quality: 'Balanced', desc: 'Good balance of speed and accuracy. Best all-round choice for most use cases.', recommendedFor: ['≤4GB', '≤8GB'] },
    { id: 'openai/whisper-medium', name: 'Whisper Medium', diskSize: '1.5 GB', vramReq: '~5 GB', quality: 'Balanced', desc: 'High accuracy. Handles challenging audio, accents, and background noise well.', recommendedFor: ['≤8GB'] },
    { id: 'openai/whisper-large-v2', name: 'Whisper Large v2', diskSize: '3.1 GB', vramReq: '~10 GB', quality: 'Best', desc: 'Near human-level transcription accuracy. Proven production model.', recommendedFor: ['≤16GB'] },
    { id: 'openai/whisper-large-v3', name: 'Whisper Large v3', diskSize: '3.1 GB', vramReq: '~10 GB', quality: 'Best', desc: 'Latest Whisper model. Highest accuracy across languages and audio conditions.', recommendedFor: ['≤16GB', '32GB+'] },
]

// ── Recommended CLIP models ─────────────────────────────────────────────────
export const RECOMMENDED_CLIP_MODELS: CLIPModelInfo[] = [
    { id: 'clip-ViT-B-16', name: 'CLIP ViT-B/16', diskSize: '600 MB', vramReq: '~1 GB', dimension: 512, quality: 'Balanced', desc: 'Higher resolution variant of the base model. Better at fine-grained visual details.', recommendedFor: ['≤4GB', '≤8GB'] },
    { id: 'clip-ViT-B-32', name: 'CLIP ViT-B/32', diskSize: '600 MB', vramReq: '<1 GB', dimension: 512, quality: 'Fast', desc: 'Default model. Fast and memory-efficient, good for most image search use cases.', recommendedFor: ['≤2GB', '≤4GB'] },
    { id: 'clip-ViT-L-14', name: 'CLIP ViT-L/14', diskSize: '1.7 GB', vramReq: '~3 GB', dimension: 768, quality: 'Best', desc: 'Largest CLIP model. Best visual understanding and search accuracy.', recommendedFor: ['≤8GB', '≤16GB'] },
]

// ── Risk styles ─────────────────────────────────────────────────────────────
export const RISK_STYLES: Record<string, string> = {
    low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    high: 'bg-red-500/10 text-red-400 border-red-500/20',
    critical: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

// ── Category icons for tools ────────────────────────────────────────────────
export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    filesystem: React.createElement(FolderOpen, { className: 'w-4 h-4' }),
    http: React.createElement(Globe, { className: 'w-4 h-4' }),
    shell: React.createElement(Terminal, { className: 'w-4 h-4' }),
    memory: React.createElement(Brain, { className: 'w-4 h-4' }),
    git: React.createElement(GitBranch, { className: 'w-4 h-4' }),
    task: React.createElement(Target, { className: 'w-4 h-4' }),
    language: React.createElement(FileText, { className: 'w-4 h-4' }),
    skills: React.createElement(Wrench, { className: 'w-4 h-4' }),
    agent: React.createElement(Bot, { className: 'w-4 h-4' }),
    workspace: React.createElement(FolderOpen, { className: 'w-4 h-4' }),
}

// ── Task label registry ─────────────────────────────────────────────────────
export const TASK_LABELS: Record<string, string> = {
    embed_knowledge: 'Embed Knowledge',
    generate_knowledge_intelligence: 'Generate Knowledge Intelligence',
    extract_bookmark_content: 'Extract Bookmark Content',
    extract_url_content: 'Extract URL Content',
    extract_attachment_content: 'Extract Attachment Content',
    generate_titles: 'Generate Titles',
    extract_insights: 'Extract Insights',
    scrape_bookmarks: 'Scrape Bookmarks',
    cleanup_embeddings: 'Clean Up Embeddings',
    purge_chat_trash: 'Purge Chat Trash',
    summarize_knowledge: 'Summarize Knowledge',
    extract_knowledge_insights: 'Extract Knowledge Insights',
    generate_knowledge_title: 'Generate Knowledge Title',
}

// ── Schedule constants ──────────────────────────────────────────────────────
export const INTERVAL_OPTS = [
    { value: 1, label: 'Every hour' },
    { value: 6, label: 'Every 6 hours' },
    { value: 12, label: 'Every 12 hours' },
    { value: 24, label: 'Daily' },
    { value: 48, label: 'Every 2 days' },
    { value: 168, label: 'Weekly' },
]

export const TARGET_SCOPE_OPTS = [
    { value: 'remaining', label: 'Remaining targets' },
    { value: 'all', label: 'All targets' },
    { value: 'one', label: 'One target' },
]

export const CATEGORY_LABELS: Record<string, string> = {
    indexing: 'Indexing',
    intelligence: 'AI Intelligence',
    maintenance: 'Maintenance',
}

export const AUTO_KNOWLEDGE_INTELLIGENCE_KEY = 'automation.auto_knowledge_intelligence_enabled'
export const AUTO_BOOKMARK_EXTRACTION_KEY = 'automation.auto_bookmark_content_extraction_enabled'
export const CHAT_TRASH_RETENTION_KEY = 'chat.trash_retention_days'
export const DEFAULT_CHAT_TRASH_RETENTION_DAYS = 30
export const MIN_CHAT_TRASH_RETENTION_DAYS = 1
export const MAX_CHAT_TRASH_RETENTION_DAYS = 365

// ── Log level constants ─────────────────────────────────────────────────────
export const ANSI_ESCAPE_REGEX = /\x1B\[[0-9;]*[mK]/g
export const stripAnsiCodes = (value: string) => value.replace(ANSI_ESCAPE_REGEX, '')

export const getLogLevel = (value: string): LogLevel => {
    const text = stripAnsiCodes(value).toLowerCase()
    if (/(^|\b)(panic|fatal|error|err|exception|traceback)(\b|:)/.test(text)) return 'error'
    if (/(^|\b)(warn|warning)(\b|:)/.test(text)) return 'warn'
    if (/(^|\b)(debug)(\b|:)/.test(text)) return 'debug'
    if (/(^|\b)(trace)(\b|:)/.test(text)) return 'trace'
    if (/(^|\b)(info|notice)(\b|:)/.test(text)) return 'info'
    return 'unknown'
}

export const LOG_LEVEL_OPTIONS: Array<{ value: 'all' | LogLevel; label: string }> = [
    { value: 'all', label: 'All levels' },
    { value: 'error', label: 'Error' },
    { value: 'warn', label: 'Warn' },
    { value: 'info', label: 'Info' },
    { value: 'debug', label: 'Debug' },
    { value: 'trace', label: 'Trace' },
    { value: 'unknown', label: 'Unknown' },
]

export const LOG_LEVEL_CLASS: Record<LogLevel, string> = {
    error: 'bg-red-500/15 border-red-400/30 text-red-300',
    warn: 'bg-amber-500/15 border-amber-300/35 text-amber-200',
    info: 'bg-blue-500/15 border-blue-300/35 text-blue-200',
    debug: 'bg-cyan-500/15 border-cyan-300/35 text-cyan-200',
    trace: 'bg-purple-500/15 border-purple-300/35 text-purple-200',
    unknown: 'bg-muted/60 border-border/60 text-muted-foreground',
}

// ── Permission options ──────────────────────────────────────────────────────
export const PERMISSION_OPTIONS = [
    { value: 'default', label: 'Default', active: 'text-muted-foreground bg-muted/30 ring-1 ring-border/50', inactive: 'text-muted-foreground/40' },
    { value: 'allowed', label: 'Allowed', active: 'text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/30', inactive: 'text-muted-foreground/40' },
    { value: 'hitl', label: 'Approval', active: 'text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/30', inactive: 'text-muted-foreground/40' },
    { value: 'blocked', label: 'Blocked', active: 'text-red-400 bg-red-500/10 ring-1 ring-red-500/30', inactive: 'text-muted-foreground/40' },
] as const

// ── MCP constants ───────────────────────────────────────────────────────────
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical']
export const RISK_BADGE: Record<string, string> = {
    low: 'bg-green-500/15 text-green-300 border-green-500/30',
    medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    critical: 'bg-red-500/15 text-red-300 border-red-500/30',
}

export const EMPTY_MCP_FORM = {
    name: '', url: '', description: '', transport: 'http',
    auth_type: 'none', auth_value: '', is_enabled: true, default_risk_level: 'high',
}

// ── Settings tabs ───────────────────────────────────────────────────────────
export const SETTINGS_TABS: SettingsTab[] = ['workspaces', 'llm', 'prompts', 'policies', 'approvals', 'jobs', 'skills', 'mcp', 'audit', 'export', 'import']

export const toSettingsTab = (value: string | null): SettingsTab => {
    const normalized = value === 'schedules'
        ? 'jobs'
        : value === 'tools'
            ? 'policies'
            : value === 'hitl'
                ? 'approvals'
                : value
    return SETTINGS_TABS.includes(normalized as SettingsTab) ? (normalized as SettingsTab) : 'workspaces'
}
