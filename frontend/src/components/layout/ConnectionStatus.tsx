/**
 * ConnectionStatus - WebSocket connection indicator
 *
 * Displays a visual indicator for WebSocket connection status.
 * Green when connected, amber when reconnecting.
 */

import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  isConnected: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Show as a badge with text */
  showLabel?: boolean;
  className?: string;
}

export function ConnectionStatus({
  isConnected,
  size = 'sm',
  showLabel = false,
  className,
}: ConnectionStatusProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
  };

  const statusColor = isConnected ? 'bg-emerald-400' : 'bg-amber-400';
  const statusTitle = isConnected ? 'Connected' : 'Reconnecting…';

  if (showLabel) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs',
          isConnected ? 'text-emerald-400' : 'text-amber-400',
          className
        )}
      >
        <span
          className={cn(
            'rounded-full flex-shrink-0',
            sizeClasses[size],
            statusColor,
            !isConnected && 'animate-pulse'
          )}
          title={statusTitle}
        />
        <span>{statusTitle}</span>
      </div>
    );
  }

  return (
    <span
      className={cn(
        'rounded-full flex-shrink-0',
        sizeClasses[size],
        statusColor,
        className
      )}
      title={statusTitle}
    />
  );
}

export default ConnectionStatus;
