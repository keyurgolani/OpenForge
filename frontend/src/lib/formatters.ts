/**
 * Data Formatting Utilities
 *
 * Provides consistent formatting for dates, numbers, and other data types.
 */

/**
 * Format a date as a relative time string (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(d);
}

/**
 * Format a date as a short date string (e.g., "Mar 14, 2026")
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date as a datetime string (e.g., "Mar 14, 2026, 2:30 PM")
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '';
  return num.toLocaleString();
}

/**
 * Format bytes as a human-readable size
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);

  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format a duration in milliseconds as a human-readable string
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '';

  if (ms < 1000) return `${ms}ms`;

  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;

  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  if (mins < 60) return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Capitalize the first letter of a string
 */
export function capitalize(str: string | null | undefined): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
