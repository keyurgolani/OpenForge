import { cn } from '@/lib/utils'
import { motion, HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'

interface GlassPanelProps extends HTMLMotionProps<"div"> {
    children: ReactNode
    className?: string
    hover?: boolean
    padding?: 'none' | 'sm' | 'md' | 'lg'
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
    hover = false,
    padding = 'md',
    ...props
}: GlassPanelProps) {
    return (
        <motion.div
            className={cn(
                'glass-card relative overflow-hidden',
                hover && 'glass-card-hover cursor-pointer',
                paddings[padding],
                className,
            )}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                type: 'spring',
                stiffness: 400,
                damping: 30,
            }}
            whileHover={hover ? { scale: 1.01, y: -2 } : {}}
            whileTap={hover ? { scale: 0.98 } : {}}
            {...props}
        >
            {/* Inner ambient glow line for thickness simulation */}
            <div className="absolute inset-0 pointer-events-none rounded-[inherit] border border-white/5 mix-blend-overlay" />
            {children}
        </motion.div>
    )
}
