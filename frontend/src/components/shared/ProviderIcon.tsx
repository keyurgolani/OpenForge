/**
 * ProviderIcon — renders a consistent Lucide icon for each LLM provider.
 * Used in OnboardingPage, SettingsPage, and anywhere a provider needs visual identity.
 */
import {
    Bot, Brain, Sparkles, Zap, Globe, Wind, Shuffle, X,
    Waves, Building2, Heart, Server, Plug, Wrench, HelpCircle, HardDrive
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'

export const PROVIDER_ICONS: Record<string, React.ComponentType<LucideProps>> = {
    openai: Bot,
    anthropic: Brain,
    gemini: Sparkles,
    groq: Zap,
    deepseek: Globe,
    mistral: Wind,
    openrouter: Shuffle,
    xai: X,
    cohere: Waves,
    zhipuai: Building2,
    huggingface: Heart,
    ollama: Server,
    'openforge-local': HardDrive,
    'custom-openai': Plug,
    'custom-anthropic': Wrench,
}

export function ProviderIcon({
    providerId,
    className = 'w-4 h-4',
    ...props
}: { providerId: string; className?: string } & Omit<LucideProps, 'ref'>) {
    const Icon = PROVIDER_ICONS[providerId] ?? HelpCircle
    return <Icon className={className} {...props} />
}
