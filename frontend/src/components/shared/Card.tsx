/**
 * Card - Standard card component
 *
 * A container component for grouping related content with consistent styling.
 */

import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Use glass-card styling */
  glass?: boolean;
  /** Add hover effects */
  hover?: boolean;
  /** Make card clickable */
  interactive?: boolean;
  /** Padding variant */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** HTML element to render as */
  as?: 'div' | 'article' | 'section';
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  children,
  className,
  glass = false,
  hover = false,
  interactive = false,
  padding = 'md',
  as: Component = 'div',
}: CardProps) {
  return (
    <Component
      className={cn(
        'rounded-xl border border-border/60',
        glass ? 'glass-card' : 'bg-card/50',
        paddingStyles[padding],
        hover && 'hover:border-border/80 hover:bg-card/70 transition-colors',
        interactive && 'cursor-pointer hover:border-accent/30 hover:bg-accent/5 transition-all',
        className
      )}
    >
      {children}
    </Component>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function CardTitle({ children, className, as: Component = 'h3' }: CardTitleProps) {
  return (
    <Component className={cn('text-lg font-semibold', className)}>
      {children}
    </Component>
  );
}

interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function CardDescription({ children, className }: CardDescriptionProps) {
  return (
    <p className={cn('text-sm text-muted-foreground mt-1', className)}>
      {children}
    </p>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={className}>{children}</div>;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn('mt-4 pt-4 border-t border-border/40', className)}>
      {children}
    </div>
  );
}

export default Card;
