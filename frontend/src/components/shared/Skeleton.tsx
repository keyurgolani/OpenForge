/**
 * Skeleton - Loading placeholder component
 *
 * Use this component to display loading placeholders while content is being fetched.
 */

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  /** Animation variant */
  variant?: 'pulse' | 'shimmer' | 'none';
}

export function Skeleton({ className, variant = 'pulse' }: SkeletonProps) {
  const animationClass = {
    pulse: 'animate-pulse',
    shimmer: 'animate-shimmer',
    none: '',
  }[variant];

  return (
    <div
      className={cn(
        'rounded-md bg-muted/50',
        animationClass,
        className
      )}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
  lineClassName?: string;
}

export function SkeletonText({ lines = 3, className, lineClassName }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 ? 'w-3/4' : 'w-full',
            lineClassName
          )}
        />
      ))}
    </div>
  );
}

interface SkeletonListProps {
  count?: number;
  itemClassName?: string;
  className?: string;
}

export function SkeletonList({ count = 5, itemClassName, className }: SkeletonListProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('flex items-center gap-3', itemClassName)}>
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
