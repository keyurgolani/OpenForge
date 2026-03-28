/**
 * Badge - Generic badge component with variants
 *
 * Use this component for status indicators, counts, and labels.
 */

import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'outline' | 'muted';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  /** Icon to display before the label */
  icon?: React.ReactNode;
  /** Remove rounded corners */
  square?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-muted/60 text-foreground border-border/20',
  accent: 'bg-accent/15 text-accent border-accent/30',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  danger: 'bg-red-500/15 text-red-400 border-red-500/25',
  outline: 'bg-transparent text-foreground border-border',
  muted: 'bg-muted/30 text-muted-foreground border-border/20',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
  lg: 'text-sm px-2.5 py-1',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className,
  icon,
  square = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium border rounded-full',
        variantStyles[variant],
        sizeStyles[size],
        square && 'rounded-md',
        className
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
}

export default Badge;
