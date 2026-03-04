import { cn } from '@/lib/utils'
import type { ReactNode, CSSProperties } from 'react'

interface GlassPanelProps {
    children: ReactNode
    className?: string
    style?: CSSProperties
    hover?: boolean
    padding?: 'none' | 'sm' | 'md' | 'lg'
    onClick?: () => void
}

const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
}

export default function GlassPanel({
    children,
    className,
    style,
    hover = false,
    padding = 'md',
    onClick,
}: GlassPanelProps) {
    return (
        <div
            className={cn(
                'glass-card',
                hover && 'glass-card-hover cursor-pointer',
                paddings[padding],
                className,
            )}
            style={style}
            onClick={onClick}
        >
            {children}
        </div>
    )
}
