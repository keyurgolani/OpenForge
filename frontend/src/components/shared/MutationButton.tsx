/**
 * MutationButton - Button with loading/error states
 *
 * A button component that handles mutation states consistently.
 * Shows loading spinner during mutations and disables when loading.
 *
 * Usage:
 *   <MutationButton
 *     isPending={isCreating}
 *     onClick={() => createItem(data)}
 *   >
 *     Create Item
 *   </MutationButton>
 */

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface MutationButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Loading state */
  isPending: boolean;
  /** Error state (changes styling) */
  isError?: boolean;
  /** Success state (changes styling) */
  isSuccess?: boolean;
  /** Icon to show when not loading */
  icon?: ReactNode;
  /** Icon to show on success */
  successIcon?: ReactNode;
  /** Variant styling */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Children */
  children: ReactNode;
}

export function MutationButton({
  isPending,
  isError,
  isSuccess,
  icon,
  successIcon,
  variant = 'primary',
  size = 'md',
  children,
  className,
  disabled,
  ...props
}: MutationButtonProps) {
  const variantStyles = {
    primary: 'bg-accent text-accent-foreground hover:bg-accent/90',
    secondary: 'bg-muted/60 text-foreground hover:bg-muted/80 border border-border/60',
    danger: 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25',
    ghost: 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
  };

  const sizeStyles = {
    sm: 'h-7 px-2.5 text-xs gap-1.5',
    md: 'h-9 px-4 text-sm gap-2',
    lg: 'h-11 px-6 text-base gap-2.5',
  };

  const showSuccessIcon = isSuccess && successIcon;
  const showIcon = showSuccessIcon || (icon && !isPending);

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg transition-all',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        isError && 'ring-1 ring-red-500/30',
        isSuccess && 'ring-1 ring-emerald-500/30',
        className
      )}
      disabled={disabled || isPending}
      {...props}
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        showIcon && (
          <span className={cn(isSuccess && 'text-emerald-400')}>
            {showSuccessIcon || icon}
          </span>
        )
      )}
      {children}
    </button>
  );
}

export default MutationButton;
