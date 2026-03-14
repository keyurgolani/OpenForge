/**
 * Frontend Configuration
 *
 * Centralizes all environment and configuration access for the frontend.
 * No component should read raw env values directly.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || '';

export const config = {
  /**
   * Base URL for API requests
   */
  apiBaseUrl: API_BASE_URL,

  /**
   * Base URL for WebSocket connections
   */
  wsBaseUrl: WS_BASE_URL,

  /**
   * Whether the app is running in development mode
   */
  isDev: import.meta.env.DEV,

  /**
   * Whether the app is running in production mode
   */
  isProd: import.meta.env.PROD,

  /**
   * Current environment mode
   */
  mode: import.meta.env.MODE,
} as const;

/**
 * Get the full API URL for a given path
 */
export function getApiUrl(path: string): string {
  const base = API_BASE_URL || '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * Get the full WebSocket URL for a given path
 */
export function getWsUrl(path: string): string {
  const base = WS_BASE_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export default config;
